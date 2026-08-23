import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
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
import { MatchError, decodeError } from './errors.js';
import type { MatchDO } from './match-do.js';
import type {
  ProgressResponse,
  TrainerAttemptResponse,
  TrainerProblemResponse,
} from '@bg/protocol';
import { logFailure, observability } from './observability.js';
import { loadProgress, newPlayerToken, playerKey, recentGames } from './players.js';
import { rateLimit } from './rate-limit.js';
import { loadAttempts, recordAttempt } from './trainer.js';
import {
  createMatchSchema,
  cubeCommandSchema,
  hintLevelSchema,
  parse,
  parseBody,
  submitTurnSchema,
  trainerAttemptSchema,
} from './validation.js';

export { MatchDO } from './match-do.js';

const app = new Hono<{ Bindings: Env; Variables: { requestId: string } }>();

function stub(env: Env, matchId: string): DurableObjectStub<MatchDO> {
  return env.MATCH.get(env.MATCH.idFromName(matchId));
}

function token(header: string | undefined): string {
  if (!header) throw new MatchError('missing player token', 401);
  return header;
}

app.onError((error, c) => {
  logFailure(c.get('requestId') ?? 'unknown', error);
  const { code, status, message } = decodeError(error);
  return c.json({ error: message, code }, status as 400);
});

app.use('*', observability());

// The app loads no third-party script, style or frame, so the policy can be as
// tight as the browser allows. `unsafe-inline` remains on styles only: React
// sets style attributes on the board's SVG.
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    referrerPolicy: 'strict-origin-when-cross-origin',
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
  }),
);

// Creating a match is cheap but unauthenticated, so it is the endpoint an
// abuser would use to mint unlimited identities; the per-turn limit is looser
// because a real game is a steady trickle of requests.
app.use('/api/matches', rateLimit((env) => env.MATCH_CREATE_LIMIT, 60));
app.use('/api/matches/*', rateLimit((env) => env.MATCH_LIMIT, 60));
app.use('/api/trainer/*', rateLimit((env) => env.TRAINER_LIMIT, 60));

app.post('/api/matches', async (c) => {
  const body = await parseBody(createMatchSchema, c.req.raw);
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
  const { moves } = await parseBody(submitTurnSchema, c.req.raw);
  const view = await stub(c.env, c.req.param('id')).submitTurn(token(c.req.header('x-player-token')), moves);
  return c.json(view);
});

app.post('/api/matches/:id/cube', async (c) => {
  const { action } = await parseBody(cubeCommandSchema, c.req.raw);
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
  const level = parse(hintLevelSchema, c.req.query('level') ?? '1');
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
  const body = await parseBody(trainerAttemptSchema, c.req.raw);

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

app.all('/api/*', (c) => c.json({ error: 'not found', code: 'not_found' }, 404));

// Everything else is the single-page app, served from the same Worker so there
// is no CORS surface and one deploy ships both halves.
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
