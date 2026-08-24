import { describe, expect, it } from 'vitest';
import { GLOSSARY, glossaryEntry, splitOnTerms } from './glossary.js';

/** The text of a split, so a test can assert the words survived it. */
function rejoin(text: string): string {
  return splitOnTerms(text)
    .map((part) => part.text)
    .join('');
}

function linked(text: string): string[] {
  return splitOnTerms(text)
    .filter((part) => part.entry !== undefined)
    .map((part) => part.text);
}

describe('the glossary itself', () => {
  it('defines every term once', () => {
    const terms = GLOSSARY.map((entry) => entry.term);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('never claims the same phrase for two terms', () => {
    const phrases = GLOSSARY.flatMap((entry) => [entry.term, ...(entry.aliases ?? [])]);
    expect(new Set(phrases).size).toBe(phrases.length);
  });

  it('is alphabetical, because it is read as a list', () => {
    const terms = GLOSSARY.map((entry) => entry.term.toLowerCase());
    expect(terms).toEqual([...terms].sort());
  });

  it('finds a term by name', () => {
    expect(glossaryEntry('blot')?.definition).toContain('single checker');
    expect(glossaryEntry('not a term')).toBeNull();
  });
});

describe('splitOnTerms', () => {
  it('links a term where the coach used it', () => {
    expect(linked('Your play leaves a blot.')).toEqual(['blot']);
  });

  it('leaves the text exactly as written', () => {
    const text = 'The better play hits and makes a home board point instead of stacking.';
    expect(rejoin(text)).toBe(text);
  });

  it('links plurals and verb forms', () => {
    expect(linked('It hits two blots.')).toEqual(['hits', 'blots']);
  });

  it('prefers the longer term where two overlap', () => {
    expect(linked('Your pip count is behind.')).toEqual(['pip count']);
  });

  it('only links a term the first time, so advice stays readable', () => {
    expect(linked('A blot here and a blot there.')).toEqual(['blot']);
  });

  it('ignores a term buried inside another word', () => {
    expect(linked('Keep piping hot.')).toEqual([]);
    expect(linked('The takeback is free.')).toEqual([]);
  });

  it('matches however the sentence capitalised it', () => {
    expect(linked('Prime first, race later.')).toEqual(['Prime', 'race']);
  });

  it('returns text with no jargon in one piece', () => {
    expect(splitOnTerms('Nothing to define here.')).toEqual([
      { text: 'Nothing to define here.' },
    ]);
  });
});
