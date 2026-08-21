import { Hono } from 'hono';
import type { Move } from '@bg/rules';
import {
  CONCEPT_ADVICE,
  PHASE_GUIDANCE,
  type HintLevel,
  coachingPolicy,
  errorRate,
  tierFor,
  trend,
  weakestConcepts,
  weakestPhase,
} from '@bg/coach';
import {
  PROBLEMS,
  type Tier,
  gradeAttempt,
  ladderState,
  load as loadProblem,
  loadById,
  prompt,
  selectProblem,
} from '@bg/trainer';
import { MatchError } from './match-do.js';
import type { MatchDO } from './match-do.js';
import type {
  CreateMatchRequest,
  CubeCommand,
  ProgressResponse,
  TrainerAttemptRequest,
  TrainerAttemptResponse,
  TrainerProblemResponse,
} from '@bg/protocol';
import { loadProgress, newPlayerToken, playerKey, recentGames } from './players.js';
import { loadAttempts, recordAttempt } from './trainer.js';

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
  // A returning player sends the token they already hold, which is what makes
  // progress accumulate across matches rather than resetting each time.
  const playerToken = c.req.header('x-player-token') ?? newPlayerToken();
  const matchId = crypto.randomUUID();
  const { view } = await stub(c.env, matchId).create(matchId, body, {
    token: playerToken,
    key: await playerKey(playerToken),
  });
  return c.json({ playerToken, match: view }, 201);
});

app.get('/api/me/progress', async (c) => {
  const key = await playerKey(token(c.req.header('x-player-token')));
  const progress = await loadProgress(c.env.DB, key);
  const phase = weakestPhase(progress);

  const response: ProgressResponse = {
    progress,
    tier: tierFor(progress.checker),
    errorRate: errorRate({
      decisions: progress.checker.decisions + progress.cube.decisions,
      equityLoss: progress.checker.equityLoss + progress.cube.equityLoss,
    }),
    trend: trend(progress),
    policy: coachingPolicy(progress),
    weakestPhase: phase,
    focus: [
      ...(phase ? [PHASE_GUIDANCE[phase]] : []),
      ...weakestConcepts(progress, 2).map((concept) => CONCEPT_ADVICE[concept]),
    ],
    recentGames: await recentGames(c.env.DB, key),
  };
  return c.json(response);
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

app.get('/api/matches/:id/review', async (c) => {
  const review = await stub(c.env, c.req.param('id')).review(token(c.req.header('x-player-token')));
  return c.json(review);
});

app.get('/api/matches/:id/history', async (c) => {
  const history = await stub(c.env, c.req.param('id')).history(token(c.req.header('x-player-token')));
  return c.json(history);
});

/**
 * The hardest tier the set actually contains. Read from the data rather than
 * fixed at 4, so adding externally verified tier-5 positions extends the
 * ladder without a code change.
 */
const MAX_TIER = PROBLEMS.reduce<Tier>((max, problem) => (problem.tier > max ? problem.tier : max), 1);

app.get('/api/trainer/next', async (c) => {
  // The trainer is reachable without ever having played a match, so it mints
  // the identity if the browser does not have one yet.
  const playerToken = c.req.header('x-player-token') ?? newPlayerToken();
  const key = await playerKey(playerToken);
  const [progress, attempts] = await Promise.all([
    loadProgress(c.env.DB, key),
    loadAttempts(c.env.DB, key),
  ]);

  const ladder = ladderState(attempts, MAX_TIER);
  const weakConcepts = weakestConcepts(progress, 3);
  const problem = selectProblem({ problems: PROBLEMS, attempts, weakConcepts, tier: ladder.tier });

  const response: TrainerProblemResponse = {
    playerToken,
    problem: problem ? prompt(loadProblem(problem)) : null,
    ladder,
    focus: [
      ...(problem ? [PHASE_GUIDANCE[problem.phase]] : []),
      ...weakConcepts.slice(0, 2).map((concept) => CONCEPT_ADVICE[concept]),
    ],
    attempted: attempts.length,
    solved: attempts.filter((attempt) => attempt.solved).length,
  };
  return c.json(response);
});

app.post('/api/trainer/attempt', async (c) => {
  const key = await playerKey(token(c.req.header('x-player-token')));
  const body = await c.req.json<TrainerAttemptRequest>().catch(() => null);
  if (!body || typeof body.problemId !== 'string' || !Array.isArray(body.moves)) {
    throw new MatchError('problemId and moves are required', 400);
  }

  // Grading happens here, from the stored answer, because the client is never
  // sent the answer: it can only submit a play and be told what it cost.
  const problem = loadById(body.problemId);
  if (!problem) throw new MatchError('unknown problem', 404);

  const result = gradeAttempt(problem, body.moves);
  if (!result) throw new MatchError('that is not a legal turn with this roll', 400);

  const attempts = await loadAttempts(c.env.DB, key);
  const before = ladderState(attempts, MAX_TIER);
  const record = await recordAttempt(c.env.DB, key, problem.tier, result);
  const ladder = ladderState([record, ...attempts], MAX_TIER);

  const response: TrainerAttemptResponse = { result, ladder, unlocked: ladder.tier > before.tier };
  return c.json(response);
});

app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

// Everything else is the single-page app, served from the same Worker so there
// is no CORS surface and one deploy ships both halves.
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
