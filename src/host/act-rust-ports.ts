import {closeSync,constants,fstatSync,fsyncSync,lstatSync,openSync,readSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {parse,type Signer} from '@lapxo/topos/wire';
import {authorityFor} from '../fold/signers.ts';
import {verifiesFields} from '../land/sign.ts';
import {runRustPort} from '../wasm/rust-ports.ts';
import {sha256} from './hash.ts';
import {nativePublicationStorage,preparePublicationStage,writePublicationMember,syncDirectory} from './ports/publication.ts';

const pin='sha256:126a6f1f550135ffa394a146c0fc22ed68e0eeb516286b6a995185975a119640';
const moduleBytes=()=>readFileSync(new URL('../../assets/wasm/bound-act-ports.wasm',import.meta.url));

/** Rust owns ordering. Only this receiver adapter knows the destination or
 * holds the real bytes. The ABI carries exact member digest references. */
export async function publishWithRustPort(committed:string,files:Readonly<Record<string,string>>):Promise<void>{
 const entries=Object.entries(files);
 const members=entries.map(([name,bytes])=>({name,bytes:sha256(bytes)}));
 let stage:string|undefined;
 try{
  const reply=await runRustPort(moduleBytes(),pin,{profile:'bound-persistence-prepared@1',files:members},
   'bound_storage','persistence_eval',request=>{
    switch(request.op){
     case 'preflight': return {fileFlush:true,directoryFlush:true,atomicPublish:true};
     case 'prepare': stage=preparePublicationStage(committed);return null;
     case 'write':{
      const index=request.index;
      if(typeof index!=='number'||!Number.isSafeInteger(index)||!stage)throw Error('persistence/write');
      const member=members[index],entry=entries[index];
      if(!member||!entry||member.name!==request.name||member.bytes!==request.bytes)throw Error('persistence/member');
      writePublicationMember(stage,entry[0],entry[1]);
      return null;
     }
     case 'flush-stage': if(!stage)throw Error('persistence/stage');syncDirectory(stage);return null;
     case 'publish': if(!stage)throw Error('persistence/stage');nativePublicationStorage.publish(stage,committed);return null;
     case 'cleanup': if(stage)rmSync(stage,{recursive:true,force:true});stage=undefined;return null;
     default: throw Error('persistence/operation');
    }
   });
  if(!Array.isArray(reply)||reply[0]!=='bound-persistence-result@1'||reply[1]?.status!=='durable'||
   reply[1]?.visibility!=='durable'||reply[1]?.files!==entries.length)throw Error(reply instanceof Array?reply[1]?.code??'persistence/response':'persistence/response');
 }finally{if(stage)rmSync(stage,{recursive:true,force:true});}
}

export interface WorkerAdmissionContext {
 readonly anchor:Signer;
 readonly algorithms:readonly string[];
 readonly history:readonly string[];
 readonly queries:readonly string[];
}

export async function inspectWithRustPort(context:WorkerAdmissionContext,operation:'authority'|'verify',long:boolean){
 const {anchor,algorithms,history,queries}=context;
 if(anchor.keyClass!=='authorize'||!anchor.publicKey||anchor.publicKey.includes('PRIVATE KEY'))throw Error('admission/anchor');
 const lines=[...new Set([...history,...queries])],indices=new Map(lines.map((line,i)=>[line,i]));
 const records=lines.map(line=>{const got=parse(line);const fields=got.kind==='fact'?got.value.fields:null;return {fields,epoch:Number(fields?.epoch)||0}});
 const historyIndices=history.map(line=>indices.get(line)!);
 let authority:ReturnType<typeof authorityFor>|undefined;
 return runRustPort(moduleBytes(),pin,{profile:'bound-admission-prepared@1',operation,records,
  history:historyIndices,queries:queries.map(line=>indices.get(line)!),place:'',family:''},'bound_admission',long?'admission_history_finish':'admission_eval',request=>{
  if(request.op===(long?'select-held':'select')){
   if(!long&&JSON.stringify(request.history)!==JSON.stringify(historyIndices))throw Error('admission/history');
   if(authority)throw Error('admission/history');
   authority=authorityFor(history,anchor,algorithms);
   return JSON.stringify({admitted:authority.admitted,potential:authority.potential});
  }
  if(typeof request.index!=='number'||!Number.isSafeInteger(request.index)||!records[request.index])throw Error('admission/index');
  const index=request.index;
  if(request.op==='verify-root'){const {fields}=records[index]!;return fields!==null&&verifiesFields(fields,anchor.publicKey,algorithms);}
  if(request.op==='verdict'&&authority)return JSON.stringify(authority.of(lines[index]!));
  throw Error('admission/operation');
 });
}

/** Reconfirms an existing receiver-selected bundle. Missing bytes always refuse
 * at inspect; this adapter never exposes Rust recovery's creation branch. */
export async function reconfirmWithRustPort(committed:string,files:Readonly<Record<string,string>>):Promise<void>{
 const entries=Object.entries(files), members=entries.map(([name,bytes])=>({name,bytes:sha256(bytes)}));
 const exact=(flush:boolean)=>{
  if(!lstatSync(committed).isDirectory())return false;
  const names=readdirSync(committed).sort();
  if(JSON.stringify(names)!==JSON.stringify(entries.map(([name])=>name).sort()))return false;
  for(const [name,text]of entries){
   const expected=Buffer.from(text),actual=Buffer.alloc(expected.length);
   const fd=openSync(join(committed,name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
   try{
    const stat=fstatSync(fd);
    if(!stat.isFile()||stat.size!==expected.length)return false;
    for(let at=0;at<actual.length;){const n=readSync(fd,actual,at,actual.length-at,null);if(!n)return false;at+=n;}
    if(!actual.equals(expected)||fstatSync(fd).size!==expected.length)return false;
    if(flush)fsyncSync(fd);
   }finally{closeSync(fd)}
  }
  if(flush){syncDirectory(committed);syncDirectory(dirname(committed));}
  return true;
 };
 const reply=await runRustPort(moduleBytes(),pin,{profile:'bound-persistence-recovery-prepared@1',files:members},
  'bound_storage','persistence_recover',request=>{
   if(!Array.isArray(request.files)||request.files.length!==members.length||request.files.some((file,i)=>
    !file||file.name!==members[i]?.name||file.bytes!==members[i]?.bytes))throw Error('persistence/recovery-members');
   if(request.op==='inspect')return exact(false)?'matching':'conflict';
   if(request.op==='reconfirm'&&exact(true))return null;
   throw Error('persistence/recovery-conflict');
  });
 if(!Array.isArray(reply)||reply[0]!=='bound-persistence-recovery-result@1'||reply[1]?.status!=='durable'||
  reply[1]?.visibility!=='durable'||reply[1]?.route!=='existing'||reply[1]?.files!==entries.length)throw Error('persistence/recovery-refused');
}
