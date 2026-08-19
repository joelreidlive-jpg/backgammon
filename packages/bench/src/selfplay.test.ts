import { it } from 'vitest';
import { type Board, type Player, initialBoard, opponent, winnerOf } from '@bg/rules';
import { type Evaluator, createHeuristicEvaluator, rankTurns } from '@bg/ai';

// Not a test: a head-to-head between two weight sets, to check that a gain on
// the benchmark is a gain over the board rather than an overfit.
// `npx vitest run packages/bench/src/selfplay.test.ts`
const GAMES = 2000;

function roll(): [number, number] {
  return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
}

function playGame(white: Evaluator, black: Evaluator): { winner: Player; points: number } {
  let board: Board = initialBoard();
  let turn: Player = Math.random() < 0.5 ? 'white' : 'black';

  for (let ply = 0; ply < 400; ply++) {
    const dice = roll();
    const best = rankTurns(board, turn, dice, {
      plies: 1,
      evaluator: turn === 'white' ? white : black,
    })[0];
    if (best) board = best.turn.board;

    const winner = winnerOf(board);
    if (winner !== null) {
      const loser = opponent(winner);
      return { winner, points: board.off[loser] > 0 ? 1 : 2 };
    }
    turn = opponent(turn);
  }
  // Ran out of plies: score it as a draw by giving neither side the game.
  return { winner: 'white', points: 0 };
}

it.skip('plays the tuned weights against the previous ones', () => {
  const tuned = createHeuristicEvaluator();
  const previous = createHeuristicEvaluator({
    pipLead: 0.028,
    blotDanger: 0.03,
    checkerOnBar: 0.55,
    stack: 0.03,
    builder: 0,
  });

  let points = 0;
  for (let game = 0; game < GAMES; game++) {
    // Alternate seats so neither weight set gets the first-move advantage.
    const tunedIsWhite = game % 2 === 0;
    const result = playGame(
      tunedIsWhite ? tuned : previous,
      tunedIsWhite ? previous : tuned,
    );
    const tunedWon = (result.winner === 'white') === tunedIsWhite;
    points += tunedWon ? result.points : -result.points;
  }

  console.log(`tuned weights: ${points > 0 ? '+' : ''}${points} points over ${GAMES} games`);
});

