import {readOnly} from '../host/read-only.ts';
import {snapshotVerdict} from './evidence.ts';
import { dirname, resolve, spawnSync } from '../host/io.ts';
import { ledgerLines } from '../land/ledger.ts';
import { ownLock } from '../observe/runner.ts';
import { fieldOf } from './claims.ts';
import { keyOf, lockLines } from './keys.ts';
import { digestsOf, finerOf, regionsOf } from './region.ts';
import { said } from './wire.ts';



export interface SecondHead {
  /** What its latest word says of this fold: the same lines stand, other lines stand, it read another ledger, its key is not admitted, or it never spoke. */
  readonly verdict: 'agrees' | 'forks' | 'stale' | 'grey' | 'none';
  /**
   * A head counts as an origin of its own only once it has disagreed: until then it may be this one again (L16); and
   * the epoch of its latest word, wherever it said it, which a clone reads as history and not as its own.
   */
  readonly external: boolean;
  readonly epoch: number;
  readonly apart?: readonly string[];
}

import { sha } from '../host/hash.ts';

const asked = new Map<string, 'agrees' | 'forks' | undefined>();

function askedNow(store: string, rests: string): 'agrees' | 'forks' | undefined {
  if (readOnly()) return undefined;
  const root = dirname(store);
  const key = `${root} ${rests}`;
  if (asked.has(key)) return asked.get(key);
  const argv = said(ownLock(), 'head/second');
  const got = argv.length ? spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
    resolve(root, argv[0]!), ...argv.slice(1), root], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }) : undefined;
  const line = got === undefined || got.status !== 0 || typeof got.stdout !== 'string' ? undefined : got.stdout.split('\n').find((one) => one.startsWith('VERIFY'));
  const word = line === undefined ? undefined : line.slice('VERIFY'.length).trim().split(' ')[0];
  const verdict = word === 'agrees' || word === 'forks' ? word : undefined;
  asked.set(key, verdict);
  return verdict;
}

/**
 * The second head's word, read against this fold. It attests the digest of the lines it found standing and the digest
 * of the lines of the ledger it folded, in whatever order a store landed them, so a clone that lands the same lines
 * agrees; agreement is an encounter, disagreement a fork. A word about another lock is not read as this one's: the head
 * bound's own lock names is asked now over the ledger as it stands, with no key, and what it says is read, never kept.
 */
export function secondHead(store: string, standing: readonly string[], admitted: (line: string) => boolean, owned: readonly string[] = lockLines(store)): SecondHead {
  const head = keyOf(store, 'attest');
  const said = head === undefined ? [] : ledgerLines(store, head).filter((line) => fieldOf(line, 'scope') === `${head}/target`);
  const last = said.at(-1);
  const lines = owned.filter((line) => /\bsig=/.test(line));
  const rests = `sha256:${sha([...new Set(lines)].sort().join('\n'))}`;
  const epoch = lines.reduce((most,line)=>Math.max(most,Number(fieldOf(line,'epoch'))||0),0);
  const input = {
    declared: head !== undefined,
    expected: {set:lines.length ? rests : undefined,standing:`place:sha256:${sha([...new Set(standing)].sort().join('\n'))}`,epoch},
    ...(last ? {statement:{admitted:admitted(last),set:fieldOf(last,'restsOn'),standing:fieldOf(last,'at'),epoch:Number(fieldOf(last,'epoch'))||0}} : {}),
    priorDisagreement:said.some(line=>fieldOf(line,'value')==='forks'&&admitted(line)),
  };
  let result = snapshotVerdict(input);
  if (result.verdict === 'stale' && last && lines.length) {
    const now = askedNow(store, rests);
    if (now !== undefined) result = snapshotVerdict({...input,comparison:{admitted:true,set:rests,verdict:now,epoch}});
  }
  if (result.verdict !== 'forks' || head === undefined || last === undefined || fieldOf(last,'restsOn') !== rests) return result;
  const theirs = new Map(ledgerLines(store, head).filter((line) => fieldOf(line, 'scope').startsWith(`${head}/region/`) && fieldOf(line, 'restsOn') === fieldOf(last, 'restsOn'))
    .map((line) => [fieldOf(line, 'scope').slice(`${head}/region/`.length).replace(/^\.$/, ''), fieldOf(line, 'value')] as const));
  if (!theirs.size) return result;
  const regions = regionsOf(standing, standing, []);
  const [ours, finer] = [digestsOf(regions), finerOf(regions)];
  const apart: string[] = [];
  const descend = (region: string): void => {
    if (theirs.get(region) === ours.get(region)) return;
    apart.push(region || '.');
    for (const one of finer.get(region) ?? []) descend(one);
  };
  descend('');
  return {...result,apart};
}
