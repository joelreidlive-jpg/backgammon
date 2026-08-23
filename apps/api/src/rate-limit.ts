import type { Context, MiddlewareHandler } from 'hono';

/**
 * The subset of Cloudflare's rate limiting binding this app uses. Declared here
 * rather than imported so the middleware can be tested without the Workers
 * runtime.
 */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Identify the caller for throttling: the player token when there is one, the
 * connecting IP otherwise. Tokens are hashed so a limiter key can never be
 * replayed as a credential if it is logged.
 */
export async function limitKey(c: Context<{ Bindings: Env }>): Promise<string> {
  const token = c.req.header('x-player-token');
  if (token) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return `t:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return `ip:${c.req.header('cf-connecting-ip') ?? 'unknown'}`;
}

/**
 * Throttle a route by player token or IP.
 *
 * Every turn runs a 2-ply search, so an unthrottled public endpoint is both a
 * denial-of-service and a cost-amplification vector. Fails open when the
 * binding is absent (older `wrangler dev`, tests) because an abuse control
 * should never be the reason the app itself stops working.
 */
export function rateLimit(
  pick: (env: Env) => RateLimiter | undefined,
  retryAfterSeconds: number,
): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const limiter = pick(c.env);
    if (!limiter) return next();

    const { success } = await limiter.limit({ key: await limitKey(c) });
    if (success) return next();

    c.header('retry-after', String(retryAfterSeconds));
    return c.json({ error: 'too many requests' }, 429);
  };
}
