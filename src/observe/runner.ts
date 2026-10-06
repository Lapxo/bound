import { spawnSync } from 'node:child_process';
import { sha } from '../host/hash.ts';
import { existsSync, mkdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldOf } from '../fold/claims.ts';
import { observeFile, observeText } from './files.ts';
import { ownLockOf } from '../fold/signed.ts';
import { landBlob } from '../land/ledger.ts';
import { EXTENSION, LOCK, publicLock } from '@lapxo/topos/wire';
import {foldClaims,isWire} from '../fold/claims.ts';

const self = (): string => process.argv[1] ?? '';
const fromBlob = (): boolean => extname(existsSync(self()) ? realpathSync(self()) : self()) === '';

/**
 * Where the instrument lies and what it is run from: from source or compiled modules, bound is two steps above this runner module; as a blob, the command is a blob of the tree's store, named by the digest bound's own lock names for
 * it, and bound lies beside that store. Other processes use the same runtime directory and extension; only source readers receive source conditions. A name that resolves to no blob beside it is refused by name
 * before anything is started, never handed to the runtime as the store's own directory.
 */
// Blob bundles have no module URL; source and compiled modules carry their own entry location.
const moduleAt = fromBlob() ? undefined : fileURLToPath(import.meta.url);
const runtimeAt = moduleAt === undefined ? '' : resolve(dirname(moduleAt), '..');
const runtimeExtension = moduleAt === undefined ? '' : extname(moduleAt);
export const ownRoot = (): string => (fromBlob() ? join(resolve(dirname(self()), '..', '..', '..'), 'bound') : resolve(runtimeAt, '..'));
export const ownStore = (): string => join(ownRoot(), '..', EXTENSION);
/** The colocated public artifact is read without an unrelated parent's authority store. */
// An act is judged by the instrument it started with, even when that act changes its colocated lock.
let instrumentLock: readonly string[] | undefined;
export const ownLock = (): readonly string[] => {
  if (instrumentLock !== undefined) return instrumentLock;
  const lines=(observeText(join(ownRoot(),LOCK))??'').split('\n').filter(isWire);
  const published=publicLock(lines);
  instrumentLock = published===undefined ? ownLockOf(join(ownRoot(),'..'),basename(ownRoot()),true) : foldClaims(published).standing;
  return instrumentLock;
};
export const sourceOf = (): string => (fromBlob() ? join(ownRoot(), 'src', 'cli', 'verb.ts') : self());

export function processOf(name: string, folder?: string): string {
  if (!fromBlob()) return join(runtimeAt, folder ?? 'cli', `${name}${runtimeExtension}`);
  const named = ownLock().find((line) => fieldOf(line, 'scope') === `runner/${name}`);
  const blob = fieldOf(named ?? '', 'value').replace(/^[^:]*:/, '');
  if (!blob || !existsSync(join(dirname(self()), blob))) {
    throw new Error(`${basename(ownRoot())}: REFUSE·alias runner/${name} resolves to no blob: ${named === undefined ? 'no signed line of the instrument\'s own lock names it' : `${fieldOf(named, 'value')} is not beside ${basename(self())}`}`);
  }
  return join(dirname(self()), blob);
}

/**
 * A reader's code is what the bundler takes of it: its module and every file that module imports, wherever it lies, as
 * one blob of the tree's store named by the digest of its bytes. The files the bundler read, at the stamps they had, key
 * the blob, so it is built again only when one of them moved, and a helper a step above the module is one of them.
 */
export function bundleOf(module: string): string | undefined {
  const tree = join(ownRoot(), '..');
  const named = fieldOf(ownLock().find((line) => fieldOf(line, 'scope') === 'host/bundler') ?? '', 'value');
  const bundler = named && existsSync(join(tree, named)) ? join(tree, named) : '';
  if (!bundler) return undefined;
  const store = join(tree, EXTENSION);
  const stamp = (coordinate: string): string => ((at) => (at === undefined ? '' : `${at.mtimeMs} ${at.size}`))(statSync(join(tree, coordinate), { throwIfNoEntry: false }));
  const index = join(store, 'cas', 'built', sha(`bundle ${module}`));
  const held = JSON.parse(observeText(index) ?? 'null') as { readonly blob: string; readonly inputs: readonly (readonly [string, string])[] } | null;
  if (held !== null && existsSync(join(store, 'cas', 'blobs', held.blob)) && held.inputs.every(([coordinate, was]) => stamp(coordinate) === was)) return held.blob;
  const [meta, out] = [`${index}.${process.pid}.json`, `${index}.${process.pid}.js`];
  mkdirSync(dirname(index), { recursive: true });
  const built = spawnSync(bundler, [module, '--bundle', '--platform=node', '--format=cjs', '--external:typescript', '--log-level=error', `--metafile=${meta}`, `--outfile=${out}`], { cwd: tree });
  const inputs = Object.keys((JSON.parse(observeText(meta) ?? '{}') as { readonly inputs?: Readonly<Record<string, unknown>> }).inputs ?? {}).sort();
  const bytes = observeFile(out);
  rmSync(meta, { force: true });
  rmSync(out, { force: true });
  if (built.status !== 0 || bytes === undefined || !bytes.length || !inputs.length) return undefined;
  const hex = sha(bytes);
  landBlob(store, `sha256:${hex}`, bytes);
  writeFileSync(index, `${JSON.stringify({ blob: hex, inputs: inputs.map((coordinate) => [coordinate, stamp(coordinate)]) })}\n`);
  return hex;
}

/** A reader run by a blob is a blob itself: its bundle, with everything it imports but the compiler. */
export function readerOf(module: string): { readonly path: string; readonly flags: readonly string[] } {
  const source = { path: module, flags: runtimeExtension === '.ts' ? ['--disable-warning=ExperimentalWarning', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON'] : [] };
  const hex = fromBlob() ? bundleOf(module) : undefined;
  return hex === undefined ? source : { path: join(ownStore(), 'cas', 'blobs', hex), flags: [] };
}
