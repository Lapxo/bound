import { createHash, existsSync, join } from '../host/io.ts';
import { fullDigest } from '../fold/digests.ts';
import { answers, point, region } from '@lapxo/obligations/field';
import { parse, PROTOCOL } from '@lapxo/topos/wire';
import { observeText } from '../observe/files.ts';
import { storeOf } from '../land/ledger.ts';
import { holdsCases } from '../fold/paid.ts';

export interface Gate {
  readonly kind: string;
  readonly status: 'green' | 'red';
  readonly ms: number;
  readonly at: string;
  readonly admitted: boolean;
  readonly why: string;
}

interface Effect {
  readonly kind: string;
  readonly status: 'green' | 'red';
  readonly ms: number;
  readonly at: string;
  readonly admitted: boolean;
}

/** E: the demand, its cone, the coordinates before and after by digest, and the effects that ran over the cone; an effect the ledger has never seen green answers for nothing yet: it runs, it lands, and it refuses nothing. */
interface Envelope {
  readonly scope: string;
  readonly cone: readonly string[];
  readonly before: Readonly<Record<string, string>>;
  readonly after: Readonly<Record<string, string>>;
  readonly effects: readonly Effect[];
}

type Verdict =
  | { readonly kind: 'fact'; readonly why: string; readonly envelope: Envelope; readonly digest: string; readonly changed: readonly string[] }
  | { readonly kind: 'refuse'; readonly why: string; readonly envelope: Envelope; readonly digest: string; readonly changed: readonly string[] };

/** A demanded location is a region: it is there when some place of the tree answers to it, file or directory alike. */
function located(root: string, location: string): boolean {
  return existsSync(join(root, location.replace(/\/+$/, '')));
}


function namedEffects(_root: string, _changed: readonly string[], _ROOTS: string): Effect[] {
  return [];
}

export function judgeTake(input: {
  readonly root: string;
  readonly scope: string;
  readonly value: string;
  readonly locations: readonly string[];
  readonly before: ReadonlyMap<string, string>;
  readonly after: ReadonlyMap<string, string>;
  readonly law?: readonly string[];
  readonly template: string;
  readonly shape?: string;
  readonly restsOn?: string;
  readonly witnessOf?: (coordinate: string) => string | undefined;
}): Verdict & { readonly notOwned: readonly string[] } {
  const { root, scope, value, locations, before, after } = input;
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const moved = paths.filter((p) => before.get(p) !== after.get(p));
  const notOwned = moved.filter((coordinate) => {
    if (before.has(coordinate) || locations.includes(coordinate) || !input.witnessOf || !input.law) return false;
    const named = input.witnessOf(coordinate);
    return named !== undefined && !input.law.includes(named);
  });
  const changed = moved.filter((coordinate) => !notOwned.includes(coordinate));
  const absent = value === 'present' ? locations.filter((l) => !located(root, l)) : [];
  const effects = changed.length && !absent.length ? namedEffects(root, changed, input.template) : [];
  const envelope: Envelope = {
    scope,
    cone: [...locations],
    before: Object.fromEntries([...before].sort()),
    after: Object.fromEntries([...after].filter(([coordinate]) => !notOwned.includes(coordinate)).sort()),
    effects,
  };
  const digest = fullDigest(storeOf(root), JSON.stringify({ ...envelope, effects: effects.map((e) => ({ kind: e.kind, status: e.status, at: e.at })) }));
  const refuse = (why: string): Verdict & { readonly notOwned: readonly string[] } => ({ kind: 'refuse', why, envelope, digest, changed, notOwned });
  const met = (why: string): Verdict & { readonly notOwned: readonly string[] } => ({ kind: 'fact', why, envelope, digest, changed, notOwned });
  if (!changed.length) return refuse('nothing in the cone moved against what was vouched');
  const cone = locations.map((l) => region(l));
  const outside = changed.filter((coordinate) => !answers([point(coordinate)], cone));
  if (outside.length) return refuse(`outside the cone: ${outside.join(', ')}`);
  if (absent.length) return refuse(`demanded locations absent: ${absent.join(', ')}`);
  if (input.shape === 'lock' || input.shape === 'render') {
    const lines = locations.map((l) => ({ at: l, text: observeText(join(root, l)) }));
    const absent = lines.filter((one) => one.text === undefined).map((one) => one.at);
    if (absent.length) return refuse(`a lock the demand names is not here: ${absent.join(', ')}`);
    const said = lines.flatMap((one) => (one.text ?? '').split('\n').filter((line) => line.startsWith(PROTOCOL)));
    const unread = said.filter((line) => parse(line).kind !== 'fact');
    if (input.shape === 'lock' && (!said.length || unread.length)) {
      return refuse(`a lock the demand names holds ${said.length ? `${unread.length} lines the wire does not read` : 'no claim'}`);
    }
    const rests = input.restsOn ?? '';
    const digest = rests ? `sha256:${createHash('sha256').update(lines.map((one) => one.text ?? '').join('')).digest('hex')}` : rests;
    if (rests && digest !== rests) return refuse(`the lock moved: it rests on ${rests} and is ${digest}`);
    return met(input.shape === 'lock' ? `${said.length} lines of the lock read, at the digest it rests on` : 'the region is here, at the digest it rests on');
  }
  const vectors = locations.filter((l) => holdsCases(l) && located(root, l));
  if (!vectors.length) return refuse('no vector location in the cone exists');
  const red = effects.filter((e) => e.status === 'red' && e.admitted);
  if (red.length) return refuse(`effects red: ${red.map((e) => `${e.kind}@${e.at}`).join(', ')}`);
  return met('demand met in its cone');
}

/** A take that met its cone carries the gates its batch passed: their runs join its envelope, and its receipt is sealed with them. */
export function sealed<V extends { readonly envelope: Envelope; readonly digest: string }>(root: string, verdict: V, gates: readonly Gate[]): V {
  const envelope: Envelope = { ...verdict.envelope, effects: [...verdict.envelope.effects, ...gates.map(({ kind, status, ms, at, admitted }) => ({ kind, status, ms, at, admitted }))] };
  const digest = fullDigest(storeOf(root), JSON.stringify({ ...envelope, effects: envelope.effects.map((e) => ({ kind: e.kind, status: e.status, at: e.at })) }));
  return { ...verdict, envelope, digest };
}
