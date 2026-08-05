import { type Board, type Player, initialBoard, opponent } from './board.js';
import { type Dice, type Turn, findTurn, legalTurns } from './legalTurns.js';
import { type Move } from './moves.js';
import { type GameResult, scoreDrop, scoreGame, winnerOf } from './matchScore.js';

export type Phase = 'roll' | 'move' | 'respond-to-double' | 'game-over' | 'match-over';

export interface CubeState {
  readonly value: number;
  /** null while the cube is centred. */
  readonly owner: Player | null;
}

export interface MatchState {
  readonly board: Board;
  readonly turn: Player;
  readonly dice: Dice | null;
  readonly phase: Phase;
  readonly cube: CubeState;
  readonly pendingDouble: Player | null;
  readonly score: Readonly<Record<Player, number>>;
  readonly matchLength: number;
  readonly crawfordGame: boolean;
  readonly crawfordPlayed: boolean;
  readonly gameNumber: number;
  readonly result: GameResult | null;
  readonly matchWinner: Player | null;
}

export function newMatch(matchLength: number, firstPlayer: Player, openingDice: Dice): MatchState {
  return {
    board: initialBoard(),
    turn: firstPlayer,
    dice: openingDice,
    phase: 'move',
    cube: { value: 1, owner: null },
    pendingDouble: null,
    score: { white: 0, black: 0 },
    matchLength,
    crawfordGame: false,
    crawfordPlayed: false,
    gameNumber: 1,
    result: null,
    matchWinner: null,
  };
}

/** Start the next game of the match, applying the Crawford rule. */
export function newGame(state: MatchState, firstPlayer: Player, openingDice: Dice): MatchState {
  const crawfordPlayed = state.crawfordPlayed || state.crawfordGame;
  const reachedCrawfordScore =
    state.matchLength > 1 &&
    !crawfordPlayed &&
    (state.score.white === state.matchLength - 1 || state.score.black === state.matchLength - 1);

  return {
    ...state,
    board: initialBoard(),
    turn: firstPlayer,
    dice: openingDice,
    phase: 'move',
    cube: { value: 1, owner: null },
    pendingDouble: null,
    crawfordGame: reachedCrawfordScore,
    crawfordPlayed,
    gameNumber: state.gameNumber + 1,
    result: null,
  };
}

export function canDouble(state: MatchState, player: Player): boolean {
  if (state.phase !== 'roll') return false;
  if (state.turn !== player) return false;
  if (state.crawfordGame) return false;
  if (state.cube.owner !== null && state.cube.owner !== player) return false;
  // The cube is dead once the current value already wins the match.
  if (state.matchLength > 1 && state.score[player] + state.cube.value >= state.matchLength) return false;
  return true;
}

export function roll(state: MatchState, dice: Dice): MatchState {
  if (state.phase !== 'roll') throw new Error(`cannot roll during phase "${state.phase}"`);
  return { ...state, dice, phase: 'move' };
}

export function offerDouble(state: MatchState, player: Player): MatchState {
  if (!canDouble(state, player)) throw new Error('double not available');
  return { ...state, pendingDouble: player, phase: 'respond-to-double' };
}

export function respondToDouble(state: MatchState, response: 'take' | 'drop'): MatchState {
  if (state.phase !== 'respond-to-double' || state.pendingDouble === null) {
    throw new Error('no double to respond to');
  }
  const doubler = state.pendingDouble;

  if (response === 'drop') {
    return concludeGame(state, scoreDrop(doubler, state.cube.value));
  }
  return {
    ...state,
    cube: { value: state.cube.value * 2, owner: opponent(doubler) },
    pendingDouble: null,
    phase: 'roll',
  };
}

/** Legal turns for the side to move, or [] when it is not a move phase. */
export function currentLegalTurns(state: MatchState): Turn[] {
  if (state.phase !== 'move' || state.dice === null) return [];
  return legalTurns(state.board, state.turn, state.dice);
}

export function playTurn(state: MatchState, moves: readonly Move[]): MatchState {
  if (state.phase !== 'move' || state.dice === null) {
    throw new Error(`cannot move during phase "${state.phase}"`);
  }
  const turn = findTurn(state.board, state.turn, state.dice, moves);
  if (turn === null) throw new Error('illegal move sequence');
  return advance(state, turn.board);
}

/** Apply an already-validated turn (used by the AI, which searches legal turns). */
export function applyValidatedTurn(state: MatchState, turn: Turn): MatchState {
  if (state.phase !== 'move') throw new Error(`cannot move during phase "${state.phase}"`);
  return advance(state, turn.board);
}

function advance(state: MatchState, board: Board): MatchState {
  const winner = winnerOf(board);
  if (winner !== null) {
    return concludeGame({ ...state, board }, scoreGame(board, winner, state.cube.value));
  }
  return { ...state, board, turn: opponent(state.turn), dice: null, phase: 'roll' };
}

function concludeGame(state: MatchState, result: GameResult): MatchState {
  const score = { ...state.score, [result.winner]: state.score[result.winner] + result.points };
  const matchOver = state.matchLength > 0 && score[result.winner] >= state.matchLength;
  return {
    ...state,
    score,
    result,
    dice: null,
    pendingDouble: null,
    phase: matchOver ? 'match-over' : 'game-over',
    matchWinner: matchOver ? result.winner : null,
  };
}
