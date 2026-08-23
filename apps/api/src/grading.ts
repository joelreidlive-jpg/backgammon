import type { Move } from '@bg/rules';
import {
  type CubeAnswer,
  type Tier,
  answersFor,
  gradeAttempt,
  gradeCube,
  loadById,
  loadCubeById,
} from '@bg/trainer';
import type { TrainerAttemptRequest, TrainerResult } from '@bg/protocol';
import { MatchError } from './errors.js';

export interface GradedAttempt {
  readonly result: TrainerResult;
  readonly tier: Tier;
}

function gradeChecker(problemId: string, moves: readonly Move[] | undefined): GradedAttempt {
  if (!Array.isArray(moves)) throw new MatchError('moves are required', 400);
  const problem = loadById(problemId);
  if (!problem) throw new MatchError('unknown problem', 404);

  const result = gradeAttempt(problem, moves);
  if (!result) throw new MatchError('that is not a legal turn with this roll', 400);
  return { result, tier: problem.tier };
}

function gradeCubeAnswer(problemId: string, answer: CubeAnswer): GradedAttempt {
  const problem = loadCubeById(problemId);
  if (!problem) throw new MatchError('unknown problem', 404);
  // A take submitted to a "should you double?" question is not a wrong answer
  // to be graded and recorded — it is a malformed request.
  if (!answersFor(problem.question).includes(answer)) {
    throw new MatchError('that is not an answer to this question', 400);
  }

  const result = gradeCube(problem, answer);
  if (!result) throw new MatchError('that is not an answer to this question', 400);
  return { result, tier: problem.tier };
}

/**
 * Grade a submitted attempt of either kind.
 *
 * Grading is server-side because the client is never sent the answer: it can
 * only submit one and be told what it cost.
 */
export function gradeRequest(body: TrainerAttemptRequest): GradedAttempt {
  return body.kind === 'cube'
    ? gradeCubeAnswer(body.problemId, body.answer)
    : gradeChecker(body.problemId, body.moves);
}
