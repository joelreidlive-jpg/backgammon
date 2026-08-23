/**
 * An error carrying the status the client should see.
 *
 * It lives apart from the Durable Object so that request handling can be
 * tested without the Workers runtime.
 */
export class MatchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
