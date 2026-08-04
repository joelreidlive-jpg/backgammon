// Regenerate with `pnpm --filter @bg/api cf-typegen` after changing wrangler.jsonc.
import type { MatchDO } from './src/match-do.js';

declare global {
  interface Env {
    MATCH: DurableObjectNamespace<MatchDO>;
    ASSETS: Fetcher;
    DB: D1Database;
  }
}

export {};
