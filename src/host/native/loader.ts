import {realpathSync} from 'node:fs';
import {dirname,join,relative,isAbsolute,sep} from 'node:path';
import {readBoundedFile} from './bounded-file.ts';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as nodeModule from 'node:module';
const {builtinModules}=nodeModule;
const moduleApi=nodeModule.createRequire(import.meta.url)('node:module') as Record<string,unknown>;
const fixedRegisterHooks=moduleApi.registerHooks;
let registrationProtected=false;
/** Node loader registration is an executable capability, not merely a builtin
 * name. The fixed host retains its captured registration API; imported programs
 * cannot insert a loader returning invented bytes ahead of its load boundary.
 * This does not establish confinement against arbitrary privileged JavaScript.
 */
export function protectNativeLoaderRegistration(){
 if(registrationProtected)return;registrationProtected=true;
 for(const name of ['registerHooks','register'])if(typeof moduleApi[name]==='function')Object.defineProperty(moduleApi,name,{value:()=>{throw Error('REFUSE·load runtime loader registration is not a fixed host capability')},writable:false,configurable:false});
 nodeModule.syncBuiltinESMExports();
}
export interface Member {readonly path:string;readonly digest:string;readonly bytes:number}
export interface Library {readonly name:string;readonly manifest:string;readonly coordinate?:string}
export interface Declaration {readonly members:readonly Member[];readonly libraries:readonly Library[];readonly builtins:readonly string[];readonly entry:string;readonly platform:string}
type PinnedLibrary={readonly name:string;readonly at:string};
const resolutionKey=Symbol.for('bound.native.resolution@1');
let resolutionCheck:((pins:readonly PinnedLibrary[])=>void)|undefined;
let resolutionIdentity:string|undefined;
let resolutionLibraryNames:readonly string[]=Object.freeze([]);
let resolutionLibraries:readonly Library[]=Object.freeze([]);
const resolutionCapability=Object.freeze({profile:'fixed-native-resolution@1',get libraryNames():readonly string[]{return resolutionLibraryNames},get libraries():readonly Library[]{return resolutionLibraries},assertPins(pins:readonly PinnedLibrary[]):void{
 if(!Array.isArray(pins))throw Error('REFUSE·load pinned library request invalid');
 if(!resolutionCheck)throw Error('REFUSE·load no current fixed library resolution');
 resolutionCheck(pins);
}});
/** Fixed preload only: expose comparison with the installed resolution, never
 * hook registration or a verifier supplied by a reader. A different module's
 * marker cannot replace this host's closed capability before entry. */
