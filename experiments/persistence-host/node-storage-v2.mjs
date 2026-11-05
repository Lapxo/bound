// Development host adapter. Not selected by production, Root or carrier data.
// Caller must already hold the existing act/region exclusion boundary.
import fs from'node:fs';import path from'node:path';import{randomUUID}from'node:crypto';
import{createMemberNamespace}from'./member-namespace.mjs';
import{requireEffects}from'../../dist/host/read-only.js';
const fault=code=>{throw Object.assign(Error(code),{code})};
export function nodeDirectorySync(directory){const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
export function createNodeStorage(target,{syncDirectory=nodeDirectorySync,platform=process.platform}={}){
 if(!path.isAbsolute(target)||path.basename(target).toLowerCase().startsWith('.stage-'))fault('persistence/target');const parent=path.dirname(target),namespace=createMemberNamespace(platform);let staged;const trace=[];
 const sync=directory=>{try{syncDirectory(directory)}catch{fault('persistence/directory-sync')}};
 function call(q){trace.push(q.op);try{requireEffects('atomic publication')}catch{fault('persistence/effects')}
  if(q.op==='preflight'){
   namespace.check(q.members);
   if(fs.existsSync(target))fault('persistence/occupied');let probe=parent;
   while(!fs.existsSync(probe)){const next=path.dirname(probe);if(next===probe)fault('persistence/parent');probe=next;}
   if(!fs.statSync(probe).isDirectory())fault('persistence/parent');sync(probe);
   return{fileFlush:true,directoryFlush:true,atomicPublish:true};
  }
  if(q.op==='prepare'){
   const created=fs.mkdirSync(parent,{recursive:true});if(created!==undefined)for(let at=parent;;at=path.dirname(at)){sync(at);if(at===path.dirname(created))break;}
   const candidate=path.join(parent,'.stage-'+randomUUID());if(candidate===target)fault('persistence/stage-collision');fs.mkdirSync(candidate,{mode:0o700});staged=candidate;return null;
  }
  if(!staged&&q.op!=='cleanup')fault('persistence/stage');
  if(q.op==='write'){
   // The kernel checks this too. The host never turns a member into an escape.
   namespace.check([q.name]);if(typeof q.bytes!=='string')fault('persistence/member');
   const fd=fs.openSync(path.join(staged,q.name),'wx',0o600);try{fs.writeFileSync(fd,q.bytes,'utf8');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}return null;
  }
  if(q.op==='flush-stage'){sync(staged);return null;}
  if(q.op==='publish'){fs.renameSync(staged,target);sync(parent);return null;}
  if(q.op==='cleanup'){if(staged)fs.rmSync(staged,{recursive:true,force:true});staged=undefined;return null;}
  fault('persistence/operation');
 }
 return{call,trace};
}
