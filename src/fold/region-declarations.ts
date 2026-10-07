import { fieldOf, isConfig } from './claims.ts';
import { wordsOf } from './wire.ts';

/** Region input selectors consumed by the host, rather than measured ceilings. */
export function isRegionDeclaration(line: string, wire: readonly string[]): boolean {
  if (!isConfig(line) || !fieldOf(line, 'scope').startsWith('region/') || fieldOf(line, 'value') === 'withdraw') return false;
  const named = ['region-coordinate', 'region-leaf'].flatMap(name => {
    const words = wordsOf(wire, name);
    return words.length === 1 ? words : [];
  });
  const measures = ['lines', 'receipts', 'reads', ...named];
  return measures.includes(fieldOf(line, 'measure'));
}
