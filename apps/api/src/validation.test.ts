import { describe, expect, it } from 'vitest';
import { MatchError } from './errors.js';
import {
  createMatchSchema,
  cubeCommandSchema,
  hintLevelSchema,
  parse,
  parseBody,
  submitTurnSchema,
  trainerAttemptSchema,
} from './validation.js';

describe('request validation', () => {
  it('accepts a well-formed turn', () => {
    const moves = [{ from: 13, to: 7, hit: false }];
    expect(parse(submitTurnSchema, { moves })).toEqual({ moves });
  });

  it.each([
    ['a non-array of moves', { moves: 'all of them' }],
    ['a move that is not an object', { moves: ['13/7'] }],
    ['a move missing a field', { moves: [{ from: 13, to: 7 }] }],
    ['a slot outside the board', { moves: [{ from: 13, to: 99, hit: false }] }],
    ['a non-integer slot', { moves: [{ from: 13.5, to: 7, hit: false }] }],
    // A turn can play at most four checkers, so a longer array is an attempt to
    // make the engine do unbounded work.
    ['more moves than a turn can contain', { moves: Array(50).fill({ from: 13, to: 7, hit: false }) }],
  ])('rejects %s', (_label, body) => {
    expect(() => parse(submitTurnSchema, body)).toThrow(MatchError);
  });

  it('reports which field was wrong without describing internals', () => {
    try {
      parse(submitTurnSchema, { moves: [{ from: 13, to: 99, hit: false }] });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MatchError);
      const matchError = error as MatchError;
      expect(matchError.status).toBe(400);
      expect(matchError.code).toBe('invalid');
      expect(matchError.publicMessage).toContain('moves.0.to');
    }
  });

  it('rejects unknown cube actions and difficulties', () => {
    expect(() => parse(cubeCommandSchema, { action: 'beaver' })).toThrow(MatchError);
    expect(() => parse(createMatchSchema, { aiLevel: 'godlike' })).toThrow(MatchError);
    expect(() => parse(createMatchSchema, { seat: 'green' })).toThrow(MatchError);
  });

  it('accepts an empty match request, since every field has a default', () => {
    expect(parse(createMatchSchema, {})).toEqual({});
  });

  it('coerces the hint level from the query string and bounds it', () => {
    expect(parse(hintLevelSchema, '3')).toBe(3);
    expect(() => parse(hintLevelSchema, '5')).toThrow(MatchError);
    expect(() => parse(hintLevelSchema, 'four')).toThrow(MatchError);
  });

  it('requires a problem id on a trainer attempt', () => {
    expect(() => parse(trainerAttemptSchema, { moves: [] })).toThrow(MatchError);
    expect(() => parse(trainerAttemptSchema, { problemId: '', moves: [] })).toThrow(MatchError);
  });

  it('answers 400 rather than crashing on a malformed body', async () => {
    const request = new Request('https://x/api', { method: 'POST', body: 'not json' });
    await expect(parseBody(submitTurnSchema, request)).rejects.toThrow('body must be valid JSON');
  });
});
