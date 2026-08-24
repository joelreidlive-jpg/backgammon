import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const manifest: unknown = JSON.parse(
  readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8'),
);

function field(name: string): unknown {
  if (typeof manifest !== 'object' || manifest === null) throw new Error('manifest is not an object');
  return (manifest as Record<string, unknown>)[name];
}

describe('web app manifest', () => {
  // Installed to the home screen, this is what hides the address bar on iOS,
  // which has no Fullscreen API to ask.
  it('asks for fullscreen', () => {
    expect(field('display')).toBe('fullscreen');
    expect(field('display_override')).toEqual(['fullscreen', 'standalone']);
  });

  it('points at icons that exist', () => {
    const icons = field('icons');
    expect(Array.isArray(icons)).toBe(true);
    const sources = (icons as { src: string }[]).map((icon) => icon.src);
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      expect(src.startsWith('/')).toBe(true);
      expect(existsSync(join(publicDir, src.slice(1)))).toBe(true);
    }
  });
});
