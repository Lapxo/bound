import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { basename, dirname, existsSync, join, mkdirSync, rmSync, writeFileSync } from '../host/io.ts';
import { selfName } from '../fold/claims.ts';
import { placesIn } from '../fold/places.ts';
import { coordinatesUnder, observeText } from '../observe/files.ts';

interface Holder { readonly pid: number; readonly what: string; readonly since: string; readonly token: string }
interface Frame { readonly parent?: Frame; readonly locks: Map<string, string> }
const context = new AsyncLocalStorage<Frame>();
const held = new Map<string, string>();
const pauseFor = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });
const ROOT = '_root';
const MINUTE = 60_000;

const holderOf = (at: string): Holder | undefined => {
  const text = observeText(at);
  if (text === undefined) return undefined;
  const [pid, what, since, token] = text.trim().split(' ');
  return { pid: Number(pid), what: what ?? '', since: since ?? '', token: token ?? '' };
};

function overAMinute(at: string, began: number, holder: Holder | undefined): void {
  if (Date.now() - began < MINUTE) return;
  const who = holder === undefined ? 'a process' : `${holder.pid} · ${holder.what} since ${holder.since}`;
  process.stderr.write(`RED      wait · ${named(at)} is held by ${who} · a wait over a minute is a red, not a pause\n`);
  throw new Error(`${selfName()}: REFUSE·stale nothing landed · a wait over a minute is a red, not a pause`);
}

const alive = (pid: number): boolean => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};

const regionAt = (store: string, region: string): string => {
  const coordinate = region.replace(/\/+$/, '');
  if ((coordinate && coordinate.split('/').some((step) => step === '..' || step === '.' || step === '')) || coordinate.startsWith('/')) throw new Error(`${selfName()}: REFUSE·lock invalid region coordinate`);
  return join(store, 'locks', coordinate ? encodeURIComponent(coordinate).replace(/^\./, '%2E').replace(/^_root$/, '%5Froot') : ROOT);
};
const coordinateOf = (file: string): string => {
  if (file === ROOT) return '';
  try { return decodeURIComponent(file); } catch { return file; }
};
const lockFiles = (locks: string): readonly string[] => coordinatesUnder(locks, locks).filter((file) => {
  if (file !== '.act') return true;
  // The legacy marker lists paths, while an actual region named .act has a numeric lock owner.
  const holder = holderOf(join(locks, file));
  return holder !== undefined && Number.isSafeInteger(holder.pid) && holder.pid > 0;
});
const overlaps = (a: string, b: string): boolean => !a || !b || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const treeAt = (store: string): string => join(store, 'lock');
const named = (at: string): string => (basename(at) === 'lock' ? 'the store' : basename(at).startsWith('@authority-') ? 'root authority' : basename(at) === '@projection' ? 'root projection' : `region ${basename(at) === ROOT ? '.' : basename(at)}`);
const owns = (at: string): boolean => {
  for (let frame = context.getStore(); frame !== undefined; frame = frame.parent) {
    const token = frame.locks.get(at);
    if (token !== undefined && held.get(at) === token) return true;
  }
  return false;
};

const ownsRegion = (store: string): boolean => [...held.keys()].some((at) => at.startsWith(`${join(store, 'locks')}/`) && owns(at));
const ownsAuthority = (store: string): boolean => [...held.keys()].some((at) => dirname(at) === join(store, 'locks') && basename(at).startsWith('@authority-') && owns(at));
const projectionAt = (store: string): string => join(store, 'locks', '@projection');

/** Reentry belongs to an awaited act's context. Another process or async act has no inherited authority. */
async function hold(at: string, what: string): Promise<void> {
  if (owns(at)) return;
  const frame = context.getStore();
  if (frame === undefined) throw new Error(`${selfName()}: REFUSE·lock no act owns this request`);
  const began = Date.now();
  const token = randomUUID();
  let told = false;
  mkdirSync(dirname(at), { recursive: true });
  for (;;) {
    try {
      writeFileSync(at, `${process.pid} ${what.replace(/\s+/g, '_')} ${new Date().toISOString()} ${token}\n`, { flag: 'wx' });
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') mkdirSync(dirname(at), { recursive: true });
      else if (code !== 'EEXIST') throw error;
    }
    const holder = holderOf(at);
    // Removing a dead owner's lock here would race with another process's recovery. Recovery is a separate host act.
    if (holder !== undefined && !alive(holder.pid)) {
      throw new Error(`${selfName()}: REFUSE·stale ${named(at)} belongs to exited process ${holder.pid}; host recovery required`);
    }
    overAMinute(at, began, holder);
    if (!told && holder !== undefined) {
      process.stderr.write(`WAIT     ${named(at)} is held by ${holder.pid} · ${holder.what} since ${holder.since}\n`);
      told = true;
    }
    await pauseFor(250);
  }
  if (told) process.stderr.write(`HELD     ${named(at)} after ${Date.now() - began} ms waiting\n`);
  held.set(at, token);
  frame.locks.set(at, token);
  if (!process.listeners('exit').includes(releaseAll)) process.once('exit', releaseAll);
}

