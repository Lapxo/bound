import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {members} from '../src/host/archive.ts';
import {sha256} from '../src/host/hash.ts';
import {moduleSnapshot,type ModuleClosureSnapshot} from '../src/host/native/module-closure.ts';
import {deliverModuleClosure,verifyModuleDelivery,type ClosureDeliveryLimits,type ClosureNotice} from '../src/host/native/module-delivery.ts';

export interface DependencyArchive {
 readonly name:string; readonly version:string; readonly digest:string;
 readonly bytes:Uint8Array;
}

/** Read archive identity and license once; neither code nor npm is executed. */
function dependencyPackages(archives:readonly DependencyArchive[]){
 const packages=new Map<string,{snapshot:ModuleClosureSnapshot;manifest:Record<string,unknown>;license:ClosureNotice}>();
 const notices:ClosureNotice[]=[];
 for(const archive of archives){
  const snapshot=moduleSnapshot(archive.bytes,archive.digest,'package/package.json');
  const manifest=JSON.parse(snapshot.members.get('package/package.json')?.source??'null');
  if(!manifest||manifest.name!==archive.name||manifest.version!==archive.version||manifest.type!=='module'||packages.has(archive.name))throw Error('REFUSE·vendor package identity differs');
  const license=members(archive.bytes).find(m=>m.name==='package/LICENSE');
  if(!license)throw Error('REFUSE·vendor license absent '+archive.name);
  const source=new TextDecoder('utf-8',{fatal:true}).decode(license.bytes);
  const notice={snapshot:snapshot.identity,coordinate:'LICENSE',digest:sha256(source),source};
  notices.push(notice);
  packages.set(archive.name,{snapshot,manifest,license:notice});
 }
 return {packages,notices};
}

/** Archive-owned source is build input, not a static execution-closure claim.
 * The host's authenticated dynamic loader remains an explicit effect boundary.
 */
export function dependencySources(archives:readonly DependencyArchive[]){
 const {packages}=dependencyPackages(archives);
 return {format:'pinned-package-sources/1',packages:[...packages.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,p])=>({
  name,version:p.manifest.version,archive:p.snapshot.identity,manifest:p.snapshot.members.get('package/package.json'),license:p.license,
  files:[...p.snapshot.members].filter(([coordinate])=>coordinate.startsWith('package/dist/')).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([coordinate,m])=>({coordinate:coordinate.slice('package/'.length),...m}))
 }))};
}

/** Traversal and calculated-load refusals remain in the existing verifier. */
export function dependencyDelivery(archives:readonly DependencyArchive[],needs:readonly string[],limits:ClosureDeliveryLimits) {
 const {packages,notices}=dependencyPackages(archives);
 const select=(specifier:string):ModuleClosureSnapshot|undefined=>{
  const name=[...packages.keys()].find(n=>specifier===n||specifier.startsWith(n+'/'));
  if(!name)return undefined;
  const one=packages.get(name)!;
  const subpath=specifier===name?'.':'./'+specifier.slice(name.length+1);
  const offered=(one.manifest.exports as Record<string,unknown>|undefined)?.[subpath];
  // These archives expose explicit ESM defaults. Unsupported export conditions
  // refuse instead of guessing a Node/browser or require/import resolution.
  if(offered&&typeof offered==='object'&&Object.keys(offered).some(k=>!['types','source','default'].includes(k)))throw Error('REFUSE·vendor unsupported export conditions '+specifier);
  const target=typeof offered==='string'?offered:offered&&typeof offered==='object'?(offered as Record<string,unknown>).default:undefined;
  if(typeof target!=='string'||!target.startsWith('./')||target.includes('..')||!target.endsWith('.js'))throw Error('REFUSE·vendor unsupported export '+specifier);
  return {...one.snapshot,entry:'package/'+target.slice(2)};
 };
 const entries=new Map<string,ModuleClosureSnapshot>();
 for(const name of needs){const selected=select(name);if(!selected)throw Error('REFUSE·vendor unpinned need '+name);entries.set(name,selected)}
 const delivery=deliverModuleClosure(needs,entries,s=>select(s),limits,notices);
 return verifyModuleDelivery(delivery.bytes,delivery.digest,limits);
}

// Materialize build inputs only. This does not activate a host loader or assert
// that Bound itself has stopped resolving runtime dependencies.
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [inputs,needsFile,output]=process.argv.slice(2);
 if(!inputs||!needsFile||!output)throw Error('Expected archive directory, needs JSON, and new output directory');
 if(existsSync(output))throw Error('Vendor destination already exists');
 const pins=JSON.parse(readFileSync(new URL('../vendor/dependencies.json',import.meta.url),'utf8'));
 if(pins.format!=='pinned-dependency-archives/1')throw Error('Unsupported dependency archive format');
 const needs=JSON.parse(readFileSync(needsFile,'utf8'));
 const limits=needs.limits as ClosureDeliveryLimits;
 const archives=pins.packages.map((p:{name:string;version:string;digest:string;archive:string})=>({...p,bytes:readFileSync(join(inputs,p.archive))}));
 const delivery=dependencyDelivery(archives,needs.needs,limits);
 mkdirSync(output,{recursive:true});
 for(const file of delivery.files){const at=join(output,file.path);mkdirSync(dirname(at),{recursive:true});writeFileSync(at,file.source,{flag:'wx'})}
 writeFileSync(join(output,'delivery.json'),delivery.bytes,{flag:'wx'});
 writeFileSync(join(output,'import-map.json'),JSON.stringify(delivery.importMap,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({digest:delivery.digest,closure:delivery.closure,modules:delivery.manifest.modules.length,notices:delivery.manifest.notices.length,bytes:delivery.bytes.length}));
}
