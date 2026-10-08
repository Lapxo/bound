import { join, renameSync, writeFileSync } from '../host/io.ts';
import { fieldOf, LOCK } from '../fold/claims.ts';
import { lockStanding } from '../fold/keys.ts';
import { placesIn } from '../fold/places.ts';
import { admittedIn, forksIn, tellOwn } from '../fold/signed.ts';
import { wordOf } from '../fold/wire.ts';
import { observeText } from '../observe/files.ts';
import { landShard, storeOf } from './ledger.ts';

export type Owned = { readonly ledger: readonly string[]; readonly own: ReadonlyMap<string, readonly string[]>; readonly nowhere: readonly string[]; readonly forked: readonly { readonly place: string; readonly key: string }[] };

/**
 * A lot named with --place lands in those own locks and not the ledger: a lot never mixes. A line the ledger does not admit is a place's own when that place's own lock admits it: signed by a key the tree admits,
 * inside the window it held, inside its coverage of the place, the line's scope read as a region of the place. An own
 * lock speaks of its place without naming it, so a line whose scope names a place first is the ledger's alone, and the
 * same line can stand in many own locks: named places take every line they admit, and with none named a line lands in
 * the one own lock that admits it. The lines are told to their locks for the gates and land in them signed, beside what
 * the ledger takes. A line no lock admits, or one two locks would take and no place names, is admitted nowhere, and a
 * batch that holds one is refused whole: nothing is ever written into a lock bare. An own lot never forks a lock: lines
 * that would leave a place's lock with two standing claims where it had one are refused whole, so a lot for many places
 * lands the same lines at each, and lines meant for one place go in a lot of their own.
 */
export function ownedOf(root: string, signed: readonly string[], admits: (line: string) => boolean, coverage: (by: string) => readonly string[], named: readonly string[] = [], placedAt: (line: string) => readonly string[] | undefined = () => undefined): Owned {
  const places = placesIn(root);
  const headed = (line: string): boolean => places.includes(fieldOf(line, 'scope').split('/')[0] ?? '');
  const ledger = named.length ? [] : signed.filter(admits);
  const rest = [...new Set(signed.filter((line) => (named.length || !admits(line)) && !headed(line)))];
  const placed = signed.filter((line) => !ledger.includes(line) && !rest.includes(line));
  if (!rest.length) return { ledger, own: new Map(), nowhere: placed, forked: [] };
  const family = wordOf(lockStanding(storeOf(root)), 'families', 'region');
  const covers = new Set(rest.map((line) => fieldOf(line, 'by')).flatMap((by) => coverage(by)));
  const namedOf = (line: string): readonly string[] => placedAt(line) ?? named;
  const asked = [...new Set(rest.flatMap((line) => (namedOf(line).length ? namedOf(line) : places)))].filter((place) => [...covers].some((prefix) => prefix === '*' || prefix.startsWith(`${family}/${place}/`) || prefix === `${family}/${place}`));
  const takers = new Map<string, string[]>();
  for (const place of asked) {
    tellOwn(place, rest);
    for (const line of rest) if ((!namedOf(line).length || namedOf(line).includes(place)) && admittedIn(root, place, line)) takers.set(line, [...(takers.get(line) ?? []), place]);
    tellOwn(place, []);
  }
  const lands = (line: string): boolean => (namedOf(line).length ? (takers.get(line)?.length ?? 0) > 0 : takers.get(line)?.length === 1);
  const own = new Map<string, string[]>();
  for (const line of rest.filter(lands)) for (const place of takers.get(line)!) own.set(place, [...(own.get(place) ?? []), line]);
  const forked = [...own].flatMap(([place, lines]) => {
    tellOwn(place, []);
    const before = new Set(forksIn(root, place));
    tellOwn(place, lines);
    return forksIn(root, place).filter((key) => !before.has(key)).map((key) => ({ place, key }));
  });
  return { ledger, own, nowhere: [...placed, ...rest.filter((line) => !lands(line))], forked };
}

/** A place's own lock gains the lines a batch landed there, appended whole: a reader never meets half of it, and every line already there keeps its bytes as they were. */
export function landOwned(root: string, place: string, lines: readonly string[], committed=false): void {
  if (!lines.length) return tellOwn(place, []);
  const at = join(root, place, LOCK);
  const text = observeText(at) ?? '';
  if(!committed) for (const by of new Set(lines.map(line => fieldOf(line, 'by')))) {
    landShard(storeOf(root), by, `${place}/${LOCK}`, lines.filter(line => fieldOf(line, 'by') === by));
  }
  writeFileSync(`${at}.${process.pid}.landing`, `${text.replace(/\n*$/, '\n')}${lines.join('\n')}\n`);
  renameSync(`${at}.${process.pid}.landing`, at);
  tellOwn(place, []);
}
