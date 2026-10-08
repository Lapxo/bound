import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,cpSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical,publicationOf} from '@lapxo/topos/wire';
import {foldClaims,isWire} from '../src/fold/claims.ts';

for(const name of ['calibration','inventory'])test(`completed ${name} renders seal native file receipts before check; unchanged pass is idle`,()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-pass-order-')),root=join(temp,name),key=join(temp,'device.pem');
 const reader=process.env.BOUND_TEST_READER??new URL('../dist/cli/verb.js',import.meta.url).pathname;
 const pair=generateKeyPairSync('ed25519');
 const row=(scope:string,measure:string,value:string,extra:Record<string,string>={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',by:'target',at:'policy:pass',...extra});
 const captures:unknown[]=[];
 const run=(args:string[])=>{const p=spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:20000});captures.push({args,status:p.status,stdout:p.stdout,stderr:p.stderr});return p;};
 const ok=(args:string[])=>{const p=run(args);assert.equal(p.status,0,p.stderr+p.stdout);return p;};
 try{
  mkdirSync(join(root,'src'),{recursive:true});writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  const seed=[row('keys/device','class','authorize'),row('keys/device','coverage','*'),row('keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/device','signer','file'),row('keys/reader','class','read'),row('keys/folder','class','fold'),row('signer/timeout','milliseconds','5000..5000',{form:'interval'}),row('signer/response-bytes','bytes','65536..65536',{form:'interval'}),row('wire/era','id','test'),row('wire/signature-algorithms','id','ed25519:test'),row('wire/digest-algorithms','id','sha256')];
  for(const [k,v] of Object.entries({families:'keys|signer|wire|tree|write|leaf|reader|read|fold|receipts|rendered|resolved|beat|view|region|sample|vector|cost|source|class|pipeline|host|store',fields:'scope|role|form|measure|value|by|at|needs|sig|epoch|shape|restsOn|condition|about|kind|view',required:'scope|role|form|measure|value|by|at',forms:'alphabet|interval',roles:'reads|writes|demands','at-classes':'origin|place|receipt|witness|policy',shapes:'run|input.txt|receipts.bound|src/'+name+'.txt','receipt-fields':'scope|role|form|measure|value|by|at'}))seed.push(row('wire/'+k,'id',v));
  seed.push(row('reader/extent','reader','extent.mjs',{shape:'input.txt',needs:'src/'}),row('view/a-receipts','id','receipts@8|receipts@0|receipts@1',{role:'demands',shape:'receipts.bound',needs:'receipts.bound'}),row('view/z-readout','id','lines@8',{role:'demands',shape:'src/'+name+'.txt',needs:'src/'+name+'.txt'}));
  writeFileSync(join(root,'src/input.txt'),name+'\n');writeFileSync(join(root,'extent.mjs'),"export const observe=bytes=>[{name:'sample/extent',bound:{form:'interval',lo:bytes.length,hi:bytes.length}}];");writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');
  ok(['land','--key','device','--key-file',key]);
  writeFileSync(join(root,'src',name+'.txt'),'previous rendered edition\n');
  ok(['fold','--as','a-receipts']);
  const first=ok(['fold']);assert.match(first.stdout,/RENDERED .*\.txt/);assert.match(first.stdout,/PASS\s+closed/);
  ok(['fold','--check']);const receipt=readFileSync(join(root,'receipts.bound'),'utf8'),output=readFileSync(join(root,'src',name+'.txt'),'utf8');
  const idle=ok(['fold']);assert.match(idle.stderr,/RECEIPTS \d+ read · 0 opened/);assert.match(idle.stdout,/PASS\s+closed/);assert.doesNotMatch(idle.stderr,/OWN\s|CAPSULE .* run|READER\s|OBSERVE\s/,'idle must not reopen providers or readers');assert.equal(readFileSync(join(root,'receipts.bound'),'utf8'),receipt);assert.equal(readFileSync(join(root,'src',name+'.txt'),'utf8'),output);
  const publicRoot=join(temp,name+'-public');mkdirSync(publicRoot);
  cpSync(join(root,'src'),join(publicRoot,'src'),{recursive:true});cpSync(join(root,'extent.mjs'),join(publicRoot,'extent.mjs'));
  const published=publicationOf(foldClaims(readFileSync(join(root,'TARGET.bound'),'utf8').split('\n').filter(isWire)).standing);
  writeFileSync(join(publicRoot,'TARGET.bound'),published.join('\n')+'\n');writeFileSync(join(publicRoot,'receipts.bound'),receipt);
  const publicCheck=spawnSync(process.execPath,[reader,'fold','--check'],{cwd:publicRoot,encoding:'utf8',timeout:20000});
  captures.push({args:['public-checkout','fold','--check'],status:publicCheck.status,stdout:publicCheck.stdout,stderr:publicCheck.stderr});
  assert.equal(publicCheck.status,0,publicCheck.stderr+publicCheck.stdout);assert.match(publicCheck.stdout,/PASS\s+closed/);assert.match(publicCheck.stderr,/0 opened/);
  assert.equal(existsSync(join(publicRoot,'.bound')),false,'public verification writes neither history nor caches');
  writeFileSync(join(publicRoot,'src/input.txt'),'changed public input');const alteredCheck=spawnSync(process.execPath,[reader,'fold','--check'],{cwd:publicRoot,encoding:'utf8',timeout:20000});assert.equal(alteredCheck.status,1);assert.match(alteredCheck.stderr,/REFUSE·check receipts are open/);
  const proposal=join(temp,'store-limit.proposal');writeFileSync(proposal,row('store/bytes','bytes','0..1000000000',{form:'interval',role:'reads'})+'\n');
  const signed=ok(['sign',proposal,'--key','device','--key-file',key]);assert.match(signed.stdout,/sig=/);assert.doesNotMatch(signed.stderr,/CAPSULE .* run|READER\s|OBSERVE\s|OWN\s/,'sign consumes the verified completed snapshot without provider work');assert.equal(readFileSync(join(root,'receipts.bound'),'utf8'),receipt);
  const unreadProposal=join(temp,'unread-limit.proposal');writeFileSync(unreadProposal,row('sample/unmeasured','count','0..0',{form:'interval',role:'reads'})+'\n');const unread=run(['sign',unreadProposal,'--key','device','--key-file',key]);assert.equal(unread.status,1);assert.match(unread.stderr,/REFUSE·inert/,'a closed snapshot cannot invent a missing reading');assert.equal(readFileSync(join(root,'receipts.bound'),'utf8'),receipt);
  writeFileSync(join(root,'src/input.txt'),'tampered measured input\n');const refused=run(['fold','--check']);assert.equal(refused.status,1);assert.match(refused.stderr,/REFUSE·check receipts are open/);
 }finally{if(process.env.BOUND_TEST_CAPTURE)writeFileSync(process.env.BOUND_TEST_CAPTURE+'.'+name+'.json',JSON.stringify(captures,null,2)+'\n');rmSync(temp,{recursive:true,force:true});}
});
