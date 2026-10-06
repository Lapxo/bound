import { fieldOf } from './claims.ts';
import type { PlaceFold } from '../cli/place.ts';

/** What rests on a signed line: the rank of a signature is the lines that would move with it and nothing else. */
export function rankLines(fold: PlaceFold): readonly string[] {
  const on = new Map<string, number>();
  for (const line of fold.standing) for (const name of fieldOf(line, 'restsOn').split('|').filter(Boolean)) on.set(name, (on.get(name) ?? 0) + 1);
  return [...on].sort((a, b) => b[1] - a[1]).map(([scope, n]) => `RANK     ${scope} · ${n} lines rest on it`);
}
