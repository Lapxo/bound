import {fileURLToPath} from 'node:url';
import {ingressReceipts} from '../host/ports/ingress.ts';
import {readOnly} from '../host/read-only.ts';
import { keyFor, lockLines, releaseOf, signedLockLines } from '../fold/keys.ts';
import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bytesDigest, fullDigest, memoized, signaturesOf, instrumentDigest } from '../fold/digests.ts';
import { claimKey, isConfig, fieldOf, foldClaims, LOCK, selfName } from '../fold/claims.ts';
import { asksThePlace } from '../fold/configures.ts';
import { receiptsIn } from '../fold/receipts.ts';
import { authorityFor, releaseSigner, rootSigner } from '../fold/signers.ts';
import { storeRoot } from '../host/ports/store.ts';
import { blobAt, landBlob, ledgerLines, storeOf } from '../land/ledger.ts';
import { observeText } from '../observe/files.ts';
import {appliedIn} from '../fold/signed.ts';
import { everLanded, inside, locationsOf } from '../land/vouched.ts';
import { renderTarget } from '../render/target.ts';

export const ownerOf = (store: string, told: readonly string[] = []): string => keyFor(store, 'authorize', told);

/** The signed lines standing in the lock: the owner's, and those of every key it admits to authorize, each in its own ledger. */
export function signedOwnerLines(store: string): string[] {
  return signedLockLines(store);
}

function forkReceipts(store: string, lines: readonly string[]): ReturnType<typeof receiptsIn> {
  const scopes = [...new Set(foldClaims(lines.filter(line => fieldOf(line, 'sig') !== '')).forks.map((f) => f.key.split(' ')[0] ?? ''))].filter(Boolean);
  return scopes.length ? receiptsIn(store, scopes) : [];
}

export function standingDemands(store: string): string[] {
  const lines = signedOwnerLines(store);
  return foldClaims(lines, forkReceipts(store, lines)).standing
    .filter((line) => asksThePlace(line) && fieldOf(line, 'value') !== 'withdraw');
}

/**
 * A demand is history when it asks about a place that is gone: one the tree once held and holds no more. It paid, or
 * did not, in its own time; whoever wants it again signs it against the region as it is. A place never held is not
 * gone — it is still to be made, and its demand stays live.
 */
export function historyOf(root: string, store: string, demands: readonly string[]): { readonly live: string[]; readonly history: string[] } {
  const held = [...everLanded(store)];
  const gone = (need: string): boolean => {
    const at = need.replace(/\/+$/, '');
    return !existsSync(join(root, at)) && held.some((coordinate) => coordinate === at || inside(coordinate, at));
  };
  const history = demands.filter((line) => locationsOf(fieldOf(line, 'needs')).locations.some(gone));
  return { live: demands.filter((line) => !history.includes(line)), history };
}

export function signedDemands(store: string, root = resolve('.')): string[] {
  return historyOf(root, store, standingDemands(store)).live;
}

export function forkedScopes(store: string): Set<string> {
  const lines = signedOwnerLines(store);
  return new Set(foldClaims(lines, forkReceipts(store, lines)).forks.flatMap((f) => f.lines.map((line) => fieldOf(line, 'scope'))));
}

/** Import receipts are local acts; foreign evidence and sender epochs never enter this input. */
export function localActLines(root: string, placed: readonly string[] = []): readonly string[] {
  const store=storeOf(root),local=lockLines(store),receipts=ingressReceipts(store);
  if(receipts.length){
    const authority=authorityFor(local,rootSigner(root),signaturesOf(store).admitted);
    for(const receipt of receipts){
      if(fieldOf(receipt,'scope')!=='receipts'||fieldOf(receipt,'role')!=='writes'||fieldOf(receipt,'form')!=='alphabet'||fieldOf(receipt,'measure')!=='digest'||authority.of(receipt).kind!=='admitted')throw Error('REFUSE·ingress local import receipt is not admitted');
    }
  }
  return [...local,...receipts,...placed.flatMap(place=>appliedIn(root,place))];
}

export function epochOf(lines: readonly string[]): number {
  return lines.reduce((top, line) => Math.max(top, Number(fieldOf(line, 'epoch')) || 0), 0);
}

export function targetFile(root: string): string {
  return join(storeRoot(root), LOCK);
}

