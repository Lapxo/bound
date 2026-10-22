import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,copyFileSync,chmodSync,rmSync,existsSync,statSync,symlinkSync} from 'node:fs';
import {gunzipSync,gzipSync,constants} from 'node:zlib';
import {canonical,publicationOf,matches,parse} from '@lapxo/topos/wire';
import {transformSync} from 'esbuild';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';

/** Standard gzip, with fixed byte blocks per carrier member.
 * Each fixed byte block chooses the smaller native strategy; no package paths or
 * semantic regions participate. Concatenated gzip members preserve exact tar
 * bytes and metadata. A distinct output keeps approved archives immutable. */
export async function compactArchive(input:Uint8Array):Promise<Uint8Array>{
 const tar=gunzipSync(input),options={level:9,memLevel:7};
 let packed=gzipSync(tar,{...options,strategy:constants.Z_FILTERED});
 // Search a fixed byte grid, never names or semantic regions. Every previous
 // 4/8 MiB partition remains a path. Only lengths and predecessor indexes are
 // retained; selected blocks are recompressed after the bounded search.
 const quantum=1024*1024,count=Math.ceil(tar.length/quantum);
 const best=Array<number>(count+1).fill(Infinity),previous=Array<number>(count+1).fill(0);
 best[0]=0;
 const blockAt=(from:number,to:number)=>{
  const block=tar.subarray(from*quantum,Math.min(to*quantum,tar.length));
  const ordinary=gzipSync(block,{...options,strategy:constants.Z_DEFAULT_STRATEGY});
  const filtered=gzipSync(block,{...options,strategy:constants.Z_FILTERED});
  return filtered.length<ordinary.length?filtered:ordinary;
 };
 for(let end=1;end<=count;end++)for(let start=Math.max(0,end-8);start<end;start++){
  const size=best[start]!+blockAt(start,end).length;
  if(size<best[end]!){best[end]=size;previous[end]=start;}
 }
 if(count&&best[count]!<packed.length){
  const parts:Uint8Array[]=[];
  for(let end=count;end>0;end=previous[end]!)parts.push(blockAt(previous[end]!,end));
  packed=Buffer.concat(parts.reverse());
 }
 if(!gunzipSync(packed).equals(tar))throw Error('Archive compaction changed tar bytes');
 return packed;
}

/** History is data addressed by the receiver's digest, never current authority. */
export async function verifyPublicationHistory(instrument:string,bytes:Uint8Array,expected:string,limit:number){
 const load=(name:string)=>import(pathToFileURL(join(instrument,'dist',name+'.js')).href);
 const [{sha256},{isWire},{carriedFrom},{verifiedReadingReceipts}]=await Promise.all([load('host/hash'),load('fold/claims'),load('fold/resolved'),load('host/reading-closures')]);
 if(!(bytes instanceof Uint8Array)||!Number.isSafeInteger(limit)||limit<1||bytes.length>limit)throw Error('REFUSE·receipt history bytes/budget');
 if(sha256(bytes)!==expected)throw Error('REFUSE·receipt history identity');
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(data?.profile!=='publication-history@1'||!data.records||!data.digests)throw Error('REFUSE·receipt history profile');
 for(const name of ['target','receipts','admitted'])if(typeof data.records[name]!=='string'||sha256(data.records[name])!==data.digests[name])throw Error('REFUSE·receipt history member '+name);
 const lines=data.records.receipts.split('\n').filter(isWire),receiver=mkdtempSync(join(tmpdir(),'receipt-history-check-'));
 try{
  const carried=carriedFrom(receiver,lines),readings=carried===undefined?undefined:verifiedReadingReceipts(receiver,carried,sha256,undefined,true);
  if(readings===undefined)throw Error('REFUSE·receipt history carrier');
  return {kind:'history' as const,records:data.records,readings};
 }finally{rmSync(receiver,{recursive:true,force:true});}
}

