// Experimental receiver port. Caller MUST hold the existing act/region lock
// over inspect, reconfirm and publication; this module supplies no authority.
import fs from'node:fs';import path from'node:path';
import{createMemberNamespace}from'./member-namespace.mjs';
import{requireEffects}from'../../dist/host/read-only.js';
import{createNodeStorage,nodeDirectorySync}from'./node-storage-v2.mjs';
const fail=code=>{throw Object.assign(Error(code),{code})};
export function createRecoveryStorage(target,options={}){
 const namespace=createMemberNamespace(options.platform??process.platform),storage=createNodeStorage(target,options),sync=options.syncDirectory??nodeDirectorySync,trace=[];
 function compare(files,flush=false){
  if(!Array.isArray(files))fail('persistence/member');namespace.check(files.map(m=>m?.name));
  const expected=new Map();for(const m of files){if(typeof m.name!=='string'||!m.name||m.name==='.'||m.name==='..'||/[\\/\0]/.test(m.name)||typeof m.bytes!=='string'||expected.has(m.name))fail('persistence/member');expected.set(m.name,Buffer.from(m.bytes,'utf8'));}
  let before;try{before=fs.lstatSync(target)}catch(e){if(e.code==='ENOENT')return'absent';fail('persistence/inspect');}
  if(!before.isDirectory()||before.isSymbolicLink())return'conflict';
  const names=fs.readdirSync(target);if(names.length!==expected.size||names.some(n=>!expected.has(n)))return'conflict';
  for(const name of names){const file=path.join(target,name),want=expected.get(name),prior=fs.lstatSync(file);if(!prior.isFile()||prior.isSymbolicLink()||prior.size!==want.length)return'conflict';
   const fd=fs.openSync(file,(flush?fs.constants.O_RDWR:fs.constants.O_RDONLY)|(fs.constants.O_NOFOLLOW??0));try{
    const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size!==want.length||stat.ino!==prior.ino||stat.dev!==prior.dev)return'conflict';
    const bytes=Buffer.alloc(want.length+1);let at=0,n;while(at<bytes.length&&(n=fs.readSync(fd,bytes,at,bytes.length-at,null))>0)at+=n;
    if(at!==want.length||!bytes.subarray(0,at).equals(want))return'conflict';
    if(flush)fs.fsyncSync(fd);
    const after=fs.fstatSync(fd);if(after.size!==want.length)return'conflict';
   }finally{fs.closeSync(fd)}
  }
  const after=fs.lstatSync(target),last=fs.readdirSync(target);if(after.ino!==before.ino||after.dev!==before.dev||last.length!==expected.size||last.some(n=>!expected.has(n)))return'conflict';return'matching';
 }
 return{trace,call(q){trace.push(q.op);
  if(q.op==='inspect')return compare(q.files);
  if(q.op==='reconfirm'){
   try{requireEffects('persistence recovery')}catch{fail('persistence/effects')}
   if(compare(q.files,true)!=='matching')fail('persistence/conflict');
   try{sync(target);sync(path.dirname(target))}catch{fail('persistence/directory-sync')}
   if(compare(q.files)!=='matching')fail('persistence/conflict');return null;
  }
  return storage.call(q);
 }};
}
