import { describe, expect, it } from 'vitest';
import type { CreateMatchRequest } from '@bg/protocol';
import { MAX_MATCH_LENGTH, matchOptions } from './matchOptions.js';

/** The body arrives from the network, so tests may send what the types forbid. */
function body(request: unknown): CreateMatchRequest {
  return request as CreateMatchRequest;
}

describe('matchOptions', () => {
  it('defaults an empty request to a one-point coached match', () => {
    expect(matchOptions({})).toEqual({
      matchLength: 1,
      seat: 'white',
      aiLevel: 'intermediate',
      coaching: true,
    });
  });

  it('keeps a valid request', () => {
    expect(matchOptions({ matchLength: 5, seat: 'black', aiLevel: 'expert', coaching: false })).toEqual({
      matchLength: 5,
      seat: 'black',
      aiLevel: 'expert',
      coaching: false,
    });
  });

  it('rejects a match length that is not a number, rather than targeting NaN points', () => {
    expect(matchOptions(body({ matchLength: 'nine' })).matchLength).toBe(1);
    expect(matchOptions(body({ matchLength: null })).matchLength).toBe(1);
  });

  it('clamps the match length to a playable range', () => {
    expect(matchOptions({ matchLength: 0 }).matchLength).toBe(1);
    expect(matchOptions({ matchLength: -3 }).matchLength).toBe(1);
    expect(matchOptions({ matchLength: 999 }).matchLength).toBe(MAX_MATCH_LENGTH);
    expect(matchOptions({ matchLength: 5.9 }).matchLength).toBe(5);
  });

  it('rejects an unknown difficulty, which has no search profile', () => {
    expect(matchOptions(body({ aiLevel: 'godlike' })).aiLevel).toBe('intermediate');
  });

  it('rejects an unknown seat, which would leave nobody able to move', () => {
    expect(matchOptions(body({ seat: 'green' })).seat).toBe('white');
  });

  it('only turns coaching off for an actual false', () => {
    expect(matchOptions(body({ coaching: 'no' })).coaching).toBe(true);
    expect(matchOptions({ coaching: false }).coaching).toBe(false);
  });

  it('survives a missing or non-object body', () => {
    expect(matchOptions(null).matchLength).toBe(1);
    expect(matchOptions(body('five')).aiLevel).toBe('intermediate');
  });
});
