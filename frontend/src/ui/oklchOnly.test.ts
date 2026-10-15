/**
 * Guard: the brief allows only OKLCH colours. Scans every stylesheet and component for
 * hex, rgb(), hsl(), hwb(), lab(), lch(), color() and named colours in colour properties.
 */
import { describe, expect, it } from 'vitest';

// Vite inlines every source file as a string, so the check needs no Node APIs.
const SOURCES = import.meta.glob<string>(['../**/*.{css,ts,tsx}', '!../**/*.test.{ts,tsx}', '!../test/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const FORBIDDEN = [
  /#[0-9a-f]{3,8}\b(?![\w-])/i,
  /\b(rgba?|hsla?|hwb|lab|lch|color)\(/i,
  /(?:^|[\s;{])(?:color|background(?:-color)?|border(?:-[a-z]+)?-color|fill|stroke|outline-color|accent-color)\s*:\s*(?:white|black|red|gray|grey|blue|green)\b/i,
];

describe('OKLCH only', () => {
  const sources = Object.keys(SOURCES);

  it('finds the stylesheets', () => {
    expect(sources.filter((f) => f.endsWith('.css')).length).toBeGreaterThan(5);
  });

  it.each(sources)('%s uses no non-OKLCH colour', (file) => {
    const text = (SOURCES[file] ?? '')
      // Ignore comments and things that merely look like colours (ids, hashes in URLs).
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/url\([^)]*\)/g, '')
      .replace(/(href|id)=["'][^"']*["']/g, '');
    for (const re of FORBIDDEN) expect(text, `${re} in ${file}`).not.toMatch(re);
  });
});
