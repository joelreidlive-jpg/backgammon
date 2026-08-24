import type { Severity } from '@bg/protocol';

/**
 * Equity is the engine's unit, not the player's: "−0.147" says nothing about
 * what to do differently. Everything the player reads is in words, and the
 * numbers stay where they are used — in the grading and the record.
 *
 * The bands mirror the coach's own severity thresholds. They are restated here
 * rather than imported because pulling in the coach package would put the
 * evaluator into the browser bundle, which a player could then read.
 */
const BLUNDER = 0.12;
const ERROR = 0.06;
const INACCURACY = 0.02;

export const SEVERITY_HEADLINE: Readonly<Record<Severity, string>> = {
  fine: 'Well played',
  inaccuracy: 'Close, but there was a little more in the position',
  error: 'There was a clearly better play here',
  blunder: 'This one was costly',
};

/** What a mistake cost, as a player would describe it. */
export function costInWords(equityLoss: number): string {
  if (equityLoss >= BLUNDER) return 'this one was costly';
  if (equityLoss >= ERROR) return 'it gave up a clear edge';
  if (equityLoss >= INACCURACY) return 'it gave up a little';
  return 'the difference is tiny';
}
