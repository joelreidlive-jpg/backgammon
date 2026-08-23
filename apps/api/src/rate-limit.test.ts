import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { type RateLimiter, rateLimit } from './rate-limit.js';

function limiter(allow: boolean): RateLimiter & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      return { success: allow };
    },
  };
}

function appWith(pick: (env: Env) => RateLimiter | undefined) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', rateLimit(pick, 60));
  app.get('/x', (c) => c.text('ok'));
  return app;
}

describe('rateLimit', () => {
  it('passes the request through when under the limit', async () => {
    const res = await appWith(() => limiter(true)).request('/x', {}, {} as Env);
    expect(res.status).toBe(200);
  });

  it('answers 429 with retry-after when over the limit', async () => {
    const res = await appWith(() => limiter(false)).request('/x', {}, {} as Env);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('keys by a digest of the player token, never the token itself', async () => {
    const spy = limiter(true);
    await appWith(() => spy).request('/x', { headers: { 'x-player-token': 'secret-token' } }, {} as Env);
    expect(spy.keys[0]).toMatch(/^t:[0-9a-f]{64}$/);
    expect(spy.keys[0]).not.toContain('secret-token');
  });

  it('falls back to the connecting IP for callers with no token', async () => {
    const spy = limiter(true);
    await appWith(() => spy).request('/x', { headers: { 'cf-connecting-ip': '203.0.113.7' } }, {} as Env);
    expect(spy.keys[0]).toBe('ip:203.0.113.7');
  });

  it('fails open when the binding is absent', async () => {
    const res = await appWith(() => undefined).request('/x', {}, {} as Env);
    expect(res.status).toBe(200);
  });
});