function release(at: string, token: string): void {
  if (held.get(at) !== token) return;
  held.delete(at);
  const holder = holderOf(at);
  if (holder?.pid === process.pid && holder.token === token && existsSync(at)) rmSync(at, { force: true });
}

function releaseAll(): void {
  for (const [at, token] of [...held]) release(at, token);
}

process.once('SIGTERM', () => {
  process.stderr.write(`${selfName()}: REFUSE·crash signal\n`);
  releaseAll();
  process.exit(1);
});

async function framed<T>(takes: () => Promise<void>, act: () => T | Promise<T>): Promise<T> {
  const frame: Frame = { parent: context.getStore(), locks: new Map() };
  return context.run(frame, async () => {
    try {
      await takes();
      return await act();
    } finally {
      for (const [at, token] of [...frame.locks].reverse()) release(at, token);
      frame.locks.clear();
    }
  });
}

function guardedRegions<T>(store: string, regions: readonly string[], what: string, act: () => T | Promise<T>, rootAuthority: boolean): Promise<T> {
  return framed(async () => {
    const tree = treeAt(store);
    const asked = [...new Set((regions.length ? regions : ['']).map((one) => one.replace(/\/+$/, '')))];
    if (rootAuthority && (asked.includes('') || (ownsRegion(store) && !owns(tree) && !ownsAuthority(store)))) throw new Error(`${selfName()}: REFUSE·lock authority dependencies and child regions must be declared together`);
    if (owns(tree) || asked.every((region) => owns(regionAt(store, region)))) {
      for (const region of asked) await hold(regionAt(store, region), what);
      return;
    }
    if (ownsRegion(store)) throw new Error(`${selfName()}: REFUSE·lock declare every region before entering an act`);
    const already = owns(tree);
    // The tree lock is the acquisition gate. A whole-tree act cannot enter between checking it and taking regions.
    await hold(tree, what);
    try {
      const locks = join(store, 'locks');
      for (;;) {
        const conflict = lockFiles(locks).find((file) => !owns(join(locks, file))
          && (file.startsWith('@authority-') || file === '@projection' ? asked.includes('')
            : asked.some((region) => overlaps(region, file) || overlaps(region, coordinateOf(file)))));
        if (conflict === undefined) break;
        const at = join(locks, conflict);
        const began = Date.now();
        let told = false;
        for (let holder = holderOf(at); holder !== undefined; holder = holderOf(at)) {
          if (!alive(holder.pid)) throw new Error(`${selfName()}: REFUSE·stale ${named(at)} belongs to exited process ${holder.pid}; host recovery required`);
          overAMinute(at, began, holder);
          if (!told) {
            process.stderr.write(`WAIT     ${named(at)} is held by ${holder.pid} · ${holder.what} since ${holder.since}\n`);
            told = true;
          }
          await pauseFor(250);
        }
        if (told) process.stderr.write(`HELD     ${named(at)} after ${Date.now() - began} ms waiting\n`);
      }
      // Registered under the same acquisition gate as every legacy writer.
      // Root writes overlap all locks; siblings keep distinct region locks.
      // '@' is encoded for real region coordinates, so this is host bookkeeping.
      if (rootAuthority) await hold(join(store, 'locks', `@authority-${randomUUID()}`), what);
      for (const region of asked.filter(Boolean).sort()) await hold(regionAt(store, region), what);
      if (asked.includes('')) await hold(regionAt(store, ''), what);
    } finally {
      if (!already) {
        const frame = context.getStore()!;
        const token = frame.locks.get(tree);
        if (token !== undefined) {
          release(tree, token);
          frame.locks.delete(tree);
        }
      }
    }
  }, act);
}

export function underTheRegions<T>(store: string, regions: readonly string[], what: string, act: () => T | Promise<T>): Promise<T> {
  return guardedRegions(store, regions, what, act, false);
}

/** Protect the root authority/policy read through child publication. This is
 * exclusion only: callers must authenticate contexts and compare prepared heads
 * while held. It creates no grant, clock advance, lease or automatic recovery. */
export function underAuthorityRegions<T>(store: string, regions: readonly string[], what: string, act: () => T | Promise<T>): Promise<T> {
  return guardedRegions(store, regions, what, act, true);
}

