import { Hono, type Context } from 'hono';
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
  CUBE_PROBLEMS,
  PROBLEMS,
  type Tier,
  cubePrompt,
  cubeShare,
  ladderState,
  load as loadProblem,
  loadCubeById,
  prompt,
  selectProblem,
} from '@bg/trainer';
import { createAccount, resolveIdentity, signIn, signOut, type Identity } from './accounts.js';
import { MatchError, decodeError } from './errors.js';
import type { MatchDO } from './match-do.js';
import type {
  AuthResponse,
  ProgressResponse,
  TrainerAttemptResponse,
  TrainerProblemResponse,
  TrainerPrompt,
} from '@bg/protocol';
import { logFailure, observability } from './observability.js';
import { loadProgress, newPlayerToken, recentGames } from './players.js';
import { gradeRequest } from './grading.js';
import { ipKey, rateLimit } from './rate-limit.js';
import { loadAttempts, recordAttempt } from './trainer.js';
import {
  createMatchSchema,
  credentialsSchema,
  cubeCommandSchema,
  hintLevelSchema,
  parse,
  parseBody,
  playerTokenSchema,
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
  const result = playerTokenSchema.safeParse(header);
  if (!result.success) throw new MatchError('malformed player token', 401);
  return result.data;
}

/** The token the caller holds, or a fresh identity if they hold none. */
function tokenOrNew(header: string | undefined): string {
  return header === undefined ? newPlayerToken() : token(header);
}

type Ctx = Context<{ Bindings: Env; Variables: { requestId: string } }>;

/**
 * Who is calling. A session token resolves to its account's progress key, an
 * anonymous token to its own digest, so every route below is written against
 * one identity whether or not the player has signed in.
 */
function whoIs(c: Ctx): Promise<Identity> {
  return resolveIdentity(c.env.DB, token(c.req.header('x-player-token')));
}

/** As `whoIs`, but mints an anonymous identity for a first-time visitor. */
function whoIsOrNew(c: Ctx): Promise<Identity> {
  return resolveIdentity(c.env.DB, tokenOrNew(c.req.header('x-player-token')));
}