export function renderInto(root: string, store: string): {
  readonly standing: number;
  readonly superseded: readonly string[];
  readonly forks: readonly { readonly key: string }[];
  readonly grey: readonly string[];
  readonly refused: readonly string[];
  readonly vacuous: readonly string[];
} {
  if (!lockLines(store).length) throw new Error(`${selfName()}: the owner ledger is empty; land it before rendering TARGET`);
  const rendered = renderedLock(root, store);
  if (releaseOf(store)) return rendered;
  const at = targetFile(root);
  writeFileSync(`${at}.render`, rendered.text);
  renameSync(`${at}.render`, at);
  return rendered;
}

const rendered = new WeakMap<readonly string[], Map<readonly string[], ReturnType<typeof renderTarget>>>();

/**
 * A release's lock is read as it was laid and never rendered over. Its target lines are true only where a pin names the
 * release, so here they stand grey; a line signed by a key the release does not carry is refused and does not stand.
 */
function readRelease(lines: readonly string[]): ReturnType<typeof renderTarget> {
  const of = authorityFor(lines, releaseSigner(lines), [], { digest: '', pins: [] }).of;
  const refused = lines.filter((line) => of(line).kind === 'refuse');
  const standing = lines.filter((line) => !refused.includes(line));
  return {
    text: `${standing.join('\n')}\n`, standing: standing.length, superseded: [], retracted: [], forks: [],
    grey: standing.filter((line) => of(line).kind === 'grey'), refused, vacuous: [],
  };
}

export function renderedLock(root: string, store: string, told: readonly string[] = []): ReturnType<typeof renderTarget> {
  const released = releaseOf(store);
  if (released && !told.length) return readRelease(released);
  const owned = [...lockLines(store), ...told];
  const render = (): ReturnType<typeof renderTarget> => renderTarget(owned, undefined, authorityFor(owned, rootSigner(root), signaturesOf(store, told).admitted).of, forkReceipts(store, owned));
  if (readOnly()) return render();
  if (told.length) {
    const byLock = rendered.get(lockLines(store)) ?? rendered.set(lockLines(store), new Map()).get(lockLines(store))!;
    return byLock.get(told) ?? byLock.set(told, render()).get(told)!;
  }
  const anchor = [join(storeRoot(root), `${selfName()}.keys`), join(storeOf(root), `${selfName()}.keys`)].map((at) => observeText(at) ?? '').join('\n');
  const judged = ledgerLines(store, 'judge');
  const key = `lock ${fullDigest(store, [instrumentDigest(store, fileURLToPath(import.meta.url), [], root), new Date().toISOString().slice(0, 10), anchor, `${judged.length} ${judged.at(-1) ?? ''}`, ...owned])}`;
  const held = memoized(store, key, () => {
    const bytes = new TextEncoder().encode(JSON.stringify(render()));
    const digest = bytesDigest(store, bytes);
    landBlob(store, digest, bytes);
    return digest;
  });
  const text = observeText(blobAt(store, held));
  return text === undefined ? render() : JSON.parse(text) as ReturnType<typeof renderTarget>;
}

export function forksJoinedBy(store: string, signed: readonly string[]): readonly { readonly key: string; readonly lines: readonly string[] }[] {
  signed=signed.filter(isConfig);
  const keys = new Set(signed.map(claimKey));
  const held = signedOwnerLines(store).filter((line) => isConfig(line) && keys.has(claimKey(line)));
  const vacuous = new Set(foldClaims(held, forkReceipts(store, held)).vacuous);
  const live = held.filter((line) => !vacuous.has(line));
  return foldClaims([...live, ...signed]).forks.filter((fork) => fork.lines.some((line) => signed.includes(line)));
}

export function forksItself(lines: readonly string[]): boolean {
  const bySigner = new Map<string, number>();
  for (const line of lines) bySigner.set(fieldOf(line, 'by'), (bySigner.get(fieldOf(line, 'by')) ?? 0) + 1);
  return [...bySigner.values()].some((n) => n > 1);
}

export function sideOf(line: string, landed: readonly string[]): string {
  const at = landed.indexOf(line);
  return ['value', 'at', 'needs', 'restsOn'].map((k) => `${k}=${fieldOf(line, k) || '∅'}`).join(' ') + ` landed=${at < 0 ? 'new' : `#${at + 1}`}`;
}
