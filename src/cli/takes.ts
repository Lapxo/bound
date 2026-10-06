import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fullDigest } from '../fold/digests.ts';
import { canonical } from '@lapxo/topos/wire';
import { fieldOf, foldClaims } from '../fold/claims.ts';
import { rolesOf } from '../fold/roles.ts';
import { writerFor } from '../fold/signers.ts';
import { judgeTake, sealed } from '../judge/take.ts';
import type { Gate } from '../judge/take.ts';
import { land, landEnvelope, ledgerLines, storeOf } from '../land/ledger.ts';
import { wordOf } from '../fold/wire.ts';
import type { CoordinateRole } from '../fold/wire.ts';
import { hasVouchedTree, inside, landCoordinates, coordinatesOf, locationsOf, vouchedCoordinates, witnessOf } from '../land/vouched.ts';
import { ownerOf, forkedScopes, signedOwnerLines } from './owner.ts';

export type Judged =
  | { readonly kind: 'refused'; readonly scope: string; readonly why: string }
  | { readonly kind: 'owed'; readonly scope: string; readonly why: string }
  | { readonly kind: 'conditioned'; readonly scope: string; readonly demand: string; readonly receipt: string; readonly condition: string }
  | {
    readonly kind: 'judged'; readonly scope: string; readonly demand: string; readonly locations: readonly string[];
    readonly before: ReadonlyMap<string, string>; readonly after: ReadonlyMap<string, string>; readonly verdict: ReturnType<typeof judgeTake>;
    readonly ignored: ReadonlyMap<string, number>; readonly started: number;
  };

export function judgeDemand(root: string, demand: string): Judged {
  const started = Date.now();
  const store = storeOf(root);
  const scope = fieldOf(demand, 'scope');
  const refuse = (why: string): Judged => ({ kind: 'refused', scope, why });
  if (!hasVouchedTree(store)) return refuse('no source is vouched; land the lock once');
  if (forkedScopes(store).has(scope)) return refuse('it stands as a fork; the owner narrows or withdraws one line first');
  const condition = fieldOf(demand, 'condition');
  if (condition) {
    const paid = ledgerLines(store, 'judge').filter((line) => fieldOf(line, 'scope') === condition && fieldOf(line, 'value') === 'present').pop();
    if (!paid) return { kind: 'owed', scope, why: `it rests on ${condition}, which has no FACT: it stands owed until that is paid` };
    const absent = locationsOf(fieldOf(demand, 'needs')).locations.filter((l) => !existsSync(join(root, l.replace(/\/$/, ''))));
    if (absent.length) return refuse(`demanded locations absent: ${absent.join(', ')}`);
    return { kind: 'conditioned', scope, demand, receipt: fieldOf(paid, 'at'), condition };
  }
  const { locations, refused } = locationsOf(fieldOf(demand, 'needs'));
  if (refused.length) return refuse(`needs that are not locations: ${refused.join(', ')}`);
  const roleOf = rolesOf(store);
  const ignored = new Map<string, number>();
  const walked = (coordinate: string): CoordinateRole => {
    const role = roleOf(coordinate);
    if (role !== 'source') ignored.set(role, (ignored.get(role) ?? 0) + 1);
    return role;
  };
  const before = new Map([...vouchedCoordinates(store)].filter(([coordinate]) => locations.some((l) => inside(coordinate, l)) && roleOf(coordinate) === 'source'));
  const after = new Map<string, string>();
  for (const location of locations) for (const [coordinate, digest] of coordinatesOf(root, location, walked)) after.set(coordinate, digest);
  const law = [scope.split('/').pop() ?? scope, fieldOf(demand, 'at').replace(/^witness:/, '')].filter(Boolean);
  const verdict = judgeTake({
    root, scope, value: fieldOf(demand, 'value'), locations, before, after, law,
    shape: fieldOf(demand, 'shape'), restsOn: fieldOf(demand, 'restsOn'), witnessOf: (coordinate) => witnessOf(root, coordinate),
    template: wordOf(foldClaims(signedOwnerLines(store)).standing, 'templates', '{roots}'),
  });
  return { kind: 'judged', scope, demand, locations, before, after, verdict, ignored, started };
}