/** One projection over a native, already validated fold. The owning place keeps
 * its full carrier; a distribution carries current observations and names the
 * original public files and signed admission messages by their exact bytes. */
export async function projectReceiptEvidence(instrument:string,source:string,stage:string,outputDirectory:string,fold:any,sourceBase:string,limit:number,materializedOutputs?:readonly string[]){
 const load=(name:string)=>import(pathToFileURL(join(instrument,'dist',name+'.js')).href);
 const [{receiptRegion},{sha256},{admissionHistoryAt},{withHostCall},{withoutEffects},{withContentStore},{selfName}]=await Promise.all([load('render/receipts'),load('host/hash'),load('fold/admission-history'),load('host/call-context'),load('host/read-only'),load('host/content-store'),load('fold/claims')]);
 if(!Number.isSafeInteger(limit)||limit<1||['TARGET.bound','receipts.bound'].reduce((n,p)=>n+statSync(join(source,p)).size,0)>limit)throw Error('REFUSE·receipt publication budget');
 const records={target:readFileSync(join(source,'TARGET.bound'),'utf8'),receipts:readFileSync(join(source,'receipts.bound'),'utf8'),admitted:admissionHistoryAt(source,Number.MAX_SAFE_INTEGER).join('\n')+'\n'};
 const document=JSON.stringify({profile:'publication-history@1',records,digests:Object.fromEntries(Object.entries(records).map(([name,text])=>[name,sha256(text)]))})+'\n';
 if(Buffer.byteLength(document)>limit)throw Error('REFUSE·receipt publication budget');
 const digest=sha256(document),file=digest.slice(7)+'.json',destination=join(outputDirectory,file);
 await verifyPublicationHistory(instrument,Buffer.from(document),digest,limit);
 if(existsSync(destination)){if(sha256(readFileSync(destination))!==digest)throw Error('REFUSE·receipt publication occupied history');}
 else writeFileSync(destination,document,{flag:'wx'});
 const projectionRows=fold.standing.filter((line:string)=>{const f=parse(line);return f.kind==='fact'&&f.value.fields.scope==='publish/standing/history'&&f.value.fields.value!=='withdraw';});
 if(projectionRows.length>1)throw Error('REFUSE·receipt publication ambiguous standing projection');
 const selectors=projectionRows.length?(parse(projectionRows[0]).value!.fields.value??'').split('|').filter(Boolean):[];
 const historical=fold.standing.filter((line:string)=>{const f=parse(line);return f.kind==='fact'&&selectors.some((selector:string)=>matches(selector,f.value.fields.scope??''));});
 if(selectors.some((selector:string)=>!historical.some((line:string)=>matches(selector,parse(line).value!.fields.scope??''))))throw Error('REFUSE·receipt publication selector has no statement');
 for(const line of historical){const f=parse(line).value!.fields;if(f.role!=='demands'||f.form!=='alphabet'||f.measure!=='status'||f.value!=='present'||fold.standing.some((other:string)=>other!==line&&(parse(other).value?.fields.needs??'').split('|').some(need=>matches(need,f.scope??''))))throw Error('REFUSE·receipt publication cannot omit a consumed statement or bound');}
 const published=publicationOf(fold.standing.filter((line:string)=>!historical.includes(line)));
 writeFileSync(join(stage,'TARGET.bound'),published.join('\n')+'\n');
 const reference=canonical({scope:'receipts/history/'+digest.slice(7),role:'writes',form:'alphabet',measure:'digest',value:digest,at:'place:'+digest,by:'bound',shape:'publication-history@1',about:sourceBase+file});
 const current={...fold,root:stage,receiptHistory:[reference]},lock=readFileSync(join(instrument,'TARGET.bound'),'utf8').split('\n').filter(Boolean),runtime={root:instrument,entry:join(instrument,'dist/cli/verb.js'),directory:join(instrument,'dist'),extension:'.js' as const,lock};
 const lines=withHostCall({instrumentName:selfName(),runtime},()=>withoutEffects(()=>withContentStore(fold.store,()=>[...receiptRegion(current,8),...receiptRegion(current,0),...receiptRegion(current,1,materializedOutputs)],()=>fold.standing)));
 writeFileSync(join(stage,'receipts.bound'),lines.join('\n')+'\n');
 return {digest,file,source:sourceBase+file,bytes:Buffer.byteLength(document),sourceReceipts:sha256(records.receipts),admittedHistory:sha256(records.admitted)};
}

