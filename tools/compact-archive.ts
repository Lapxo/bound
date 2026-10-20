import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,copyFileSync,chmodSync,rmSync,existsSync} from 'node:fs';
import {gunzipSync,gzipSync,constants} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';

/** Compress with the standard runtime. Exact tar bytes and member metadata survive.
 * A distinct, new output is required; an approved archive is never overwritten. */
export async function compactArchive(input:Uint8Array):Promise<Uint8Array>{
 const tar=gunzipSync(input),packed=gzipSync(tar,{level:9,memLevel:7,strategy:constants.Z_FILTERED});
 if(!gunzipSync(packed).equals(tar))throw Error('Archive compaction changed tar bytes');
 return packed;
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
