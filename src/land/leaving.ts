import { fieldOf } from '../fold/claims.ts';
import { sourced } from './vouched.ts';
import { observedClaims } from '../fold/observed.ts';

/**
 * A file goes from the tree through a line, never through a hand: its path withdrawn in the family the lock sources files
 * by is the only way a file goes, and the fold refuses it while a block still reads the file — what a run depends on is judged by the run's
 * own memo, which names every file each block read, and not by a search for the file's name in a test. A search misses
 * a name built in a loop; the memo does not. A test file goes with its own blocks, and is refused while one of them
 * is the only run of a vector or a sample, which it names.
 */
export function coordinatesWithdrawn(root: string, store: string, signed: readonly string[], standing: readonly string[]): { readonly taken: readonly string[]; readonly refused: readonly { readonly path: string; readonly by: string }[] } {
  const family = sourced(standing);
  const asked = signed.filter((line) => fieldOf(line, 'scope').startsWith(`${family}/`) && fieldOf(line, 'value') === 'withdraw')
    .map((line) => fieldOf(line, 'scope').slice(family.length + 1));
  if (!asked.length) return { taken: [], refused: [] };
  /** A run rewrites every block of a test file under one observation, so a block whose title moved still holds a row
   * from an older one: what reads a file now is what the latest run of each test file wrote, and nothing older. */
  const memo = observedClaims(root, store, { wait: false }).filter((line) => fieldOf(line, 'measure') === 'memo');
  const fileOf = (scope: string): string => scope.split('/').slice(0, 2).join('/');
  const last = new Map<string, string>();
  for (const line of memo) last.set(fileOf(fieldOf(line, 'scope')), fieldOf(line, 'at'));
  const latest = new Map<string, string>();
  for (const line of memo) {
    const scope = fieldOf(line, 'scope');
    if (fieldOf(line, 'at') === last.get(fileOf(scope))) latest.set(scope, fieldOf(line, 'value'));
  }
  const refused: { path: string; by: string }[] = [];
  const taken: string[] = [];
  const ownOf = (inside: string): string | undefined => (/^test\/[^/]+\.test\.ts$/.test(inside) ? `vector-memo/${inside.slice('test/'.length)}/` : undefined);
  const leaving = asked.map((path) => ownOf(path.slice(path.indexOf('/') + 1))).filter((own): own is string => own !== undefined);
  const runs = (value: string): readonly string[] => value.split('|').filter((token) => token.startsWith('read:') && !token.includes('#')).map((token) => token.slice('read:'.length));
  for (const path of asked) {
    const inside = path.slice(path.indexOf('/') + 1);
    const own = ownOf(inside);
    const reads = (value: string): boolean => value.split('|').some((token) => token.startsWith(`in:${inside}:`) && /^[0-9a-f]{12}$/.test(token.slice(`in:${inside}:`.length)));
    const by = [...latest].find(([scope, value]) => (own === undefined || !scope.startsWith(own)) && reads(value))?.[0];
    const elsewhere = new Set([...latest].filter(([scope]) => !leaving.some((one) => scope.startsWith(one))).flatMap(([, value]) => runs(value)));
    const only = own === undefined ? undefined : [...latest].filter(([scope]) => scope.startsWith(own))
      .flatMap(([scope, value]) => runs(value).filter((name) => !elsewhere.has(name)).map((name) => `${scope}, the only run of ${name}`))[0];
    if (by !== undefined) refused.push({ path, by });
    else if (only !== undefined) refused.push({ path, by: only });
    else taken.push(path);
  }
  return { taken, refused };
}
