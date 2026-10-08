import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const [yes,no]=process.argv.slice(2);
const profile=JSON.parse(readFileSync(yes,'utf8')),negative=JSON.parse(readFileSync(no,'utf8'));
assert.equal(profile.places.length,2);assert.equal(negative.cause,'digest-mismatch');
const root=mkdtempSync(join(tmpdir(),'archive-conformance-'));
const hash=bytes=>createHash(profile.algorithm).update(bytes).digest('hex');
const events=[];
const run=(program,args,cwd)=>{
 const r=spawnSync(program,args,{cwd,encoding:'utf8',timeout:profile.timeoutMs,maxBuffer:profile.maxBytes});
 events.push({program,args,status:r.status,signal:r.signal,stdout:r.stdout,stderr:r.stderr});
 assert.equal(r.status,0,r.stderr||r.stdout||String(r.error));return r.stdout;
};
const readVerified=(path,digest)=>{const bytes=readFileSync(path);if(hash(bytes)!==digest)throw Error('REFUSE·artifact digest-mismatch');return bytes;};
try {
 for(const place of profile.places){
  const source=join(root,place.name),consumer=join(root,place.name+'-consumer'),cache=join(root,place.name+'-cache');mkdirSync(source);mkdirSync(consumer);
  const manifest={name:place.name,version:place.version,type:'module',files:Object.keys(place.files),bin:{sample:'entry.mjs'}};
  writeFileSync(join(source,'package.json'),JSON.stringify(manifest,null,2)+'\n');
  for(const[path,body]of Object.entries(place.files)){assert.ok(!path.startsWith('/')&&!path.split('/').includes('..'));writeFileSync(join(source,path),body);}
  const report=JSON.parse(run(profile.packageProgram,['pack','--ignore-scripts','--json','--cache',cache],source))[0];
  const archive=join(source,report.filename),digest=hash(readFileSync(archive));
  // Both destinations receive this one archive, not another pack invocation.
  const destinations=['forge','registry'].map(name=>join(root,place.name+'-'+name+'.tgz'));
  for(const destination of destinations){cpSync(archive,destination);readVerified(destination,digest);}
  writeFileSync(join(consumer,'package.json'),'{"private":true}\n');
  run(profile.packageProgram,['install','--offline','--ignore-scripts','--no-audit','--no-fund','--cache',cache,resolve(archive)],consumer);
  const installed=join(consumer,'node_modules',place.name);
  for(const member of report.files){assert.ok(!member.path.startsWith('/')&&!member.path.split('/').includes('..'));assert.ok(readFileSync(join(source,member.path)).equals(readFileSync(join(installed,member.path))),member.path);console.log('MEMBER '+place.name+'/'+member.path+' · '+profile.algorithm+':'+hash(readFileSync(join(installed,member.path))));}
  const output=run(process.execPath,[join(installed,'entry.mjs')],consumer);assert.equal(output,place.stdout);
  const corrupt=Buffer.from(readFileSync(archive));corrupt[negative.byteOffset]^=1;const refused=join(root,place.name+'-changed.tgz');writeFileSync(refused,corrupt);
  assert.throws(()=>readVerified(refused,digest),/REFUSE·artifact digest-mismatch/);
  console.log('ARCHIVE '+place.name+' · '+profile.algorithm+':'+digest+' · '+report.files.length+' members equal · one archive, two destinations');
  console.log('INSTALLED '+place.name+' · '+output.trim());console.log('REFUSE·artifact digest-mismatch · '+place.name);
 }
 console.log('ARTIFACT two unrelated places · installed bytes equal · changed bytes refused');
} finally {rmSync(root,{recursive:true,force:true});}
