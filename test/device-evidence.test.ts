import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical,parse,signedBytes,parseSignature} from '@lapxo/topos/wire';

for(const keyClass of ['authorize','read','access'])test(`native lines preserve admitted ${keyClass} evidence, exact withdrawals and signature refusals`,()=>{
 const reader=process.env.BOUND_TEST_READER??new URL('../src/cli/verb.ts',import.meta.url).pathname;
 const temp=mkdtempSync(join(tmpdir(),'bound-device-evidence-')),root=join(temp,'place');
 const devices=['north','south'].map(id=>({id,pair:generateKeyPairSync('ed25519'),key:join(temp,`${id}.pem`)}));
 devices.push({id:'alias',pair:devices[1].pair,key:join(temp,'alias.pem')});
 const row=(scope,measure,value)=>canonical({scope,measure,value,form:'alphabet',role:'writes',at:'policy:evidence',by:'target'});
 const captures=[];const run=args=>{const started=Date.now(),p=spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:20000});captures.push({reader,args:args.map(arg=>arg.endsWith('.pem')?'[ephemeral key path]':arg),status:p.status,stdout:p.stdout,stderr:p.stderr,runtimeMs:Date.now()-started});return p;};
 const rows=text=>text.split('\n').map(line=>parse(line)).filter(p=>p.kind==='fact').map(p=>p.value.fields);
 try {
  mkdirSync(root);
  const seed=[row('wire/era','id','sample'),row('wire/signature-algorithms','id','ed25519:sample'),row('wire/digest-algorithms','id','sha256')];
  for(const [name,value] of [['fields','scope|role|form|measure|value|by|at|epoch|sig'],['required','scope|role|form|measure|value|by|at'],['forms','alphabet|interval'],['roles','reads|writes|demands'],['at-classes','policy|place|origin|witness|receipt'],['families','keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region']])seed.push(row(`wire/${name}`,'id',value));
  for(const d of devices){writeFileSync(d.key,d.pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});seed.push(row(`keys/${d.id}`,'class',d.id==='north'?'authorize':keyClass),row(`keys/${d.id}`,'coverage',d.id==='north'?'*':`sample/${d.id}`),row(`keys/${d.id}`,'public-key',d.pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row(`keys/${d.id}`,'signer','file'),canonical({scope:`keys/${d.id}`,role:'writes',form:'interval',measure:'resolution',value:'1..16',by:'target',at:'policy:evidence'}));}
  seed.push(canonical({scope:'signer/timeout',form:'interval',measure:'milliseconds',value:'5000..5000',role:'writes',at:'policy:evidence',by:'target'}),canonical({scope:'signer/response-bytes',form:'interval',measure:'bytes',value:'65536..65536',role:'writes',at:'policy:evidence',by:'target'}));
  writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');
  const boot=run(['land','--key','north','--key-file',devices[0].key]);assert.equal(boot.status,0,boot.stderr);
  const signed=[];
  for(const d of devices){const lot=join(temp,`${d.id}.proposal`);writeFileSync(lot,row(`sample/${d.id}`,'observed',`evidence-${d.id}`)+'\n');const sign=run(['sign',lot,'--key',d.id,'--key-file',d.key]);assert.equal(sign.status,0,sign.stderr);const text=sign.stdout.split('\n').filter(line=>parse(line).kind==='fact').join('\n')+'\n';signed.push(text);writeFileSync(lot,text);const land=run(['land',lot]);assert.equal(land.status,0,land.stderr);const again=run(['land',lot]);assert.equal(again.status,0,again.stderr);assert.match(again.stdout,/ONCE/);}
  const view=run(['fold','--as','lines']);assert.equal(view.status,0,view.stderr);
  for(const d of devices){const facts=rows(view.stdout).filter(f=>f.scope===`sample/${d.id}`);assert.equal(facts.length,1);const f=facts[0],sig=parseSignature(f.sig);assert.ok(sig);assert.equal(f.by,d.id);assert.equal(verify(null,Buffer.from(signedBytes(f)),d.pair.publicKey,Buffer.from(sig.raw,'base64')),true);}
  const uncovered=join(temp,'uncovered.proposal');writeFileSync(uncovered,row('sample/north','observed','uncovered')+'\n');const denied=run(['sign',uncovered,'--key','south','--key-file',devices[1].key]);assert.equal(denied.status,1);assert.match(denied.stderr,/REFUSE·signer south uncovered/);
  const tampered=join(temp,'altered.bound');writeFileSync(tampered,signed[1].replace('evidence-south','altered'));const bad=run(['land',tampered]);assert.equal(bad.status,1);assert.match(bad.stderr,/REFUSE·signed/);
  const f=rows(signed[0])[0],{sig,epoch,by,...selector}=f;
  const withdraw=join(temp,'withdraw.proposal');writeFileSync(withdraw,canonical({...selector,value:'withdraw',by:'target'})+'\n');const taken=run(['land',withdraw,'--key','north','--key-file',devices[0].key]);assert.equal(taken.status,0,taken.stderr);
  const after=run(['fold','--as','lines']);assert.equal(after.status,0,after.stderr);assert.equal(rows(after.stdout).filter(f=>f.scope==='sample/north'&&f.value!=='withdraw').length,0);assert.equal(rows(after.stdout).filter(f=>f.scope==='sample/south').length,1);assert.equal(rows(after.stdout).filter(f=>f.scope==='sample/alias').length,1);assert.deepEqual(devices[1].pair.publicKey.export({type:'spki',format:'der'}),devices[2].pair.publicKey.export({type:'spki',format:'der'}));
 }finally {if(process.env.BOUND_TEST_CAPTURE)writeFileSync(process.env.BOUND_TEST_CAPTURE+'.'+keyClass+'.json',JSON.stringify(captures,null,2)+'\n');rmSync(temp,{recursive:true,force:true});}
});
