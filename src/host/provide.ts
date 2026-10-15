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
 * Resolve declared library bytes for this host. A library's shape may select an
 * archive coordinate; world selection remains the standing contract.
 */
export function pinPlace(name: string): string {
  const lock = ownLock();
  const line = lock.find((one) => fieldOf(one, 'scope') === `dep/${name}` && fieldOf(one, 'role') === 'reads')
    ?? lock.find((one) => fieldOf(one, 'scope') === `uses/${name}`);
  if (line === undefined) return '';
  const digest = fieldOf(line, 'value');
  return digest ? runtimeTreeAt(ownStore(), ownRoot(), digest, ownStore(), fieldOf(line, 'role') === 'reads' ? fieldOf(line, 'shape') : '') ?? '' : '';
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
type NativeResolution={readonly libraryNames:readonly string[];readonly libraries:readonly {readonly name:string;readonly manifest:string;readonly coordinate?:string}[];assertPins(pins:readonly {name:string;at:string}[]):void};
function nativeResolution():NativeResolution|undefined{
  const installed=Object.getOwnPropertyDescriptor(globalThis,Symbol.for('bound.native.resolution@1'));
  if(!installed)return undefined;
  const capability=installed.value as {profile?:unknown;libraryNames?:unknown;libraries?:unknown;assertPins?:unknown}|undefined;
  if(installed.configurable!==false||installed.writable!==false||!capability||!Object.isFrozen(capability)||capability.profile!=='fixed-native-resolution@1'||!Array.isArray(capability.libraryNames)||!Object.isFrozen(capability.libraryNames)||capability.libraryNames.some(name=>typeof name!=='string')||!Array.isArray(capability.libraries)||!Object.isFrozen(capability.libraries)||capability.libraries.some(lib=>!lib||!Object.isFrozen(lib)||typeof lib.name!=='string'||typeof lib.manifest!=='string')||typeof capability.assertPins!=='function')throw Error('REFUSE·pin fixed resolution capability invalid');
  return capability as NativeResolution;
}

/** Fixed execution selects libraries by the instrument's explicit local mount,
 * before opening any artifact. An alias or package-name guess grants nothing. */
export function selectNativeDependencies(root:string,dependencies:readonly string[],manifest:string):readonly {line:string;library:{readonly name:string;readonly manifest:string;readonly coordinate?:string}}[]|undefined{
  const capability=nativeResolution();if(!capability)return undefined;
  if(dependencies.length&&capability.libraries.some(library=>typeof library.coordinate!=='string'||!library.coordinate))throw Error('REFUSE·pin fixed resolution logical library coordinate missing');
  const selected=new Map(capability.libraries.map(library=>[library.coordinate,library]));
  return dependencies.flatMap(line=>{const mount=fieldOf(line,'needs');if(!mount)return [];
    const library=selected.get(mount.replace(/\/+$/,'')+'/'+manifest);if(!library)return [];
    let actual:string;try{actual=realpathSync(join(root,mount,manifest))}catch{throw Error('REFUSE·pin selected library mount absent '+library.name)}
    if(actual!==library.manifest)throw Error('REFUSE·pin selected library mount differs '+library.name);
    return[{line,library}];
  });
}

/** A declared artifact is not automatically an active Node library. This fixed
 * assertion reuses only the packages selected by the actual host boundary. */
export function reuseNativeResolution(pins:readonly {pkg:string;at:string}[]):boolean{
  const capability=nativeResolution();if(!capability)return false;
  const selected=new Set(capability.libraryNames);
  // The fixed preload owns this closed assertion. Package names select which
  // declared pins participate; exact manifests and member bytes still decide.
  capability.assertPins(pins.filter(pin=>selected.has(pin.pkg)).map(pin=>({name:pin.pkg,at:pin.at})));
  return true;
}

/** Read one resolved archive's manifest; a selected fixed library cannot vanish
 * into the optional historical provider path when its archive is absent. */
export function readProvidedPin(name:string,at:string,file:string,requiredName?:string):{at:string;pkg:string;exports:boolean;href:string;json:string}|undefined{
  if(!at){if(requiredName!==undefined)throw Error('REFUSE·pin fixed resolution requires declared library '+name);return undefined}
  const manifest=JSON.parse(observeText(join(at,file))??'{}') as Record<string,unknown>,pkg=typeof manifest.name==='string'?manifest.name:'';
  if(requiredName!==undefined&&pkg!==requiredName)throw Error('REFUSE·pin fixed resolution library name differs '+name);
  return pkg?{at,pkg,exports:Object.prototype.hasOwnProperty.call(manifest,'exports'),href:pathToFileURL(at).href,json:pathToFileURL(join(at,file)).href}:undefined;
}

export function provide(): void {
  if (hooked) return;
  const dependencies=ownLock().filter((line) => fieldOf(line, 'scope').startsWith('dep/') && fieldOf(line, 'role') === 'reads');
  const file=manifestOf(),selected=selectNativeDependencies(ownRoot(),dependencies,file);
  // An ordinary host library is selected by its declared mount. Unmounted
  // catalog entries stay lazy; explicit pinPlace requests still verify their bytes.
  const pins = (selected??dependencies.filter(line=>fieldOf(line,'needs')!=='').map(line=>({line,library:undefined})))
    .flatMap(({line,library}) => {
      const name = fieldOf(line, 'scope').slice('dep/'.length);
      const pin=readProvidedPin(name,pinPlace(name),file,library?.name);
      if(!pin)throw Error('REFUSE·pin declared library unavailable '+name);
      return [pin];
    });
  if(reuseNativeResolution(pins)){
    hooked = true;
    return;
  }
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.includes(':')) return nextResolve(specifier, context);
      const parent = context.parentURL ?? '';
      const pin = pins.find((one) => specifier === one.pkg || specifier.startsWith(`${one.pkg}/`));
      if (pin === undefined || parent.startsWith(pin.href)) return nextResolve(specifier, context);
      return resolvePinned(specifier, context, nextResolve, pin);
    },
  });
  hooked = true;
}
