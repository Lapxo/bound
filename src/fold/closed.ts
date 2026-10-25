import{receiptSelection}from'./receipt-selection.ts';
import {hostOutput} from '../host/call-context.ts';
import {actCosts} from '../host/act-cost.ts';
import {verifiedReadingReceipts} from '../host/reading-closures.ts';
import {readingProfile} from '../host/reading-context.ts';
import {currentReadingEnvironment} from '../host/native/receipt-environment.ts';
import {childFlags} from '../host/capsule.ts';
import { dirname, existsSync, join, mkdirSync, relative, resolve, statSync, writeFileSync } from '../host/io.ts';
import { topos_wire_byBytes as byBytes, topos_wire_canonical as canonical, topos_wire_LOCK as LOCK, topos_wire_parse as parse, topos_wire_publicationOf as publicationOf, topos_wire_roleAt as roleAt, topos_wire_roleClaimsOf as roleClaimsOf } from "../../vendor/library.js";
import { RECEIPTS, fieldOf, foldClaims, isConfig, isWire } from './claims.ts';
import { bytesDigest as hashBytes, fullDigest as hashFull } from '../host/digest.ts';
import { mountedCoordinatesIn, worldAt } from './places.ts';
import { ownLockOf } from './signed.ts';
import { viewsOf } from './views.ts';
import {keptPlace} from './kept.ts';
import { storeAt, storeOf } from '../land/ledger.ts';
import { coordinatesUnder, observeFile, observeText } from '../observe/files.ts';
import { bytesOnly, carriedFrom } from './resolved.ts';
import { takenFor } from '../fold/place-inputs.ts';

/** A region is closed when the digest of its bytes is the one its receipt names. Folding a closed region is idle: idleCount is how many were already closed, actSeconds the largest measured act or unpartitioned host work, receiptsSeen how many receipts were read and how long that took. */
let idle = 0;
let seen = { count: 0, ms: 0 };

export const idleCount = (): number => idle;

export const noteIdle = (): void => {
  idle += 1;
};

export const actSeconds = (): number => actCosts.seconds();

export const receiptsSeen = (): { readonly count: number; readonly ms: number } => seen;

const algorithmIn = (text: string): string => text.match(/(?:value=|place:)([a-z0-9]+):[0-9a-f]{64}/)?.[1] ?? '';

const lockStamp = (root: string, place: string): string => {
  const name = place.replace(/\/$/, '');
  try {
    const st = statSync(join(root, name, LOCK));
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return 'none';
  }
};

const publishedMounts = (root: string): readonly string[] => mountedCoordinatesIn(root,
  (observeText(join(root, LOCK)) ?? '').split('\n').filter(isWire));

