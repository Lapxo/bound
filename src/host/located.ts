import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pinExport, provide } from './provide.ts';

type Module = Readonly<Record<string, unknown>>;
type Handed = Readonly<Record<string, string>>;
const wanted = (role: string): readonly string[] => role === 'reader' ? ['observe', 'run'] : [role];
const foreign = (role: string): readonly string[] => ['render', 'receipt', 'observe', 'run'].filter((name) => !wanted(role).includes(name));
const isFn = (module: Module, name: string): boolean => typeof module[name] === 'function';
const text = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').trim();

/**
 * Wire and capsule of the world, from `dep/topos` (or the lock's `uses/topos` pin). The host never spells where that
 * package lies.
 */
const sdk = async (): Promise<{
  readonly CAPSULE: string;
  readonly PROTOCOL: string;
  readonly parse: (line: string) => { kind: string; value: { fields: Handed } };
  readonly declarationOf: (lines: readonly string[]) => { regions: Record<string, readonly string[]>; writes: Record<string, string> };
  readonly readers: (held: never) => Module;
  readonly receiptShell: (held: never) => unknown;
  readonly shell: (held: never) => unknown;
}> => {
  provide();
  const [wireAt, capsuleAt] = [pinExport('topos', './wire'), pinExport('topos', './capsule')];
  if (!wireAt || !capsuleAt) throw new Error('REFUSE·pin dep/topos names no wire or capsule');
  const [wire, capsule] = await Promise.all([import(pathToFileURL(wireAt).href), import(pathToFileURL(capsuleAt).href)]) as [Module, Module];
  return {
    CAPSULE: String(wire['CAPSULE'] ?? ''),
    PROTOCOL: String(wire['PROTOCOL'] ?? ''),
    parse: wire['parse'] as (line: string) => { kind: string; value: { fields: Handed } },
    declarationOf: capsule['declarationOf'] as (lines: readonly string[]) => { regions: Record<string, readonly string[]>; writes: Record<string, string> },
    readers: capsule['readers'] as (held: never) => Module,
    receiptShell: capsule['receiptShell'] as (held: never) => unknown,
    shell: capsule['shell'] as (held: never) => unknown,
  };
};

/**
 * The host loads a world from its lock: the lock read once, each region imported from its one file by name and role into
 * the shell of its kind. A region that fails is one line on stderr and is left out; the regions that loaded still form
 * the shell. A world with no region of a kind has no shell of it. `load` is the host's child entry, the same load with
 * its places read from the arguments the host spawned it with.
 */
/** A capsule that ships one render module: the host calls it per region and hands it the lines. The module does not read. */
const pagesOf = async (root: string, file: string): Promise<Module> => {
  const { CAPSULE, PROTOCOL, declarationOf, shell } = await sdk();
  const lines = readFileSync(join(root, CAPSULE), 'utf8').split('\n').filter((line) => line.startsWith(PROTOCOL));
  const { regions } = declarationOf(lines);
  const module = await import(pathToFileURL(join(root, file)).href) as Module;
  const render = module['render'] ?? (module['default'] as Module | undefined)?.['render'];
  if (typeof render !== 'function') return {};
  const held = Object.fromEntries(Object.entries(regions).map(([name, reads]) => [name, {
    reads,
    region: (asked: { readonly region?: string }) => (render as (asked: { readonly region?: string }) => readonly string[])({ ...asked, region: name }),
  }]));
  return held && Object.keys(held).length ? { render: shell(held as never) } : {};
};

export const locate = async (root: string, dir: string, ext: string): Promise<Module> => {
  if (ext === 'render') return pagesOf(root, dir);
  const { CAPSULE, PROTOCOL, parse, declarationOf, readers, receiptShell, shell } = await sdk();
  const lines = readFileSync(join(root, CAPSULE), 'utf8').split('\n').filter((line) => line.startsWith(PROTOCOL));
  const field = (line: string, name: string): string => ((got) => (got.kind === 'fact' ? got.value.fields[name] ?? '' : ''))(parse(line));
  const { regions, writes } = declarationOf(lines);
  const reader = new Set(lines.filter((line) => field(line, 'measure') === 'writes').map((line) => field(line, 'scope').slice('region/'.length)));
  const kind = (name: string): string => (reader.has(name) ? 'reader' : writes[name] ?? '');
  const region = async (name: string, reads: readonly string[], role: string): Promise<readonly [string, Record<string, unknown>] | undefined> => {
    let module: Module;
    try {
      module = await import(pathToFileURL(join(root, dir, `${name}${ext}`)).href) as Module;
    } catch (error) {
      process.stderr.write(`LOAD     ${name} · module error · ${text(error)}\n`);
      return undefined;
    }
    const has = wanted(role).filter((key) => isFn(module, key));
    const exported = foreign(role).filter((key) => isFn(module, key));
    if (!has.length && exported.length) {
      process.stderr.write(`LOAD     ${name} · role mismatch · ${role} exports ${exported.join('|')}\n`);
      return undefined;
    }
    if (!has.length) {
      process.stderr.write(`LOAD     ${name} · missing export · ${wanted(role)[0]}\n`);
      return undefined;
    }
    const picked = role === 'reader' ? { observe: module['observe'], run: module['run'] } : { region: module[role] };
    return [name, { reads, ...picked }];
  };
  const loaded = async (role: string): Promise<Record<string, unknown> | undefined> => {
    const held: (readonly [string, Record<string, unknown>])[] = [];
    for (const [name, reads] of Object.entries(regions)) {
      if (kind(name) !== role) continue;
      const row = await region(name, reads, role);
      if (row) held.push(row);
    }
    return held.length ? Object.fromEntries(held) : undefined;
  };
  const render = await loaded('render');
  const receipt = await loaded('receipt');
  const reading = await loaded('reader');
  return { render: render && shell(render as never), receipt: receipt && receiptShell(receipt as never), ...(reading ? readers(reading as never) : {}) };
};
export const load = (): Promise<Module> => locate(process.argv[3] ?? '', process.argv[4] ?? '', process.argv[5] ?? '');
