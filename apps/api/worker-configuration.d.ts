// Regenerate with `pnpm --filter @bg/api cf-typegen` after changing wrangler.jsonc.
import type { MatchDO } from './src/match-do.js';
import type { RateLimiter } from './src/rate-limit.js';

declare global {
  interface Env {
    MATCH: DurableObjectNamespace<MatchDO>;
    ASSETS: Fetcher;
    DB: D1Database;
    // Optional: the binding is absent in older local runtimes, and the
    // middleware fails open rather than blocking play.
    MATCH_CREATE_LIMIT?: RateLimiter;
    MATCH_LIMIT?: RateLimiter;
    TRAINER_LIMIT?: RateLimiter;
    AUTH_LIMIT?: RateLimiter;
  }
}

export {};