export function installNativeResolutionReuse(declaration:Declaration):()=>void{
 const prior=Object.getOwnPropertyDescriptor(globalThis,resolutionKey);
 if(prior&&prior.value!==resolutionCapability)throw Error('REFUSE·load fixed resolution capability collision');
 if(!prior)Object.defineProperty(globalThis,resolutionKey,{value:resolutionCapability,writable:false,configurable:false});
 const fail=(why:string):never=>{throw Error('REFUSE·load pinned library '+why)};
 const actual=(path:string,why:string)=>{try{return realpathSync(path)}catch{return fail(why)}};
 const files=declaration.members.map(member=>({...member,path:realpathSync(member.path)}));
 const libraries=new Map(declaration.libraries.map(library=>[library.name,realpathSync(library.manifest)]));
 const coordinates=new Map(declaration.libraries.map(library=>[library.name,library.coordinate]));
 if(libraries.size!==declaration.libraries.length)fail('ambiguous declaration');
 const namedCoordinates=new Set<string>();for(const coordinate of coordinates.values())if(coordinate!==undefined){if(typeof coordinate!=='string'||!coordinate||isAbsolute(coordinate)||coordinate.includes('\\')||coordinate.split('/').some(step=>!step||step==='.'||step==='..')||namedCoordinates.has(coordinate))fail('invalid/ambiguous logical library coordinate');namedCoordinates.add(coordinate)}
 const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
 const identity=digest(Buffer.from(JSON.stringify([declaration.platform,files.map(member=>[member.path,member.digest,member.bytes]).sort((a,b)=>order(String(a[0]),String(b[0]))),[...libraries].sort(([a],[b])=>order(a,b)).map(([name,manifest])=>[name,manifest,coordinates.get(name)??null])])));
 if(resolutionIdentity!==undefined){if(identity!==resolutionIdentity)fail('late resolution replacement');if(!resolutionCheck)fail('fixed resolution already closed');return()=>{}}
 resolutionIdentity=identity;
 resolutionLibraryNames=Object.freeze([...libraries.keys()].sort(order));
 resolutionLibraries=Object.freeze([...libraries].sort(([a],[b])=>order(a,b)).map(([name,manifest])=>Object.freeze({name,manifest,...(coordinates.get(name)===undefined?{}:{coordinate:coordinates.get(name)})})));
 const inside=(base:string,path:string)=>{const step=relative(base,path);return step!==''&&!isAbsolute(step)&&step!=='..'&&!step.startsWith('..'+sep)};
 const check=(pins:readonly PinnedLibrary[])=>{
  const names=new Set<string>();
  for(const pin of pins){
   if(!pin||typeof pin.name!=='string'||typeof pin.at!=='string'||!pin.at||names.has(pin.name))fail('invalid/duplicate selection');names.add(pin.name);
   const manifest=libraries.get(pin.name)??fail('not declared '+pin.name);
   const root=dirname(manifest),pinned=actual(pin.at,'tree absent '+pin.name),nested=[...libraries.values()].map(dirname).filter(other=>inside(root,other));
   const members=files.filter(member=>inside(root,member.path)&&!nested.some(other=>inside(other,member.path)));
   if(!members.some(member=>member.path===manifest))fail('manifest not sealed '+pin.name);
   const manifestMember=members.find(member=>member.path===manifest)!;
   let pkg:any;try{pkg=JSON.parse(readBoundedFile(manifest,manifestMember.bytes,manifest).toString('utf8'))}catch{return fail('manifest unreadable '+pin.name)}
   if(pkg?.name!==pin.name)fail('manifest name differs '+pin.name);
   for(const member of members){
    if(!Number.isSafeInteger(member.bytes)||member.bytes<0||!/^sha256:[a-f0-9]{64}$/.test(member.digest))fail('member resource invalid '+pin.name);
    const target=actual(join(pinned,relative(root,member.path)),'member absent '+pin.name+'/'+relative(root,member.path));if(!inside(pinned,target))fail('target leaves pinned tree '+pin.name);
    if(digest(readBoundedFile(member.path,member.bytes,member.path))!==member.digest||digest(readBoundedFile(target,member.bytes,target))!==member.digest)fail('member differs '+pin.name+'/'+relative(root,member.path));
   }
  }
 };
 resolutionCheck=check;return()=>{resolutionCheck=undefined};
}
interface Context {parentURL?:string}
interface Resolution {url:string}
const digest=(bytes:Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
/** Resolution boundary for an instrument-selected native command. It checks
 * actual target bytes before Node executes that target. Native commands remain
 * privileged host implementations: this is not an arbitrary-JS sandbox and
 * cannot prevent trusted code from replacing Node's hooks. That trust condition
 * must be admitted separately; a world cannot claim it in a payload.
 * Native ABI edges refer to the declared platform context, never a fictitious
 * file digest. Completeness of the platform's backing images is not proved here.
 */
export function loadBoundary(declaration:Declaration){
 const files=new Map<string,Member>(),libraries=new Map<string,{url:string;pkg:Record<string,unknown>}>(),native=new Set<string>(),edges:{parent:string;target:string;digest?:string;platform?:string}[]=[];
 let refused:string|undefined;
 const fail=(why:string):never=>{refused??='REFUSE·load '+why;throw Error(refused)};
 const verify=(url:string):string=>{let path:string;try{path=realpathSync(fileURLToPath(url))}catch{return fail('target absent '+url)}const expected=files.get(path);if(!expected)return fail('target undeclared '+url);if(digest(readBoundedFile(path,expected.bytes,path))!==expected.digest)return fail('target bytes differ '+url);return expected.digest};
 for(const member of declaration.members){let path:string;try{path=realpathSync(member.path)}catch{return fail('member absent '+member.path)}if(files.has(path)||!Number.isSafeInteger(member.bytes)||member.bytes<0||!/^sha256:[0-9a-f]{64}$/.test(member.digest))return fail('member ambiguous '+member.path);files.set(path,{...member,path});}
 for(const member of declaration.members)verify(pathToFileURL(member.path).href);
 for(const lib of declaration.libraries){if(!/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/.test(lib.name)||libraries.has(lib.name))return fail('library ambiguous '+lib.name);const url=pathToFileURL(lib.manifest).href;verify(url);let pkg:Record<string,unknown>;try{pkg=JSON.parse(readBoundedFile(lib.manifest,files.get(realpathSync(lib.manifest))!.bytes,lib.name).toString('utf8'))}catch{return fail('library manifest invalid '+lib.name)}if(!pkg||Array.isArray(pkg)||pkg.name!==lib.name)return fail('library name differs '+lib.name);libraries.set(lib.name,{url,pkg});}
 for(const name of declaration.builtins){const normalized=name.startsWith('node:')?name:'node:'+name;if(native.has(normalized)||(!builtinModules.includes(normalized)&&!builtinModules.includes(normalized.slice(5))))return fail('native ABI ambiguous '+name);native.add(normalized);}
 if(!/^sha256:[0-9a-f]{64}$/.test(declaration.platform))return fail('declared platform identity absent');
 const entry=pathToFileURL(declaration.entry).href;verify(entry);
 return {
  entry,
  resolve(specifier:string,context:Context,next:(specifier:string,context:Context)=>Resolution):Resolution{
   if(refused)throw Error(refused);
   if(context.parentURL)verify(context.parentURL);
   const builtin=specifier.startsWith('node:')?specifier:'node:'+specifier;
   if(builtinModules.includes(specifier)||specifier.startsWith('node:')){if(!native.has(builtin))return fail('native ABI undeclared '+specifier);edges.push({parent:context.parentURL??entry,target:builtin,platform:declaration.platform});let resolved:Resolution;try{resolved=next(builtin,context)}catch{return fail('native target unresolved '+builtin)}if(resolved.url!==builtin)return fail('native target differs '+builtin);return resolved;}
   let selected=context,target=specifier;
   if(!specifier.startsWith('.')&&!specifier.startsWith('/')&&!specifier.includes(':')){
    const name=specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0]!;
    const library=libraries.get(name);if(!library)return fail('library undeclared '+name);
    selected={...context,parentURL:library.url};
    if(library.pkg.exports===undefined){const subpath=specifier.slice(name.length);const main=subpath?subpath.slice(1):library.pkg.main;if(typeof main!=='string'||!main||main.startsWith('/')||main.includes('\\')||main.split('/').includes('..'))return fail('library target undeclared '+specifier);target=main.startsWith('./')?main:'./'+main;}
   }
   // Node supplies package/relative resolution semantics. There is no fallback
   // permission: its result still has to be an exact host-sealed member.
   let resolved:Resolution;try{resolved=next(target,selected)}catch{return fail('target unresolved '+specifier)}if(!resolved.url.startsWith('file:'))return fail('target scheme undeclared '+resolved.url);
   const seal=verify(resolved.url);edges.push({parent:context.parentURL??entry,target:resolved.url,digest:seal});return resolved;
  },
  load(url:string,context:{format?:string},next:(url:string,context:{format?:string})=>{format:string;source?:string|Uint8Array|null}){
   if(url.startsWith('node:'))return next(url,context);
   verify(url);const path=realpathSync(fileURLToPath(url)),member=files.get(path)!;const loaded=next(url,context);
   if(loaded.source===undefined||loaded.source===null)return fail('file loader did not expose executable bytes '+url);
   const bytes=typeof loaded.source==='string'?Buffer.from(loaded.source,'utf8'):loaded.source;
   if(bytes.byteLength>member.bytes||digest(bytes)!==member.digest)return fail('actual loaded source differs '+url);
   return loaded;
  },
  assertClosed(){if(refused)throw Error(refused);for(const member of declaration.members)verify(pathToFileURL(member.path).href);},
  edges:()=>edges.map(edge=>({...edge})),
 };
}

/** Install before the entry of an instrument-selected privileged Node command.
 * The bootstrap exception is restricted to this host function's exact selected
 * entry. It is not a permission for a world to choose a verifier or a program.
 * Hooks mediate imports; they do not establish a non-bypass JS sandbox.
 */
export function installBoundary(declaration:Declaration){
 const boundary=loadBoundary(declaration);
 const register=fixedRegisterHooks as undefined|((hooks:{resolve:(specifier:string,context:Context,next:(specifier:string,context:Context)=>Resolution)=>Resolution;load:typeof boundary.load})=>{deregister:()=>void});
 if(typeof register!=='function')throw Error('REFUSE·load native hook profile unsupported by runtime');
 protectNativeLoaderRegistration();
 const hooks=register({resolve(specifier,context,next){
  const boot=context.parentURL===import.meta.url&&specifier===boundary.entry;
  return boundary.resolve(specifier,boot?{...context,parentURL:undefined}:context,next);
 },load:boundary.load});
 return {loadEntry:()=>import(boundary.entry),assertClosed:boundary.assertClosed,edges:boundary.edges,close:()=>hooks.deregister()};
}
