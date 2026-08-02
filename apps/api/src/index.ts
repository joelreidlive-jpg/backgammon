import { Hono } from 'hono';
import type { Move } from '@bg/rules';
import type { HintLevel } from '@bg/coach';
import { MatchError } from './match-do.js';
import type { MatchDO } from './match-do.js';
import type { CreateMatchRequest, CubeCommand } from '@bg/protocol';

export { MatchDO } from './match-do.js';

const app = new Hono<{ Bindings: Env }>();

const CUBE_COMMANDS: readonly CubeCommand[] = ['double', 'take', 'drop'];

function stub(env: Env, matchId: string): DurableObjectStub<MatchDO> {
  return env.MATCH.get(env.MATCH.idFromName(matchId));
}

function token(header: string | undefined): string {
  if (!header) throw new MatchError('missing player token', 401);
  return header;
}

app.onError((error, c) => {
  if (error instanceof MatchError) return c.json({ error: error.message }, error.status as 400);
  // Durable Object RPC rethrows on the client side as a plain Error, so match
  // the status back out of the message rather than losing it.
  const message = error.message || 'internal error';
  const status = /not found/.test(message) ? 404 : /not your|disabled/.test(message) ? 403 : 400;
  return c.json({ error: message }, status);
});

app.post('/api/matches', async (c) => {
  const body = await c.req.json<CreateMatchRequest>().catch(() => ({}) as CreateMatchRequest);
  const matchId = crypto.randomUUID();
  const { playerToken, view } = await stub(c.env, matchId).create(matchId, body);
  return c.json({ playerToken, match: view }, 201);
});

app.get('/api/matches/:id', async (c) => {
  const view = await stub(c.env, c.req.param('id')).get(token(c.req.header('x-player-token')));
  return c.json(view);
});

app.post('/api/matches/:id/roll', async (c) => {
  const view = await stub(c.env, c.req.param('id')).roll(token(c.req.header('x-player-token')));
  return c.json(view);
});

app.post('/api/matches/:id/turn', async (c) => {
  const { moves } = await c.req.json<{ moves: Move[] }>();
  if (!Array.isArray(moves)) throw new MatchError('moves must be an array', 400);
  const view = await stub(c.env, c.req.param('id')).submitTurn(token(c.req.header('x-player-token')), moves);
  return c.json(view);
});

app.post('/api/matches/:id/cube', async (c) => {
  const { action } = await c.req.json<{ action: CubeCommand }>();
  if (!CUBE_COMMANDS.includes(action)) throw new MatchError('unknown cube action', 400);
  const view = await stub(c.env, c.req.param('id')).cube(token(c.req.header('x-player-token')), action);
  return c.json(view);
});

app.post('/api/matches/:id/next-game', async (c) => {
  const view = await stub(c.env, c.req.param('id')).nextGame(token(c.req.header('x-player-token')));
  return c.json(view);
});

app.post('/api/matches/:id/takeback', async (c) => {
  const view = await stub(c.env, c.req.param('id')).takeback(token(c.req.header('x-player-token')));
  return c.json(view);
});

app.get('/api/matches/:id/hint', async (c) => {
  const level = Number(c.req.query('level') ?? '1');
  if (![1, 2, 3, 4].includes(level)) throw new MatchError('level must be 1-4', 400);
  const hint = await stub(c.env, c.req.param('id')).hint(
    token(c.req.header('x-player-token')),
    level as HintLevel,
  );
  return c.json(hint);
});

app.get('/api/matches/:id/history', async (c) => {
  const history = await stub(c.env, c.req.param('id')).history(token(c.req.header('x-player-token')));
  return c.json(history);
});

app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

// Everything else is the single-page app, served from the same Worker so there
// is no CORS surface and one deploy ships both halves.
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