function filesOf(root: string, place: string, region: string, inputs: readonly string[]): readonly string[] {
  const step = region.replace(/^receipts\//, '').replace(/\/$/, '');
  const here = join(root, place);
  const name = place.replace(/\/$/, '');
  const own = existsSync(join(here, LOCK)) ? [name ? `${name}/${LOCK}` : LOCK] : [];
  const receipt = `${name ? `${name}/` : ''}${RECEIPTS}`;
  const claims = roleClaimsOf((observeText(join(here, LOCK)) ?? '').split('\n').filter(isWire).flatMap(line => {
    const record = parse(line);
    return record.kind === 'fact' ? [record.value.fields] : [];
  }));
  const localMounts = [...mountedCoordinatesIn(here), ...publishedMounts(here)];
  const mounts = [...new Set([...mountedCoordinatesIn(root), ...publishedMounts(root), ...localMounts.map(coordinate => relative(root, join(here, coordinate)))])];
  const owned = coordinatesUnder(join(here, step), root).filter(rel => roleAt(relative(here, join(root, rel)), claims) !== 'foreign'
    && !mounts.some(mount => rel === mount || rel.startsWith(`${mount}/`)));
  // Foreign worlds are not the place's tree. Retain the external files actually handed to its readers.
  const observed = inputs.filter(line => fieldOf(line, 'measure') === 'observed').flatMap(line => {
    const coordinate = fieldOf(line, 'scope');
    const at = resolve(here, coordinate);
    const local = relative(here, at);
    if (local === '..' || local.startsWith('../') || resolve(at) === resolve(here)) return [];
    if (step !== '.' && step !== '' && local !== step && !local.startsWith(`${step}/`)) return [];
    return existsSync(at) && statSync(at).isFile() ? [relative(root, at)] : [];
  });
  return [...new Set([...owned, ...observed, ...own])].filter(rel => rel !== receipt && !rel.split('/').some(part => part === '.bound' || part === '.cache' || part === '.git'));
}

const rooted = new Map<string, readonly string[]>();
let lastConfiguration: {readonly input: string; readonly output: readonly string[]} | undefined;

function publicConfiguration(lines: readonly string[]): readonly string[] {
  const input = lines.join('\n');
  // Retain only this pure projection. Callers still read and hash the actual
  // files; neither a timestamp nor a previous seal proves their current bytes.
  if (lastConfiguration?.input === input) return lastConfiguration.output;
  if (!lines.length || !lines.every(isConfig)) return lines;
  const folded = foldClaims(lines);
  if (folded.forks.length) throw Error('REFUSE·receipt disputed configuration standing');
  const output = publicationOf(folded.standing.filter(line => fieldOf(line, 'value') !== 'withdraw'));
  lastConfiguration = {input, output};
  return output;
}

function rootLines(root: string, place: string, configuration?: readonly string[]): readonly string[] {
  const name = place.replace(/\/$/, '');
  if (!name) return [];
  const key = `${root}\0${name}\0${lockStamp(root, '')}`;
  const held = configuration === undefined ? rooted.get(key) : undefined;
  if (held !== undefined) return held;
  const standing = configuration ?? publicConfiguration((observeText(join(root, LOCK)) ?? '').split('\n').filter(isWire));
  // Authority validates admission separately; it is not a rendered file input.
  const lines = standing.filter((line) => fieldOf(line, 'value') !== 'withdraw' && !fieldOf(line, 'scope').startsWith('keys/'));
  const take = takenFor(lines, `${name}/`, worldAt(root, name) ? { own: ownLockOf(root, name), tree: viewsOf(standing) } : undefined);
  const got = lines.filter(take).map((line) => `root ${line}`);
  if(configuration === undefined)rooted.set(key, got);
  return got;
}

/** File-fold identity uses public inputs; admission history stays in its separate ledger guard. */
export function fileRegionDigest(root: string, place: string, region: string, algorithm: string, inputs: readonly string[] = [], delivery?: {readonly files:ReadonlySet<string>;readonly configuration:readonly string[]}): string {
  const step=region.replace(/^receipts\//,'').replace(/\/$/,'');
  const selected=delivery===undefined?filesOf(root,place,region,inputs):[...delivery.files].filter(file=>{
    const local=relative(join(root,place),join(root,file));
    return local!==RECEIPTS&&(local===LOCK||step==='.'||step===''||local===step||local.startsWith(step+'/'));
  });
  const files=[...selected].sort(byBytes);
  const own = join(root, place, LOCK);
  const bytesOf = (rel: string): Uint8Array => {
    const at = join(root, rel), bytes = delivery && resolve(at)===resolve(join(root,LOCK)) ? new TextEncoder().encode(delivery.configuration.join('\n')+'\n') : observeFile(at) ?? new Uint8Array();
    if (resolve(at) !== resolve(own)) return bytes;
    const lines = new TextDecoder().decode(bytes).split('\n').filter(isWire);
    // Object history keeps its own contract. Configuration's public identity is
    // the existing Topos publication projection, not its admission envelopes.
    if (!lines.length || !lines.every(isConfig)) return bytes;
    return new TextEncoder().encode(publicConfiguration(lines).join('\n') + '\n');
  };
  return hashFull([...files.map((rel) => `${relative(join(root, place), join(root, rel))} ${hashBytes(bytesOf(rel), algorithm)}`), ...rootLines(root, place, delivery?.configuration)], algorithm);
}

function namedReceipts(root: string, store: string): ReadonlyMap<string, string> {
  const text = observeText(join(root, RECEIPTS));
  const carried = carriedFrom(store, (text ?? '').split('\n').filter(isWire));
  const out = new Map<string, string>();
  const mounted = new Set(mountedCoordinatesIn(root));
  for (const line of carried ?? []) {
    if (!isWire(line) || fieldOf(line, 'measure') !== 'digest') continue;
    const place = /^write\/([^/]+)\/receipts\.bound$/.exec(fieldOf(line, 'scope'))?.[1];
    // A retained dependency receipt is input evidence, not a child-place closure.
    if (place && !mounted.has(place)) out.set(place, fieldOf(line, 'value'));
  }
  return out;
}

// Only the instrument's file seals describe file-region bytes. Reader receipts keep their own semantic identity.
const fileSeal = (line:string):boolean => isWire(line) && fieldOf(line,'measure') === 'bytes' && fieldOf(line,'by') === 'bound';

function ownBytes(root: string): readonly string[] {
  return (observeText(join(root, RECEIPTS)) ?? '').split('\n').filter(fileSeal);
}

function bytesMeet(root: string, place: string): boolean {
  const shipped = (observeText(join(root, place, RECEIPTS)) ?? '').split('\n').filter(isWire);
  const inputs = carriedFrom(storeOf(root), shipped) ?? [];
  const lines = shipped.filter(fileSeal);
  const algorithm = algorithmIn(lines.join('\n'));
  const selections=new Map<string,ReturnType<typeof receiptSelection>>();
  const configuration=publicConfiguration((observeText(join(root,place,LOCK))??'').split('\n').filter(isWire));
  const actual=lines.map(line=>{
    const profile=fieldOf(line,'needs');if(!profile)return fileRegionDigest(root,place,fieldOf(line,'scope'),algorithm,inputs);
    let selected=selections.get(profile);if(!selected){
      if(place)throw Error('REFUSE·receipt publication profile requires an independent root');
      selected=receiptSelection(root,configuration,profile,bytes=>hashBytes(bytes,algorithm));
      const missing=filesOf(root,place,'receipts/.',[]).filter(file=>!selected!.files.has(file));
      if(missing.length)throw Error('REFUSE·receipt publication unselected owned member '+missing[0]);
      selections.set(profile,selected);
    }
    if(fieldOf(line,'shape')!==selected.coordinate)throw Error('REFUSE·receipt publication seal profile differs');
    return fileRegionDigest(root,place,fieldOf(line,'scope'),algorithm,inputs,{files:selected.files,configuration});
  });
  return lines.length>0&&algorithm!==''&&lines.map(line=>fieldOf(line,'value')).join('\n')===actual.join('\n');
}

const stampAt = (store: string): string => storeAt(store, 'cas', 'instrument');

export const instrumentKept = (store: string): string => (observeText(stampAt(store)) ?? '').trim();

export function instrumentKeep(store: string, id: string): void {
  mkdirSync(dirname(stampAt(store)), { recursive: true });
  writeFileSync(stampAt(store), `${id}\n`);
}

export function receiptPlaces(root: string, store: string): readonly string[] {
  const children = [...namedReceipts(root, store).keys()];
  return ownBytes(root).length ? ['', ...children] : children;
}

function rewritePlace(root: string, place: string): void {
  const at = join(root, place, RECEIPTS);
  const text = observeText(at) ?? '';
  const algorithm = algorithmIn(text);
  if (algorithm === '') return;
  const kept = text.split('\n').filter((line) => line === '' || !fileSeal(line));
  const regions = kept.filter((line) => isWire(line) && fieldOf(line, 'measure') === 'count' && fieldOf(line,'by') === 'bound' && fieldOf(line, 'scope').startsWith('receipts/'));
  const bytes = regions.map((line) => {
    const scope = fieldOf(line, 'scope');
    const inputs = carriedFrom(storeOf(root), kept.filter(isWire)) ?? [];
    const now = fileRegionDigest(root, place, scope, algorithm, inputs);
    return canonical({ scope, role: 'writes', form: 'alphabet', measure: 'bytes', value: now, at: `place:${now}`, by: fieldOf(line, 'by') || 'bound' });
  });
  writeFileSync(at, `${[...kept.filter((line) => line !== ''), ...bytes].join('\n')}\n`);
}

export async function closeReceipts(root: string, store: string, semantic?: ReadonlyMap<string,string>): Promise<readonly string[]> {
  if (semantic) {
    const lines=(observeText(join(root,RECEIPTS))??'').split('\n').filter(isWire);
    return [...semantic].filter(([scope,digest])=>!lines.some(line=>fieldOf(line,'scope')===scope&&fieldOf(line,'measure')==='bytes'&&fieldOf(line,'value')===digest)).map(([scope])=>scope);
  }
  const open = receiptPlaces(root, store).filter((place) => !meets(root, store, `${place}/`));
  for (const place of open) {
    rewritePlace(root, place);
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  return open;
}

/** One comparison. A place meets its receipt; the root meets when every receipt it names meets. */
export function meets(root: string, store: string, place: string, current=true, active?:readonly string[]): boolean {
  const name = place.replace(/\/$/, '');
  if (name === '') {
    const at = Date.now();
    const named = namedReceipts(root, store);
    const own = ownBytes(root);
    const carried = own.length ? carriedFrom(store, (observeText(join(root, RECEIPTS)) ?? '').split('\n').filter(isWire)) : undefined;
    const ownClosed = own.length > 0 && carried !== undefined && carried.length > 0 && bytesMeet(root, '');
    let closed = (own.length > 0 ? ownClosed : named.size > 0) && [...named].every(([one, expected]) => {
      const bytes = observeFile(join(root, one, RECEIPTS));
      const algorithm = expected.split(':')[0];
      return bytes !== undefined && hashBytes(bytes, algorithm) === expected && meets(root, store, `${one}/`,current);
    });
    if(closed && carried){
      const algorithm=algorithmIn(own.join('\n')),hash=(text:string)=>hashFull(text,algorithm);
      const profile=readingProfile((observeText(join(root,LOCK))??'').split('\n').filter(isWire),fieldOf);
      // History keeps its canonical identity and bytes. It does not become a
      // current execution merely because it shares a public carrier with one.
      const readings=verifiedReadingReceipts(store,carried,hash,undefined,profile);
      if(readings===undefined)closed=false;
      else if(current&&profile&&readings){
        const stamp=instrumentKept(store);
        const snapshot=active??(stamp?keptPlace(store,undefined,stamp)?.observed:undefined);
        if(snapshot===undefined)closed=false;
        else {
          const units=snapshot.filter(line=>fieldOf(line,'scope').startsWith('receipts/readings/')&&fieldOf(line,'role')==='writes');
          const supplied=new Set(carried);
          const present=units.length>0&&units.every(line=>supplied.has(line)||(fieldOf(line,'measure')==='observed'&&supplied.has(bytesOnly(line))));
          const fresh=present?verifiedReadingReceipts(store,snapshot,hash,currentReadingEnvironment(store,root,hash,childFlags()),profile):undefined;
          if(!fresh)closed=false;
        }
      }
      if(closed&&readings)hostOutput('error',`RECEIPTS ${readings} read · 0 opened · reading closures\n`);
    }
    seen = { count: named.size + (own.length > 0 ? 1 : 0), ms: Date.now() - at };
    return closed;
  }
  const lines = (observeText(join(root, place, RECEIPTS)) ?? '').split('\n').filter((line) => isWire(line) && fieldOf(line, 'measure') === 'bytes');
  const lock = existsSync(join(root, name, LOCK));
  if (lines.length > 0) return bytesMeet(root, place);
  if (lock) return false;
  const expected = namedReceipts(root, store).get(name);
  const file = expected !== undefined ? observeFile(join(root, place, RECEIPTS)) : undefined;
  const algorithm = file === undefined ? '' : algorithmIn(new TextDecoder().decode(file));
  const closed = file !== undefined && algorithm !== '' && hashBytes(file, algorithm) === expected;
  return closed;
}