/** This build-only entry consumes an explicit publication profile. It refuses
 * an open source rather than manufacturing a current snapshot from a memo. */
export async function publishReceiptEvidenceInNativeProcess(source:string,stage:string,outputDirectory:string,materializedOutputs?:readonly string[]){
 const load=(name:string)=>import(pathToFileURL(join(source,'dist',name+'.js')).href);
 const [{fieldOf,isWire,selfName},{withHostCall},{withoutEffects},{withContentStore},{foldPlace,standingOf},{meets}]=await Promise.all([load('fold/claims'),load('host/call-context'),load('host/read-only'),load('host/content-store'),load('cli/place'),load('fold/closed')]);
 const lock=readFileSync(join(source,'TARGET.bound'),'utf8').split('\n').filter(isWire),profiles=lock.filter((line:string)=>fieldOf(line,'scope')==='publish/receipt-history'&&fieldOf(line,'value')!=='withdraw');
 if(!profiles.length)return undefined;
 if(profiles.length!==1||fieldOf(profiles[0],'value')!=='current-with-history@1')throw Error('REFUSE·receipt publication profile');
 // A clean checkout may already carry the verified public projection. It
 // needs no private snapshot and never rewrites or fetches its named history.
 const [{carriedFrom},{isSha256}]=await Promise.all([load('fold/resolved'),load('host/hash')]);
 const publicRows=carriedFrom(join(source,'.bound'),readFileSync(join(source,'receipts.bound'),'utf8').split('\n').filter(isWire));
 const references=publicRows?.filter((line:string)=>fieldOf(line,'scope').startsWith('receipts/history/')&&fieldOf(line,'shape')==='publication-history@1')??[];
 if(references.length){
  for(const line of references)if(!isSha256(fieldOf(line,'value'))||fieldOf(line,'at')!=='place:'+fieldOf(line,'value'))throw Error('REFUSE·receipt publication history reference');
  execFileSync(process.execPath,[join(source,'dist/cli/verb.js'),'fold','--check'],{cwd:source,stdio:'inherit'});
  return {reused:true,references:references.length};
 }
 const runtime={root:source,entry:join(source,'dist/cli/verb.js'),directory:join(source,'dist'),extension:'.js' as const,lock};
 const {underRootAuthority}=await load('land/act');
 return underRootAuthority(join(source,'.bound'),'publication snapshot',async()=>{
 const fold=withHostCall({instrumentName:selfName(),runtime},()=>withoutEffects(()=>withContentStore(join(source,'.bound'),()=>{
  if(!meets(source,join(source,'.bound'),''))throw Error('REFUSE·receipt publication requires a current closed source');
  const current=foldPlace(source,runtime.entry);if(current.release.status!=='ready')throw Error('REFUSE·receipt publication source is not ready');return current;
 },()=>standingOf(source).standing)));
 const one=(scope:string)=>{const rows=fold.standing.filter((line:string)=>fieldOf(line,'scope')===scope&&fieldOf(line,'value')!=='withdraw');if(rows.length!==1)throw Error('REFUSE·receipt publication ambiguous '+scope);return fieldOf(rows[0],'value');};
 const span=/^0\.\.([1-9][0-9]*)$/.exec(one('transport/response-bytes')),limit=Number(span?.[1]);
 if(!span||!Number.isSafeInteger(limit))throw Error('REFUSE·receipt publication budget');
 return projectReceiptEvidence(source,source,stage,outputDirectory,fold,one('sources/receipt-history'),limit,materializedOutputs);
 });
}

