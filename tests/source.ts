import { readFileSync } from 'node:fs';
/**
 * Read source code in a formatting-independent compact form, so tests that assert on source
 * text survive Prettier: whitespace around punctuation, trailing commas and `(x) =>` parens are removed.
 */
export function compactSource(code: string): string {
  return code
    .replace(/\s+/g, ' ')
    .replace(/ ?([^\w\s$]) ?/g, '$1')
    .replace(/,([)\]}])/g, '$1')
    .replace(/\(([\w$]+)\)=>/g, '$1=>');
}
export const readSource = (path: string) => compactSource(readFileSync(path, 'utf8'));
