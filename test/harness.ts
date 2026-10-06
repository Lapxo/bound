import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { observed } from '@lapxo/topos/contract';

declare global {
  function compare(actual: unknown, expected: unknown, message?: unknown): void;
}

export type Vector = Record<string, unknown>;

/** The one module that loads what the tests read: a sample by its area and side, observed through the channel topos's contract opens. */
export const sample = (side: 'yes' | 'no', area: string): Vector => {
  const i = area.lastIndexOf('/');
  const dir = i < 0 ? '' : area.slice(0, i);
  const name = i < 0 ? area : area.slice(i + 1);
  const rel = join('samples', dir, side, name);
  return observed(JSON.parse(readFileSync(join(import.meta.dirname, '..', `${rel}.json`), 'utf8')) as Vector, rel);
};
