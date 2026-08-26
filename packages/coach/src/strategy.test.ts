import { describe, expect, it } from 'vitest';
import { initialBoard, makeBoard } from '@bg/rules';
import { TOO_GOOD_POINT } from '@bg/ai';
import { analyseCubeDecision, analyseCubeResponse, isCubeDecisionPoint } from './cube.js';
import {
  EMPTY_PROGRESS,
  type PlayerProgress,
  coachingPolicy,
  errorRate,
  mergeProgress,
  progressFromGame,
  tierFor,
  tierRank,
  trend,
  weakestConcepts,
  weakestPhase,
} from './progress.js';
import { reviewGame } from './review.js';
import type { TurnAnalysis } from './analyse.js';
import type { CubeAnalysis } from './cube.js';

/** White is almost home, black has barely started: white is winning easily. */
const whiteWinning = makeBoard({
  white: { 3: 2, 2: 2, 1: 2 },
  black: { 24: 2, 23: 2, 22: 2, 13: 5, 12: 4 },
  off: { white: 9 },
});

/** A clear lead in a race both sides are still bearing in: a proper double. */
const whiteAhead = makeBoard({
  white: { 6: 3, 5: 3, 4: 3, 3: 2 },
  black: { 20: 3, 19: 3, 13: 5 },
  off: { white: 4, black: 4 },
});

function turn(overrides: Partial<TurnAnalysis>): TurnAnalysis {
  return {
    player: 'white',
    dice: [3, 1],
    played: '8/5 6/5',
    best: '8/5 6/5',
    boardBefore: initialBoard(),
    playedMoves: [],
    bestMoves: [],
    playedEquity: 0,
    bestEquity: 0,
    equityLoss: 0,
    severity: 'fine',
    phase: 'opening',
    explanation: '',
    missed: [],
    incurred: [],
    ...overrides,
  };
}

function cube(overrides: Partial<CubeAnalysis>): CubeAnalysis {
  return {
    choice: 'no-double',
    best: 'double',
    mistake: 'missed-double',
    equityLoss: 0.3,
    severity: 'blunder',
    winProbability: 0.8,
    phase: 'middlegame',
    explanation: '',
    ...overrides,
  };
}

describe('cube decisions', () => {
  it('calls doubling correct when clearly winning', () => {
    const analysis = analyseCubeDecision(whiteAhead, 'white', 'double');
    expect(analysis.best).toBe('double');
    expect(analysis.mistake).toBe('none');
    expect(analysis.equityLoss).toBe(0);
  });

  it('flags holding the cube in a winning position as a missed double', () => {
    const analysis = analyseCubeDecision(whiteAhead, 'white', 'no-double');
    expect(analysis.mistake).toBe('missed-double');
    expect(analysis.equityLoss).toBeGreaterThan(0);
    expect(analysis.explanation).toMatch(/turn the cube|too good/i);
  });

  it('does not want the cube turned from the opening position', () => {
    const analysis = analyseCubeDecision(initialBoard(), 'white', 'double');
    expect(analysis.best).toBe('no-double');
    expect(analysis.mistake).toBe('premature-double');
  });

  it('only counts no-doubles near the doubling window as decisions', () => {
    const opening = analyseCubeDecision(initialBoard(), 'white', 'no-double');
    const winning = analyseCubeDecision(whiteAhead, 'white', 'no-double');

    expect(isCubeDecisionPoint(opening)).toBe(false);
    expect(isCubeDecisionPoint(winning)).toBe(true);
  });

  it('blames neither cashing nor playing on once the position is too good', () => {
    // The engine plays on here rather than doubling, so grading the same
    // choice as a missed double contradicts the opponent it puts you against.
    const playOn = analyseCubeDecision(whiteWinning, 'white', 'no-double');
    const cash = analyseCubeDecision(whiteWinning, 'white', 'double');

    expect(playOn.winProbability).toBeGreaterThanOrEqual(TOO_GOOD_POINT);
    for (const analysis of [playOn, cash]) {
      expect(analysis.mistake).toBe('undecided');
      expect(analysis.equityLoss).toBe(0);
      expect(analysis.best).toBe(analysis.choice);
    }
    expect(progressFromGame([], [playOn]).cubeMistakes).toEqual({});
  });

  it('grades a hopeless take as a mistake', () => {
    const analysis = analyseCubeResponse(whiteWinning, 'black', 'take');
    expect(analysis.best).toBe('drop');
    expect(analysis.mistake).toBe('wrong-take');
    expect(analysis.equityLoss).toBeGreaterThan(0);
  });

  it('grades dropping a hopeless position as correct', () => {
    const analysis = analyseCubeResponse(whiteWinning, 'black', 'drop');
    expect(analysis.mistake).toBe('none');
    expect(analysis.equityLoss).toBe(0);
  });

  it('reports the responder win probability from their own side', () => {
    const analysis = analyseCubeResponse(whiteWinning, 'black', 'drop');
    expect(analysis.winProbability).toBeLessThan(0.5);
  });
});