/** The build's TypeScript loader flags are not execution flags of the
 * compiled instrument. Compile this same trusted recipe with the pinned build
 * compiler and invoke it under the existing compiled CLI process boundary. */
export async function publishReceiptEvidence(source:string,stage:string,outputDirectory:string,materializedOutputs?:readonly string[]){
 const work=mkdtempSync(join(tmpdir(),'receipt-publication-loader-'));
 try{
  const module=join(work,'publisher.mjs'),result=join(work,'result.json');
  symlinkSync(join(dirname(fileURLToPath(import.meta.url)),'..','node_modules'),join(work,'node_modules'),'dir');
  writeFileSync(module,transformSync(readFileSync(fileURLToPath(import.meta.url),'utf8'),{loader:'ts',format:'esm',target:'es2022'}).code);
  const program=`import{writeFileSync}from'node:fs';import{publishReceiptEvidenceInNativeProcess as run}from${JSON.stringify(pathToFileURL(module).href)};writeFileSync(${JSON.stringify(result)},JSON.stringify((await run(${JSON.stringify(source)},${JSON.stringify(stage)},${JSON.stringify(outputDirectory)},${JSON.stringify(materializedOutputs)}))??null));`;
  execFileSync(process.execPath,['--input-type=module','-e',program],{stdio:'inherit'});
  return JSON.parse(readFileSync(result,'utf8'))??undefined;
 }finally{rmSync(work,{recursive:true,force:true});}
}

/** Form the manifest's actual delivery tree before invoking the instrument's
 * existing byte sealer. Native readings are retained; no providers are opened.
 * Only this tree is packed, once, and an existing output is never replaced. */
export async function archiveOfPlace(place:string,output:string):Promise<void>{
 const source=resolve(place),destination=resolve(output);
 if(existsSync(destination))throw Error('Archive output already exists');
 const work=mkdtempSync(join(tmpdir(),'bound-delivery-')),root=join(work,'place');
 mkdirSync(root);
 let completed=false;
 try{
  const cache=join(work,'npm-cache');
  const listed=JSON.parse(execFileSync('npm',['pack','--dry-run','--ignore-scripts','--offline','--cache',cache,'--json'],{cwd:source,encoding:'utf8'}))[0];
  for(const file of listed.files){
   const target=resolve(root,file.path);
   if(!target.startsWith(root+'/'))throw Error('Manifest member is outside delivery');
   mkdirSync(dirname(target),{recursive:true});copyFileSync(join(source,file.path),target);chmodSync(target,file.mode);
  }
  await publishReceiptEvidence(source,root,dirname(destination),listed.files.map((file:{path:string})=>file.path));
  const {closeReceipts}=await import(pathToFileURL(join(root,'dist/fold/closed.js')).href);
  const {withContentStore}=await import(pathToFileURL(join(root,'dist/host/content-store.js')).href);
  await withContentStore(join(root,'.bound'),()=>closeReceipts(root,join(root,'.bound')));
  execFileSync(process.execPath,[join(root,'dist/cli/verb.js'),'fold','--check'],{cwd:root,stdio:'inherit'});
  const packed=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--offline','--cache',cache,'--json','--pack-destination',work],{cwd:root,encoding:'utf8'}))[0];
  const bytes=await compactArchive(readFileSync(join(work,packed.filename)));
  writeFileSync(destination,bytes,{flag:'wx'});
  completed=true;
 }finally{
  // A failed formation retains its place and receipts for diagnosis.
  if(completed)rmSync(work,{recursive:true,force:true});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);
 if(args[0]==='--from-place'){
  if(args.length!==3)throw Error('Usage: compact-archive --from-place <place> <new-output.tgz>');
  await archiveOfPlace(args[1],args[2]);
 }else{
  const [input,output]=args;if(args.length!==2)throw Error('Usage: compact-archive <input.tgz> <new-output.tgz>');
  const bytes=await compactArchive(readFileSync(input));writeFileSync(output,bytes,{flag:'wx'});
 }
}
