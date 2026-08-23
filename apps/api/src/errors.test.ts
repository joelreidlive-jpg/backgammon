import { describe, expect, it } from 'vitest';
import { MatchError, decodeError } from './errors.js';

describe('decodeError', () => {
  it('recovers code and status from a local throw', () => {
    expect(decodeError(new MatchError('match not found', 404))).toEqual({
      code: 'not_found',
      status: 404,
      message: 'match not found',
    });
  });

  it('recovers them after the error has crossed the RPC boundary', () => {
    // Durable Object RPC rethrows as a plain Error carrying only the message,
    // which is why the envelope lives in the message rather than a property.
    const rethrown = new Error(new MatchError('not your match', 403).message);
    expect(decodeError(rethrown)).toEqual({
      code: 'forbidden',
      status: 403,
      message: 'not your match',
    });
  });

  it('keeps an explicit code over the one implied by the status', () => {
    expect(decodeError(new MatchError('cannot roll now', 409, 'conflict')).code).toBe('conflict');
  });

  it('never describes an unexpected failure to the client', () => {
    expect(decodeError(new TypeError('cannot read property x of undefined'))).toEqual({
      code: 'internal',
      status: 500,
      message: 'internal error',
    });
  });

  it('does not treat a message that merely mentions an error as one', () => {
    // The old handler matched prose: an engine bug saying "position not found"
    // became a 404 the client would retry forever.
    expect(decodeError(new Error('position not found in table')).status).toBe(500);
  });
});
