import type { MiddlewareHandler } from 'hono';
import { decodeError } from './errors.js';

/**
 * One structured JSON line per request, correlated by id.
 *
 * Workers only keep logs you emit, so without this a production failure is
 * invisible until a player reports it. The line deliberately carries no player
 * token, no request body and no error message from an unexpected failure —
 * enough to find a problem, nothing that identifies a person.
 */
export function observability(): MiddlewareHandler {
  return async (c, next) => {
    const requestId = c.req.header('cf-ray') ?? crypto.randomUUID();
    c.set('requestId', requestId);
    const started = Date.now();

    await next();

    c.header('x-request-id', requestId);
    const line = {
      requestId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      ms: Date.now() - started,
    };
    // Errors are the signal; successful asset requests are noise.
    if (c.res.status >= 400) console.error(JSON.stringify(line));
    else if (line.path.startsWith('/api/')) console.log(JSON.stringify(line));
  };
}

/**
 * Log the detail of an unexpected failure server-side, where it is safe, so the
 * response can stay generic.
 */
export function logFailure(requestId: string, error: unknown): void {
  const { code, status } = decodeError(error);
  if (code !== 'internal') return;
  console.error(
    JSON.stringify({
      requestId,
      status,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
}