/** Protect an authority snapshot without taking a child region. The acquisition
 * gate and temporary root marker exclude a root mutation while registering the
 * shared read; existing child acts continue independently. This is exclusion,
 * never authorization or a clock advance. */
export function underRootAuthority<T>(store: string, what: string, act: () => T | Promise<T>): Promise<T> {
  return framed(async () => {
    const tree = treeAt(store), root = regionAt(store, '');
    if (owns(tree) || owns(root) || ownsAuthority(store)) return;
    if (ownsRegion(store)) throw new Error(`${selfName()}: REFUSE·lock authority dependencies must be declared before entering a region act`);
    await hold(tree, what);
    try {
      await hold(root, what);
      await hold(join(store, 'locks', `@authority-${randomUUID()}`), what);
    } finally {
      const frame = context.getStore()!;
      for (const at of [root, tree]) {
        const token = frame.locks.get(at);
        if (token !== undefined) { release(at, token); frame.locks.delete(at); }
      }
    }
  }, act);
}

export interface RootAuthorityProtection {
  readonly store: string;
  readonly lock: string;
  readonly pid: number;
  readonly token: string;
}

/** The fixed host may hand its child evidence of an actual held exclusion.
 * It is an operational envelope, not a grant, signer or receipt identity. */
export function rootAuthorityProtection(store: string): RootAuthorityProtection {
  const locks=[treeAt(store),regionAt(store,''),...held.keys()].filter(at=>
    at===treeAt(store)||at===regionAt(store,'')||dirname(at)===join(store,'locks')&&basename(at).startsWith('@authority-'));
  const lock=locks.find(owns);
  if(lock===undefined)throw Error(`${selfName()}: REFUSE·lock root authority is not protected`);
  const holder=holderOf(lock);
  if(holder?.pid!==process.pid||holder.token!==held.get(lock))throw Error(`${selfName()}: REFUSE·lock authority protection changed`);
  return Object.freeze({store,lock,pid:holder.pid,token:holder.token});
}

/** expectedStore and expectedParent come from the fixed host's inheritance
 * channel, never from world data. Matching a live lock proves exclusion only;
 * signature, coverage and current context still require verification. */
export function assertRootAuthorityProtection(proof: RootAuthorityProtection, expectedStore: string, expectedParent: number): void {
  if(!proof||proof.store!==expectedStore||!Number.isSafeInteger(expectedParent)||expectedParent<=0||proof.pid!==expectedParent
    ||typeof proof.lock!=='string'||typeof proof.token!=='string'||!proof.token
    ||!(proof.lock===treeAt(expectedStore)||proof.lock===regionAt(expectedStore,'')
      ||dirname(proof.lock)===join(expectedStore,'locks')&&basename(proof.lock).startsWith('@authority-'))) {
    throw Error(`${selfName()}: REFUSE·lock invalid inherited authority protection`);
  }
  const holder=holderOf(proof.lock);
  if(!alive(expectedParent)||holder?.pid!==proof.pid||holder.token!==proof.token)throw Error(`${selfName()}: REFUSE·lock inherited authority protection ended`);
}

/** A child can publish independently, but the joined root projection and its
 * derived ledger appends have one writer. Authority protection already excludes
 * root mutations, so this lock needs no acquisition-gate upgrade. */
export function underRootProjection<T>(store: string, what: string, act: () => T | Promise<T>): Promise<T> {
  return framed(async () => {
    if (owns(treeAt(store)) || owns(regionAt(store, ''))) return;
    if (!ownsAuthority(store)) throw new Error(`${selfName()}: REFUSE·lock root projection requires authority protection`);
    await hold(projectionAt(store), what);
  }, act);
}

export const holdRoot = async (store: string, what: string): Promise<void> => {
  if (!owns(treeAt(store))) await hold(regionAt(store, ''), what);
};

export function underTheLock<T>(store: string, what: string, act: () => T | Promise<T>): Promise<T> {
  return framed(async () => {
    if (!owns(treeAt(store)) && ownsRegion(store)) throw new Error(`${selfName()}: REFUSE·lock a region act cannot upgrade to the tree; declare the tree before entering`);
    await hold(treeAt(store), what);
    const locks = join(store, 'locks');
    const active = lockFiles(locks);
    for (const file of [...active].sort()) await hold(join(locks, file), what);
    for (const region of [...placesIn(dirname(store))].sort()) await hold(regionAt(store, region), what);
    await hold(regionAt(store, ''), what);
  }, act);
}

export const holds = (store: string, region: string): boolean => [treeAt(store), regionAt(store, region)].some(owns);