describe('progress', () => {
  it('scores error rate in millipoints per decision', () => {
    expect(errorRate({ decisions: 10, equityLoss: 0.5 })).toBeCloseTo(50);
    expect(errorRate({ decisions: 0, equityLoss: 0 })).toBe(0);
  });

  it('grades a settled record by its error rate', () => {
    expect(tierFor({ decisions: 2000, equityLoss: 10 })).toBe('expert');
    expect(tierFor({ decisions: 2000, equityLoss: 60 })).toBe('strong');
    expect(tierFor({ decisions: 2000, equityLoss: 100 })).toBe('intermediate');
    expect(tierFor({ decisions: 2000, equityLoss: 400 })).toBe('novice');
  });

  it('starts a player with no record as a novice', () => {
    expect(tierFor({ decisions: 0, equityLoss: 0 })).toBe('novice');
    expect(tierFor({ decisions: 5, equityLoss: 0 })).toBe('novice');
  });

  it('climbs a band at a time rather than jumping on one good game', () => {
    // A flawless game is about 30 decisions; four of them should not read as
    // four bands of improvement.
    const afterGames = (games: number) => tierFor({ decisions: games * 30, equityLoss: 0 });

    expect(afterGames(1)).toBe('improver');
    expect(afterGames(3)).toBe('intermediate');
    expect(afterGames(10)).toBe('strong');
    expect(afterGames(40)).toBe('expert');
  });

  it('never moves more than one band for a single game', () => {
    const rates = [0, 0.1, 0.5, 1, 3];
    for (const perGame of rates) {
      for (let games = 0; games < 20; games += 1) {
        const before = tierFor({ decisions: games * 30, equityLoss: games * perGame });
        const after = tierFor({ decisions: (games + 1) * 30, equityLoss: (games + 1) * perGame });
        expect(Math.abs(tierRank(after) - tierRank(before))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('judges a rarely played phase against the player, not against a beginner', () => {
    const record: PlayerProgress = {
      ...EMPTY_PROGRESS,
      checker: { decisions: 2000, equityLoss: 10 },
      byPhase: { bearoff: { decisions: 4, equityLoss: 0 } },
    };

    expect(coachingPolicy(record, 'bearoff').tier).toBe('expert');
  });

  it('aggregates a game into phases and concepts', () => {
    const delta = progressFromGame(
      [
        turn({ equityLoss: 0.1, phase: 'opening', missed: ['makesHomeBoardPoint'] }),
        turn({ equityLoss: 0.2, phase: 'race', incurred: ['leavesBlot'] }),
      ],
      [cube({ equityLoss: 0.3 })],
    );

    expect(delta.checker).toEqual({ decisions: 2, equityLoss: expect.closeTo(0.3) });
    expect(delta.cube.decisions).toBe(1);
    expect(delta.byPhase.opening?.decisions).toBe(1);
    expect(delta.byConcept.makesHomeBoardPoint?.missed).toBe(1);
    expect(delta.cubeMistakes['missed-double']).toBe(1);
  });

  it('counts a match only when the game that ended also ended the match', () => {
    expect(progressFromGame([turn({})], []).matches).toBe(0);
    expect(progressFromGame([turn({})], [], true).matches).toBe(1);

    const played = mergeProgress(
      progressFromGame([turn({})], []),
      progressFromGame([turn({})], [], true),
    );
    expect(played).toMatchObject({ games: 2, matches: 1 });
  });

  it('merges progress additively', () => {
    const one = progressFromGame([turn({ equityLoss: 0.1, missed: ['buildsPrime'] })], []);
    const merged = mergeProgress(mergeProgress(EMPTY_PROGRESS, one), one);

    expect(merged.games).toBe(2);
    expect(merged.checker.decisions).toBe(2);
    expect(merged.byConcept.buildsPrime?.missed).toBe(2);
  });

  it('ranks leaks by equity cost rather than frequency', () => {
    const progress = mergeProgress(
      EMPTY_PROGRESS,
      progressFromGame(
        [
          turn({ equityLoss: 0.01, missed: ['bearsOff'] }),
          turn({ equityLoss: 0.01, missed: ['bearsOff'] }),
          turn({ equityLoss: 0.5, missed: ['escapesBackChecker'] }),
        ],
        [],
      ),
    );

    expect(weakestConcepts(progress, 1)).toEqual(['escapesBackChecker']);
  });

  it('finds the phase costing the most', () => {
    const progress = mergeProgress(
      EMPTY_PROGRESS,
      progressFromGame(
        [turn({ equityLoss: 0.05, phase: 'opening' }), turn({ equityLoss: 0.4, phase: 'bearoff' })],
        [],
      ),
    );

    expect(weakestPhase(progress)).toBe('bearoff');
    expect(weakestPhase(EMPTY_PROGRESS)).toBeNull();
  });
});

describe('adaptive coaching', () => {
  function progressWithRate(decisions: number, equityLoss: number): PlayerProgress {
    return { ...EMPTY_PROGRESS, checker: { decisions, equityLoss } };
  }

  it('spoon-feeds a novice and stays quiet for an expert', () => {
    const novice = coachingPolicy(progressWithRate(2000, 400));
    const expert = coachingPolicy(progressWithRate(2000, 10));

    expect(novice.defaultHintLevel).toBeGreaterThan(expert.defaultHintLevel);
    expect(novice.alertThreshold).toBeLessThan(expert.alertThreshold);
    expect(novice.offerTakeback).toBe(true);
    expect(expert.offerTakeback).toBe(false);
  });

  it('raises the suggested opponent as the player improves', () => {
    expect(coachingPolicy(progressWithRate(2000, 400)).suggestedDifficulty).toBe('beginner');
    expect(coachingPolicy(progressWithRate(2000, 10)).suggestedDifficulty).toBe('expert');
  });

  it('calibrates per phase, so strength in one does not silence coaching in another', () => {
    const progress: PlayerProgress = {
      ...progressWithRate(2000, 10),
      byPhase: { bearoff: { decisions: 2000, equityLoss: 400 } },
    };

    expect(coachingPolicy(progress).tier).toBe('expert');
    expect(coachingPolicy(progress, 'bearoff').tier).toBe('novice');
  });

  it('reads a falling error rate as improvement', () => {
    const worse = Array.from({ length: 10 }, () => 90);
    const better = Array.from({ length: 10 }, () => 40);

    expect(trend({ ...EMPTY_PROGRESS, errorRateHistory: [...worse, ...better] })).toBe('improving');
    expect(trend({ ...EMPTY_PROGRESS, errorRateHistory: [...better, ...worse] })).toBe('slipping');
    expect(trend({ ...EMPTY_PROGRESS, errorRateHistory: better })).toBe('steady');
  });
});

describe('end of game review', () => {
  const turns = [
    turn({ equityLoss: 0.3, severity: 'blunder', phase: 'middlegame', missed: ['makesHomeBoardPoint'] }),
    turn({ equityLoss: 0.01, phase: 'opening' }),
    turn({ equityLoss: 0.15, severity: 'blunder', phase: 'bearoff', incurred: ['leavesBlot'] }),
  ];

  it('reports the worst moments worst-first and ignores sound play', () => {
    const review = reviewGame(turns, [], EMPTY_PROGRESS);

    expect(review.worstMoments).toHaveLength(2);
    expect(review.worstMoments[0].equityLoss).toBe(0.3);
  });

  it('gives phase-specific guidance for the phases actually played', () => {
    const review = reviewGame(turns, [], EMPTY_PROGRESS);
    const phases = review.byPhase.map((p) => p.phase);

    expect(phases).toContain('middlegame');
    expect(phases).toContain('bearoff');
    expect(review.byPhase[0].guidance).toBeTruthy();
  });

  it('turns cube mistakes into concrete advice', () => {
    const review = reviewGame([], [cube({ mistake: 'wrong-take' })], EMPTY_PROGRESS);

    expect(review.cube.decisions).toBe(1);
    expect(review.cube.advice[0]).toMatch(/pass/i);
  });

  it('recognises a promotion', () => {
    const history: PlayerProgress = { ...EMPTY_PROGRESS, checker: { decisions: 2000, equityLoss: 400 } };
    const clean = Array.from({ length: 4000 }, () => turn({ equityLoss: 0 }));

    expect(reviewGame(clean, [], history).levelledUp).toBe(true);
    expect(reviewGame(turns, [], EMPTY_PROGRESS).levelledUp).toBe(false);
  });

  it('reports this game separately from the standing assessment', () => {
    const history: PlayerProgress = { ...EMPTY_PROGRESS, checker: { decisions: 2000, equityLoss: 60 } };
    const review = reviewGame([turn({ equityLoss: 0.1 })], [], history);

    expect(review.tier).toBe('strong');
    expect(review.headline).toMatch(/This game cost 100 millipoints/);
    expect(review.headline).not.toMatch(/Overall/);
    expect(review.standing).toMatch(/Overall/);
  });

  it('says the grade is unsettled while the record is thin', () => {
    const first = reviewGame(turns, [], EMPTY_PROGRESS);
    expect(first.standing).toMatch(/still settling/);

    const settled: PlayerProgress = { ...EMPTY_PROGRESS, checker: { decisions: 2000, equityLoss: 60 } };
    expect(reviewGame(turns, [], settled).standing).not.toMatch(/still settling/);
  });

  it('compares this game with the recent average', () => {
    const history: PlayerProgress = { ...EMPTY_PROGRESS, errorRateHistory: [50, 70, 60, 40, 80] };

    expect(reviewGame([turn({ equityLoss: 0.04 })], [], history).headline).toContain('Better than your recent 60.');
    expect(reviewGame([turn({ equityLoss: 0.1 })], [], history).headline).toContain('Worse than your recent 60.');
    expect(reviewGame([turn({ equityLoss: 0.06 })], [], history).headline).toContain('In line with your recent 60.');
  });

  it('describes what drove the game from its decisions', () => {
    const clean = reviewGame([turn({ equityLoss: 0 })], [], EMPTY_PROGRESS);
    expect(clean.headline).toContain('Nothing above an inaccuracy all game.');

    const oneWorst = reviewGame(
      [turn({ equityLoss: 0.3, severity: 'blunder', phase: 'race' }), turn({ equityLoss: 0.1, severity: 'error' })],
      [],
      EMPTY_PROGRESS,
    );
    expect(oneWorst.headline).toContain('One blunder in the race accounted for most of it.');

    const spread = reviewGame(
      [
        turn({ equityLoss: 0.2, severity: 'blunder', phase: 'middlegame' }),
        turn({ equityLoss: 0.2, severity: 'blunder', phase: 'middlegame' }),
        turn({ equityLoss: 0.2, severity: 'blunder', phase: 'opening' }),
      ],
      [],
      EMPTY_PROGRESS,
    );
    expect(spread.headline).toContain('Most of it went in the middlegame: 400 of 600 millipoints.');
  });

  it('rotates phase advice across consecutive reviews', () => {
    const game = [turn({ equityLoss: 0.1, phase: 'opening' })];
    const first = reviewGame(game, [], EMPTY_PROGRESS);
    const second = reviewGame(game, [], first.progress);
    const third = reviewGame(game, [], second.progress);

    const guidance = [first.byPhase[0].guidance, second.byPhase[0].guidance, third.byPhase[0].guidance];
    expect(new Set(guidance).size).toBe(3);
  });

  it('does not repeat an advice paragraph within one review', () => {
    const review = reviewGame(
      [turn({ equityLoss: 0.2, severity: 'blunder', phase: 'opening', missed: ['makesPoint'] })],
      [],
      EMPTY_PROGRESS,
    );

    for (const paragraph of [...review.byPhase.map((phase) => phase.guidance), ...review.leaks.map((leak) => leak.advice)]) {
      expect(review.focus.every((line) => !line.includes(paragraph))).toBe(true);
    }
  });

  it('does not promote a novice to expert on one good game', () => {
    const clean = Array.from({ length: 30 }, () => turn({ equityLoss: 0 }));
    const first = reviewGame(clean, [], EMPTY_PROGRESS);

    expect(first.tier).toBe('improver');
    expect(reviewGame(clean, [], first.progress).tier).toBe('improver');
  });

  it('marks advice the player has already been given as a repeat', () => {
    const first = reviewGame(turns, [], EMPTY_PROGRESS);
    const second = reviewGame(turns, [], first.progress);

    expect(first.focus.some((line) => /keeps recurring|Still your costliest/.test(line))).toBe(false);
    expect(second.focus.some((line) => /keeps recurring|Still your costliest/.test(line))).toBe(true);
  });

  it('carries progress forward so focus survives a single good game', () => {
    const first = reviewGame(turns, [], EMPTY_PROGRESS);
    const second = reviewGame([turn({ equityLoss: 0 })], [], first.progress);

    expect(second.progress.games).toBe(2);
    expect(second.focus.length).toBeGreaterThan(0);
  });
});
