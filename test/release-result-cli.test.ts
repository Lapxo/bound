import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical,signedBytes,formatSignature} from '@lapxo/topos/wire';
const cli=process.env.BOUND_TEST_READER??new URL('../dist/cli/verb.js',import.meta.url).pathname;
for(const name of ['orchard','library'])test(`release approval uses the public admission boundary in ${name}`,()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-release-')),root=join(temp,name);mkdirSync(root);
 try{
  const pair=generateKeyPairSync('ed25519'),other=generateKeyPairSync('ed25519');
  const pub=pair.publicKey.export({format:'der',type:'spki'}).toString('base64');
  const row=(scope:string,measure:string,value:string)=>({scope,measure,value,form:'alphabet',role:'writes',by:'owner',at:'witness:release',epoch:'1'});
  const signed=(fields:Record<string,string>,key=pair.privateKey)=>canonical({...fields,sig:formatSignature('ed25519:sample',sign(null,Buffer.from(signedBytes(fields)),key).toString('base64'))});
  const lock=[row('keys/owner','class','authorize'),row('keys/owner','public-key',pub),row('keys/owner','coverage','*'),row('wire/signature-algorithms','id','ed25519:sample'),row('wire/era','id','sample')].map(f=>signed(f));
  const target=join(root,'TARGET.bound');writeFileSync(target,lock.join('\n')+'\n');
  const fields=[row('release/tag-a','digest','sha256:'+'a'.repeat(64)),row('release/artifact','id',name+'.tgz'),row('sources/archive','id','https://example.invalid/'+name+'.tgz')];
  const approval=join(temp,'approval-signed');
  const captures:unknown[]=[];
  const run=(args=['fold','--as','release',approval])=>{const got=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',timeout:10_000,env:{...process.env,NODE_OPTIONS:''}});captures.push({args:args.map(a=>a===approval?'approval-signed':a),status:got.status,stdout:got.stdout,stderr:got.stderr});return got;};
  writeFileSync(approval,fields.map(f=>signed(f)).join('\n')+'\n');
  const sample={lock:readFileSync(target,'utf8'),approval:readFileSync(approval,'utf8')};
  const first=run();assert.equal(first.status,0,first.stdout+first.stderr);assert.equal(first.stdout,`READY sha256:${'a'.repeat(64)} ${name}.tgz https://example.invalid/${name}.tgz\n`);
  const shorthand=run(['.','--as','release',approval]);assert.equal(shorthand.status,0,shorthand.stderr);assert.equal(shorthand.stdout,first.stdout);
  const again=run();assert.equal(again.stdout,first.stdout);assert.deepEqual(readdirSync(root),['TARGET.bound']);assert.equal(readFileSync(target,'utf8'),lock.join('\n')+'\n');
  console.log(first.stdout.trim());
  for(const [caseName,rows] of [
   ['changed signed digest',fields.map(f=>signed(f)).map(l=>l.replace('a'.repeat(64),'b'.repeat(64)))],
   ['duplicate declaration',[...fields,fields[0]!].map(f=>signed(f))],
   ['wrong owner',fields.map(f=>signed(f,other.privateKey))],
   ['missing source',fields.slice(0,2).map(f=>signed(f))],
   ['credential-bearing source',fields.map(f=>signed(f.scope==='sources/archive'?{...f,value:'https://user:password@example.invalid/a.tgz'}:f))],
   ['unsafe filename',fields.map(f=>signed(f.scope==='release/artifact'?{...f,value:'../a.tgz'}:f))],
   ['unsigned declaration',fields.map(f=>canonical(f))],
   ['malformed bytes',['not a wire record']],
  ] as const){writeFileSync(approval,rows.join('\n')+'\n');const got=run();assert.equal(got.status,1,caseName+got.stdout+got.stderr);assert.equal(got.stdout,'',caseName);assert.match(got.stderr,/REFUSE·release/);}
  writeFileSync(approval,fields.map(f=>signed(f)).join('\n')+'\n');
  writeFileSync(target,lock.map(l=>l.includes('measure=coverage')?signed(row('keys/owner','coverage','release/**')):l).join('\n')+'\n');
  const covered=run();assert.equal(covered.status,1);assert.equal(covered.stdout,'');assert.match(covered.stderr,/REFUSE·release.*sources\/archive/);
  for(const args of [['fold','--as','release'],['fold','--as','release',approval,approval],['fold','--as','release','absent'],['fold','--as','release',approval,'--check']]){const got=run(args);assert.equal(got.status,1);assert.equal(got.stdout,'');assert.match(got.stderr,/REFUSE·release/);}
  assert.deepEqual(readdirSync(root),['TARGET.bound'],'judgment never lands, observes or creates a store');
  if(process.env.BOUND_RELEASE_CAPTURE)writeFileSync(process.env.BOUND_RELEASE_CAPTURE+'.'+name+'.json',JSON.stringify({sample,captures,assertion:'No ledger, source fetch, renderer or signing invocation'},null,2)+'\n');
 }finally{rmSync(temp,{recursive:true,force:true});}
});
