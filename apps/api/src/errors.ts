/**
 * Domain error codes. The HTTP layer maps these to statuses; nothing infers a
 * status by reading the message.
 */
export type ErrorCode = 'invalid' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'internal';

const STATUS_CODE: Record<number, ErrorCode> = {
  400: 'invalid',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  500: 'internal',
};

/** Machine-readable envelope, matched exactly rather than by prose. */
const WIRE = /^bg:([a-z_]+):(\d{3}): ([\s\S]*)$/;

export interface DecodedError {
  readonly code: ErrorCode;
  readonly status: number;
  readonly message: string;
}

export class MatchError extends Error {
  readonly code: ErrorCode;

  constructor(
    readonly publicMessage: string,
    readonly status: number,
    code?: ErrorCode,
  ) {
    // Durable Object RPC rethrows on the caller's side as a plain Error, and
    // only the message survives the hop. Encoding the code and status into the
    // message keeps them intact without the HTTP layer guessing from prose.
    const resolved = code ?? STATUS_CODE[status] ?? 'internal';
    super(`bg:${resolved}:${status}: ${publicMessage}`);
    this.code = resolved;
  }
}

/**
 * Recover a domain error from anything thrown, including one that has crossed
 * the RPC boundary. Anything without the envelope is an unexpected failure and
 * is deliberately not described to the client.
 */
export function decodeError(error: unknown): DecodedError {
  if (error instanceof MatchError) {
    return { code: error.code, status: error.status, message: error.publicMessage };
  }
  const match = error instanceof Error ? WIRE.exec(error.message) : null;
  if (match) {
    return { code: match[1] as ErrorCode, status: Number(match[2]), message: match[3] };
  }
  return { code: 'internal', status: 500, message: 'internal error' };
}
