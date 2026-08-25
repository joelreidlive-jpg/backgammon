import { z } from 'zod';
import type { Move } from '@bg/rules';
import type { Difficulty } from '@bg/ai';
import type {
  CreateMatchRequest,
  CredentialsRequest,
  CubeCommand,
  TrainerAttemptRequest,
} from '@bg/protocol';
import { MatchError } from './errors.js';

/**
 * Runtime validation for everything that arrives over the network.
 *
 * TypeScript types are erased at runtime, so `c.req.json<T>()` is an assertion,
 * not a check: without these schemas an arbitrary JSON body reaches the engine
 * with the compiler's blessing. Parse at the boundary and hand the rest of the
 * app values it can trust.
 */

/** Slot 1..24, plus the bar (0/25) and off (0/25) pseudo-slots. */
const slot = z.number().int().min(0).max(25);

export const moveSchema = z.object({
  from: slot,
  to: slot,
  hit: z.boolean(),
});

export const submitTurnSchema = z.object({
  moves: z.array(moveSchema).max(4),
});

export const cubeCommandSchema = z.object({
  action: z.enum(['double', 'take', 'drop']),
});

export const hintLevelSchema = z.coerce
  .number({ error: 'level must be 1-4' })
  .int('level must be 1-4')
  .min(1, 'level must be 1-4')
  .max(4, 'level must be 1-4');

const DIFFICULTIES = ['beginner', 'casual', 'intermediate', 'expert', 'advanced'] as const satisfies
  readonly Difficulty[];

export const createMatchSchema = z.object({
  aiLevel: z.enum(DIFFICULTIES).optional(),
  matchLength: z.number().int().optional(),
  coaching: z.boolean().optional(),
  seat: z.enum(['white', 'black']).optional(),
});

/**
 * A player token is 32 random bytes in hex, and nothing else is accepted: a
 * caller who may choose their own token can pick a guessable one, and any two
 * callers who pick the same string share one progress record.
 */
export const playerTokenSchema = z.string().regex(/^[0-9a-f]{64}$/, 'malformed player token');

/**
 * Sign-up and sign-in. The length floor is the only password rule: composition
 * rules push people towards predictable substitutions, and the upper bound is
 * there because PBKDF2 hashes an unbounded input at the server's expense.
 */
export const credentialsSchema = z.object({
  email: z.email('that does not look like an email').trim().max(254),
  password: z.string().min(8, 'use at least 8 characters').max(256),
}) satisfies z.ZodType<CredentialsRequest>;

const problemIdSchema = z.string().min(1).max(128);

export const trainerAttemptSchema = z.union([
  z.object({
    kind: z.literal('cube'),
    problemId: problemIdSchema,
    answer: z.enum(['no-double', 'double', 'too-good', 'take', 'drop']),
  }),
  z.object({
    kind: z.literal('checker').optional(),
    problemId: problemIdSchema,
    moves: z.array(moveSchema).max(4),
  }),
]);

/**
 * Compile-time guards that the schemas still describe the shared wire types.
 * If `@bg/protocol` changes and a schema does not, one of these stops building.
 */
export const asMove = (value: z.infer<typeof moveSchema>): Move => value;
export const asCreateMatch = (value: z.infer<typeof createMatchSchema>): CreateMatchRequest => value;
export const asCubeCommand = (value: z.infer<typeof cubeCommandSchema>['action']): CubeCommand => value;
export const asAttempt = (value: z.infer<typeof trainerAttemptSchema>): TrainerAttemptRequest => value;

/** First issue only: enough for a client to fix the call, nothing about internals. */
function describe(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message.toLowerCase()}` : issue.message.toLowerCase();
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new MatchError(describe(result.error), 400, 'invalid');
  return result.data;
}

/** `c.req.json()` throws on a malformed body; that is a 400, not a crash. */
export async function parseBody<T>(schema: z.ZodType<T>, request: Request): Promise<T> {
  const body = await request.json().catch(() => {
    throw new MatchError('body must be valid JSON', 400, 'invalid');
  });
  return parse(schema, body);
}
