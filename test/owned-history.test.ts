import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {generateKeyPairSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonical,parse,publicationOf} from '@lapxo/topos/wire';
import {ownLockOf} from '../src/fold/signed.ts';
import {epochOf} from '../src/cli/owner.ts';
import {admittedIn, appliedIn, tellOwn} from '../src/fold/signed.ts';
import {landOwned} from '../src/land/owned.ts';
import {shardFile} from '../src/land/ledger.ts';

const reader=new URL('../src/cli/verb.ts',import.meta.url).pathname;
test('publishing an owned lock keeps authenticated delivery history and the next signing epoch in the private store',()=>{
 const base=mkdtempSync(join(tmpdir(),'bound-own-history-'));
 const root=join(base,'project');mkdirSync(root);
 try {
  const pair=generateKeyPairSync('ed25519');const key=join(base,'device.pem');
  writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}));
  const row=(scope:string,measure:string,value:string)=>canonical({scope,role:'writes',form:'alphabet',measure,value,by:'target',at:'policy:fixture'});
  const wire=readFileSync(new URL('../node_modules/@lapxo/topos/TARGET.bound',import.meta.url),'utf8').split('\n').filter(l=>/ scope=audit\/wire\//.test(l));
  writeFileSync(join(root,'TARGET.bound'),[...wire,row('keys/root','class','authorize'),row('keys/root','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/root','coverage','*'),row('wire/digest-algorithms','id','sha256'),row('wire/signature-algorithms','id','ed25519:fixture'),row('wire/era','id','fixture'),row('wire/families','id','region|reader|tree|write|leaf|view')].join('\n')+'\n');
  const run=(args:string[])=>spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:20000});
  let result=run(['land','--key-file',key]);assert.equal(result.status,0,result.stdout+result.stderr);
  mkdirSync(join(root,'child'));writeFileSync(join(root,'child','TARGET.bound'),row('name','id','child')+'\n');
  const proposal=join(base,'first.proposal');writeFileSync(proposal,row('own/first','id','present')+'\n');
  result=run(['sign','--place','child','--key','root','--key-file',key,proposal]);assert.equal(result.status,0,result.stdout+result.stderr);
  const first=result.stdout.split('\n').filter(l=>parse(l).kind==='fact');
  tellOwn('child',first);assert.ok(first.every(l=>admittedIn(root,'child',l)));tellOwn('child',[]);
  // Storage/publication regression, not a replacement for the product admission corpus.
  landOwned(root,'child',first);
  const history=shardFile(join(root,'.bound'),'root','child/TARGET.bound');
  const bytes=readFileSync(history,'utf8');assert.match(bytes,/sig=/);
  const firstEpoch=epochOf(appliedIn(root,'child'));assert.ok(firstEpoch>1);
  writeFileSync(join(root,'child','TARGET.bound'),publicationOf(ownLockOf(root,'child')).join('\n')+'\n');
  assert.equal(readFileSync(history,'utf8'),bytes,'publication must not edit delivery history');
  assert.equal(epochOf(appliedIn(root,'child')),firstEpoch,'public envelopes are not the clock');
  assert.equal(ownLockOf(root,'child').filter(l=>/ scope=own\/first /.test(l)).length,1,'published copy is not a second inscription');
  const next=join(base,'next.proposal');writeFileSync(next,row('own/next','id','present')+'\n');
  result=run(['sign','--place','child','--key','root','--key-file',key,next]);assert.equal(result.status,0,result.stdout+result.stderr);
  const signed=result.stdout.split('\n').map(parse).find(r=>r.kind==='fact');assert.ok(signed&&signed.kind==='fact');
  assert.equal(Number(signed.value.fields.epoch),firstEpoch+1);
 } finally {rmSync(base,{recursive:true,force:true});}
});
