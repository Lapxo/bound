import * as nodeModule from 'node:module';
import { realpathSync } from 'node:fs';
import { join, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fieldOf } from '../fold/claims.ts';
import { observeText } from '../observe/files.ts';
import { ownLock, ownStore, ownRoot } from '../observe/runner.ts';
import { runtimeTreeAt } from './release.ts';
import { theWord } from '../fold/wire.ts';

interface ResolveContext { parentURL?: string }
interface ResolveResult { url: string }
type NextResolve = (specifier: string, context: ResolveContext) => ResolveResult;
const registerHooks = (nodeModule as unknown as {
  registerHooks: (hooks: { resolve: (specifier: string, context: ResolveContext, nextResolve: NextResolve) => ResolveResult }) => void;
}).registerHooks;

const taken = (exp: unknown): string => (typeof exp === 'string' ? exp : exp && typeof exp === 'object' && 'default' in exp && typeof (exp as { default: unknown }).default === 'string' ? (exp as { default: string }).default : '');

/**
 * Where a named package or world lies: `dep/<name>` for a library the instrument installs, `uses/<name>` for a world
 * pinned by its GitHub release. Both are the digest, laid. Nothing here spells a path.
 */
export function pinPlace(name: string): string {
  const lock = ownLock();
  const line = lock.find((one) => fieldOf(one, 'scope') === `dep/${name}` && fieldOf(one, 'role') === 'reads')
    ?? lock.find((one) => fieldOf(one, 'scope') === `uses/${name}`);
  if (line === undefined) return '';
  const digest = fieldOf(line, 'value');
  return digest ? runtimeTreeAt(ownStore(), ownRoot(), digest, ownStore()) ?? '' : '';
}

export function pinExport(name: string, sub: string): string {
  const at = pinPlace(name);
  const file = taken((JSON.parse(observeText(join(at, manifestOf())) ?? '{}') as { exports?: Record<string, unknown> }).exports?.[sub]);
  return at && file ? join(at, file) : '';
}

export function pinName(name: string): string {
  const at = pinPlace(name);
  return at ? ((JSON.parse(observeText(join(at, manifestOf())) ?? '{}') as { name?: string }).name ?? '') : '';
}

const manifestOf = (): string => `${theWord(ownLock(), 'pin-shape')}.json`;

/** Node package resolution at a digest-laid library; exports remain authoritative. */
export function resolvePinned(specifier: string, context: ResolveContext, nextResolve: NextResolve,
  pin: { readonly at: string; readonly pkg: string; readonly json: string; readonly exports: boolean }): ResolveResult {
  if (pin.exports) return nextResolve(specifier, { ...context, parentURL: pin.json });
  const sub = specifier === pin.pkg ? '' : specifier.slice(pin.pkg.length + 1);
  const requested = join(pin.at, sub);
  const coordinate = relative(pin.at, requested);
  if (isAbsolute(coordinate) || coordinate === '..' || coordinate.startsWith(`..${sep}`)) throw new Error('REFUSE·pin library import leaves its laid tree');
  const file = nodeModule.createRequire(pin.json).resolve(requested);
  const entry = relative(realpathSync(pin.at), realpathSync(file));
  if (isAbsolute(entry) || entry === '..' || entry.startsWith(`..${sep}`)) throw new Error('REFUSE·pin library entry leaves its laid tree');
  return nextResolve(pathToFileURL(file).href, context);
}

/**
 * A blob stays self-contained. The one thing it does not carry is the SDK the host provides: an import whose package
 * the instrument's own lock names at dep/<name> resolves at the place pinPlace delivers. Nothing is linked into the
 * blob's folder.
 */
let hooked = false;

export function provide(): void {
  if (hooked) return;
  hooked = true;
  const pins = ownLock()
    .filter((line) => fieldOf(line, 'scope').startsWith('dep/') && fieldOf(line, 'role') === 'reads')
    .flatMap((line) => {
      const name = fieldOf(line, 'scope').slice('dep/'.length);
      const at = pinPlace(name);
      const pkg = pinName(name);
      const file = manifestOf();
      const manifest = JSON.parse(observeText(join(at, file)) ?? '{}') as Record<string, unknown>;
      return at && pkg ? [{ at, pkg, exports: Object.prototype.hasOwnProperty.call(manifest, 'exports'), href: pathToFileURL(at).href, json: pathToFileURL(join(at, file)).href }] : [];
    });
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.includes(':')) return nextResolve(specifier, context);
      const parent = context.parentURL ?? '';
      const pin = pins.find((one) => specifier === one.pkg || specifier.startsWith(`${one.pkg}/`));
      if (pin === undefined || parent.startsWith(pin.href)) return nextResolve(specifier, context);
      return resolvePinned(specifier, context, nextResolve, pin);
    },
  });
}
