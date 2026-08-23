import { type CubeProblem, type LoadedCubeProblem, loadCube } from './cube.js';
import { GENERATED_CUBE_PROBLEMS } from './cube-problems.generated.js';

/** The cube problem set, compiled in for the same reasons as the checker set. */
export const CUBE_PROBLEMS: readonly CubeProblem[] = GENERATED_CUBE_PROBLEMS;

const BY_ID = new Map(CUBE_PROBLEMS.map((problem) => [problem.id, problem]));

export function cubeProblemById(id: string): CubeProblem | undefined {
  return BY_ID.get(id);
}

export function loadCubeById(id: string): LoadedCubeProblem | null {
  const problem = BY_ID.get(id);
  return problem ? loadCube(problem) : null;
}