/** The caller's progress key, which is also what authorises their match. */
async function keyOf(c: Ctx): Promise<string> {
  return (await whoIs(c)).key;
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
// Sign-in is the one route where a flood is a password-guessing attempt rather
// than a cost problem, so it is the tightest limit of the four.
app.use('/api/auth/*', rateLimit((env) => env.AUTH_LIMIT, 60, ipKey));

app.post('/api/auth/signup', async (c) => {
  const { email, password } = await parseBody(credentialsSchema, c.req.raw);
  // Whatever this browser has already played counts: the anonymous key it holds
  // becomes the account's key, so the first account made here keeps its record.
  const held = c.req.header('x-player-token');
  const anonymous = held === undefined ? null : (await resolveIdentity(c.env.DB, token(held))).key;
  const identity = await createAccount(c.env.DB, email, password, anonymous);
  const response: AuthResponse = { playerToken: identity.token, email: identity.email };
  return c.json(response, 201);
});

app.post('/api/auth/login', async (c) => {
  const { email, password } = await parseBody(credentialsSchema, c.req.raw);
  const identity = await signIn(c.env.DB, email, password);
  const response: AuthResponse = { playerToken: identity.token, email: identity.email };
  return c.json(response);
});

app.post('/api/auth/logout', async (c) => {
  await signOut(c.env.DB, token(c.req.header('x-player-token')));
  return c.body(null, 204);
});

// Who the held token belongs to. Anonymous tokens answer with a null address
// rather than 401: not being signed in is a state, not a failure.
app.get('/api/auth/me', async (c) => {
  const identity = await whoIs(c);
  const response: AuthResponse = { playerToken: identity.token, email: identity.email };
  return c.json(response);
});

app.post('/api/matches', async (c) => {
  const body = await parseBody(createMatchSchema, c.req.raw);
  // A returning player sends the token they already hold, which is what makes
  // progress accumulate across matches rather than resetting each time.
  const identity = await whoIsOrNew(c);
  const matchId = crypto.randomUUID();
  const { view } = await stub(c.env, matchId).create(matchId, body, identity);
  return c.json({ playerToken: identity.token, match: view }, 201);
});

app.get('/api/me/progress', async (c) => {
  const key = await keyOf(c);
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
  const view = await stub(c.env, c.req.param('id')).get(await keyOf(c));
  return c.json(view);
});

app.post('/api/matches/:id/roll', async (c) => {
  const view = await stub(c.env, c.req.param('id')).roll(await keyOf(c));
  return c.json(view);
});

app.post('/api/matches/:id/turn', async (c) => {
  const { moves } = await parseBody(submitTurnSchema, c.req.raw);
  const view = await stub(c.env, c.req.param('id')).submitTurn(await keyOf(c), moves);
  return c.json(view);
});

app.post('/api/matches/:id/opponent', async (c) => {
  const view = await stub(c.env, c.req.param('id')).opponentReply(await keyOf(c));
  return c.json(view);
});

app.post('/api/matches/:id/cube', async (c) => {
  const { action } = await parseBody(cubeCommandSchema, c.req.raw);
  const view = await stub(c.env, c.req.param('id')).cube(await keyOf(c), action);
  return c.json(view);
});

app.post('/api/matches/:id/next-game', async (c) => {
  const view = await stub(c.env, c.req.param('id')).nextGame(await keyOf(c));
  return c.json(view);
});

app.post('/api/matches/:id/takeback', async (c) => {
  const view = await stub(c.env, c.req.param('id')).takeback(await keyOf(c));
  return c.json(view);
});

app.post('/api/matches/:id/play-best', async (c) => {
  const view = await stub(c.env, c.req.param('id')).playBest(await keyOf(c));
  return c.json(view);
});

app.get('/api/matches/:id/hint', async (c) => {
  const level = parse(hintLevelSchema, c.req.query('level') ?? '1');
  const hint = await stub(c.env, c.req.param('id')).hint(await keyOf(c), level as HintLevel);
  return c.json(hint);
});

app.get('/api/matches/:id/review', async (c) => {
  const review = await stub(c.env, c.req.param('id')).review(await keyOf(c));
  return c.json(review);
});

app.get('/api/matches/:id/history', async (c) => {
  const history = await stub(c.env, c.req.param('id')).history(await keyOf(c));
  return c.json(history);
});

/**
 * The hardest tier the set actually contains. Read from the data rather than
 * fixed at 4, so adding externally verified tier-5 positions extends the
 * ladder without a code change.
 */
const MAX_TIER = [...PROBLEMS, ...CUBE_PROBLEMS].reduce<Tier>(
  (max, problem) => (problem.tier > max ? problem.tier : max),
  1,
);

/** Why a cube question is being asked, in the same voice as the phase advice. */
const CUBE_GUIDANCE =
  'Cube decisions swing more equity than checker plays. Count how often you win a gammon here, not just how often you win.';

app.get('/api/trainer/next', async (c) => {
  // The trainer is reachable without ever having played a match, so it mints
  // the identity if the browser does not have one yet.
  const identity = await whoIsOrNew(c);
  const key = identity.key;
  const [progress, attempts] = await Promise.all([
    loadProgress(c.env.DB, key),
    loadAttempts(c.env.DB, key),
  ]);

  const ladder = ladderState(attempts, MAX_TIER);
  const weakConcepts = weakestConcepts(progress, 3);

  // Which sort of question comes next is decided before the position is: the
  // player's cube record is a separate skill from their checker play, and the
  // ladder would never reach the cube if it were a tiebreak between positions.
  const wantsCube = CUBE_PROBLEMS.length > 0 && Math.random() < cubeShare(progress);
  const cube = wantsCube
    ? selectProblem({ problems: CUBE_PROBLEMS, attempts, weakConcepts, tier: ladder.tier })
    : null;
  const loadedCube = cube ? loadCubeById(cube.id) : null;
  // Falling back to a checker problem rather than serving nothing: a cube
  // problem that will not load is a bug in the data, not a reason to leave the
  // player with an empty screen.
  const problem = loadedCube
    ? null
    : selectProblem({ problems: PROBLEMS, attempts, weakConcepts, tier: ladder.tier });

  const asked: TrainerPrompt | null = loadedCube
    ? cubePrompt(loadedCube)
    : problem
      ? prompt(loadProblem(problem))
      : null;

  const response: TrainerProblemResponse = {
    playerToken: identity.token,
    problem: asked,
    ladder,
    focus: [
      ...(loadedCube ? [CUBE_GUIDANCE, PHASE_GUIDANCE[loadedCube.phase]] : []),
      ...(problem ? [PHASE_GUIDANCE[problem.phase]] : []),
      ...weakConcepts.slice(0, 2).map((concept) => CONCEPT_ADVICE[concept]),
    ],
    attempted: attempts.length,
    solved: attempts.filter((attempt) => attempt.solved).length,
  };
  return c.json(response);
});

app.post('/api/trainer/attempt', async (c) => {
  const key = await keyOf(c);
  const body = await parseBody(trainerAttemptSchema, c.req.raw);

  // Grading happens here, from the stored answer, because the client is never
  // sent the answer: it can only submit an answer and be told what it cost.
  const { result, tier } = gradeRequest(body);

  const attempts = await loadAttempts(c.env.DB, key);
  const before = ladderState(attempts, MAX_TIER);
  const record = await recordAttempt(c.env.DB, key, tier, result);
  const ladder = ladderState([record, ...attempts], MAX_TIER);

  const response: TrainerAttemptResponse = { result, ladder, unlocked: ladder.tier > before.tier };
  return c.json(response);
});

app.all('/api/*', (c) => c.json({ error: 'not found', code: 'not_found' }, 404));

// Everything else is the single-page app, served from the same Worker so there
// is no CORS surface and one deploy ships both halves.
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
