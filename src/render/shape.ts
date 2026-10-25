import { join } from '../host/io.ts';
import { coherence } from '@lapxo/obligations/views/field';
import { fieldOf } from '../fold/claims.ts';
import { ledgerLines } from '../land/ledger.ts';
import { coordinatesUnder } from '../observe/files.ts';
import { rolesOf } from '../fold/roles.ts';
import type { PlaceFold } from '../cli/place.ts';

interface Held {
  readonly origins: ReadonlySet<string>;
  readonly epochs: readonly number[];
  readonly alone: number;
  readonly scopes: number;
}

const headOf = (scope: string): string => scope.split('/')[0] ?? scope;

/**
 * A region of the tree read as a cell of the field: its origins are everyone who spoke there, the head that signed a
 * line and the reader that landed a reading alike, and its epochs are when they spoke. A scope only one of them ever
 * touched is where the region rests on a single origin. What figure the region makes, whether it holds without any
 * one of them, how wide in epochs it is and how together its lines arrived are the five questions the algebra asks of
 * a cell, asked of the lock that measures the tree.
 */
function regionsOf(fold: PlaceFold): ReadonlyMap<string, Held> {
  const origins = new Map<string, Set<string>>();
  const epochs = new Map<string, number[]>();
  const scopes = new Map<string, Map<string, Set<string>>>();
  const spoke = (at: string, by: string, epoch: number): void => {
    const head = headOf(at);
    origins.set(head, (origins.get(head) ?? new Set()).add(by));
    epochs.set(head, [...(epochs.get(head) ?? []), epoch]);
    const inside = scopes.get(head) ?? new Map<string, Set<string>>();
    inside.set(at, (inside.get(at) ?? new Set()).add(by));
    scopes.set(head, inside);
  };
  for (const line of fold.standing) spoke(fieldOf(line, 'scope'), fieldOf(line, 'by'), Number(fieldOf(line, 'epoch')) || 0);
  for (const line of fold.observed) spoke(fieldOf(line, 'scope'), fieldOf(line, 'by'), fold.epoch);
  return new Map([...origins].sort().map(([head, said]) => [head, {
    origins: said,
    epochs: epochs.get(head) ?? [],
    alone: [...(scopes.get(head) ?? new Map()).values()].filter((by) => by.size < 2).length,
    scopes: (scopes.get(head) ?? new Map()).size,
  }]));
}

const shapeOf = (held: Held): string => (held.origins.size > 2 ? 'polygon' : held.origins.size === 2 ? 'edge' : 'point');
const widthOf = (held: Held): number => Math.max(...held.epochs) - Math.min(...held.epochs);
const rhythmOf = (held: Held): string => `${new Set(held.epochs).size} of ${widthOf(held) + 1}`;
const periodOf = (fold: PlaceFold): number => fold.epoch + 1;
const togetherness = (held: Held, period: number): number =>
  coherence(held.epochs.map((epoch, i) => ({ origin: String(i), epoch, span: { lo: 0, hi: 1 } })), period);

export function shapeLines(fold: PlaceFold): readonly string[] {
  const period = periodOf(fold);
  return [...regionsOf(fold)].map(([head, held]) =>
    `SHAPE    ${head} · ${shapeOf(held)} of ${held.origins.size} · ${held.alone ? 'fragile' : 'robust'} · coherence ${togetherness(held, period).toFixed(2)}`
    + ` · width ${widthOf(held)} · rhythm ${rhythmOf(held)}`);
}

/**
 * What moved a verdict: the world under it, or a head that signed. A demand whose judgement came out differently than
 * the time before moved by observation unless its own line was re-signed, in which case the lock moved and not the
 * world; a verdict moved by a signature is not the world moving.
 */
export function moved(fold: PlaceFold): { readonly observation: number; readonly signature: number } {
  const said = new Map<string, string>();
  const turned = new Set<string>();
  for (const line of ledgerLines(fold.store, 'judge')) {
    const at = fieldOf(line, 'scope');
    const value = fieldOf(line, 'value');
    if (said.has(at) && said.get(at) !== value) turned.add(at);
    said.set(at, value);
  }
  const resigned = new Set(fold.history.map((line) => fieldOf(line, 'scope')));
  const signature = [...turned].filter((at) => resigned.has(at)).length;
  return { observation: turned.size - signature, signature };
}

/** The source coordinates of the tree no reader has reached: the number that falls when knowing advances. The walk never enters the store or a foreign directory, whose coordinates are never sources. */
export function horizonOf(fold: PlaceFold): { readonly unread: number; readonly sources: number } {
  const role = rolesOf(fold.store);
  const sources = coordinatesUnder(join(fold.root, fold.under ?? ''), fold.root, (dir) => dir === '' || (role(dir) !== 'foreign' && join(fold.root, dir) !== fold.store))
    .filter((coordinate) => role(coordinate) === 'source');
  const seen = new Set(fold.observed.map((line) => fieldOf(line, 'scope')));
  return { unread: sources.filter((coordinate) => !seen.has(coordinate)).length, sources: sources.length };
}