/** A take its batch let land: its receipt sealed with the gates the batch passed, its cone vouched, its fact landed. */
export function landTake(root: string, one: Judged, gates: readonly Gate[]): void {
  const store = storeOf(root);
  if (one.kind === 'refused') return;
  if (one.kind === 'owed') {
    process.stdout.write(`OWED     take ${one.scope} · ${one.why}\n`);
    return;
  }
  if (one.kind === 'conditioned') {
    const { scope, demand, receipt, condition } = one;
    land(store, 'judge', [canonical({
      scope, role: 'writes', form: 'alphabet', measure: fieldOf(demand, 'measure') || 'status', value: fieldOf(demand, 'value') || 'present', by: 'judge', at: receipt, condition,
    })]);
    land(store, 'take', [canonical({ scope: `take/${scope}`, role: 'writes', form: 'alphabet', measure: 'status', value: 'fact', by: 'judge', at: receipt })]);
    process.stdout.write(`FACT     take ${scope} · paid by ${receipt} · condition ${condition} · no moved set\n`);
    return;
  }
  const { scope, demand, before, after, ignored, started } = one;
  const verdict = sealed(root, one.verdict, gates);
  const who = writerFor(signedOwnerLines(store), 'fold') ?? ownerOf(store);
  const cone = fullDigest(store, [...before].map(([path, digest]) => `${path} ${digest}`));
  land(store, 'take', [canonical({ scope: `take/${scope}`, role: 'writes', form: 'alphabet', measure: 'status', value: 'open', by: who, at: `place:${cone}` })]);
  landEnvelope(store, verdict.digest, `${JSON.stringify(verdict.envelope, null, 1)}\n`);
  const receipt = `receipt:${verdict.digest}`;
  const generation = fullDigest(store, [...after].sort().map(([coordinate, digest]) => `${coordinate} ${digest}`));
  land(store, 'judge', verdict.envelope.effects.map((effect) => canonical({
    scope: `${effect.kind}/${generation}`, role: 'writes', form: 'alphabet', measure: 'status', value: effect.status, by: 'judge', at: receipt,
  })));
  if (verdict.kind === 'fact') {
    const present = new Map(verdict.changed.filter((path) => after.has(path)).map((path) => [path, after.get(path) ?? '']));
    const gone = verdict.changed.filter((path) => !after.has(path));
    landCoordinates(store, present, gone, receipt);
    land(store, 'judge', [
      canonical({
        scope, role: 'writes', form: 'alphabet', measure: fieldOf(demand, 'measure') || 'status', value: fieldOf(demand, 'value') || 'present', by: 'judge', at: receipt,
      }),
      canonical({ scope, role: 'writes', form: 'alphabet', measure: 'cone', value: verdict.changed.join('|'), by: 'judge', at: receipt }),
    ]);
  }
  const ms = Date.now() - started;
  land(store, 'take', [
    canonical({ scope: `take/${scope}`, role: 'writes', form: 'alphabet', measure: 'status', value: verdict.kind, by: 'judge', at: receipt }),
    canonical({ scope: `take/${scope}`, role: 'writes', form: 'interval', measure: 'ms', value: `${ms}..${ms}`, by: 'judge', at: receipt }),
  ]);
  const effects = verdict.envelope.effects.map((e) => `${e.kind}@${e.at || '.'}:${e.admitted ? e.status : `${e.status}·grey`}(${e.ms} ms)`).join(' ') || 'none';
  process.stdout.write(
    `${verdict.kind === 'fact' ? 'FACT  ' : 'REFUSE'}   take ${scope} · ${verdict.why}\n`
    + `MOVED    ${verdict.changed.length} sources: ${verdict.changed.join(' ')}\n`
    + `IGNORED  ${[...ignored].map(([role, n]) => `${n} ${role}`).join(' · ') || 'none'} (not walked, never landed)\n`
    + `${verdict.notOwned.length ? `NOT OWN  ${verdict.notOwned.length} witnesses of other laws, left for them: ${verdict.notOwned.join(' ')}\n` : ''}`
    + `EFFECTS  ${effects}\n`
    + `RECEIPT  ${verdict.digest} · ${ms} ms\n`,
  );
}
