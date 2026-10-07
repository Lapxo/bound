import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {canonical,parse} from '@lapxo/topos/wire';
import {standingBytes} from '@lapxo/topos/standing';
import {verifiedContent,withContentStore} from '../src/host/content-store.ts';

const hash=(bytes:Uint8Array|string)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const row=(scope:string,measure:string,value:string,extra:Record<string,string>={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',at:'policy:fixture',by:'target',...extra});
const reader=process.env.BOUND_TEST_READER??new URL('../src/cli/verb.ts',import.meta.url).pathname;
for(const [label,region,entry] of [['summary','summary','run.mjs'],['inventory','items','lib/serve.mjs']] as const) for(const provider of [false,true]) test(`a place selects its local ${label} standing${provider?' with separate declared provider inputs':''}`,()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-local-content-')),root=join(temp,'place');mkdirSync(root);
 const captures:unknown[]=[];
 function run(name:string,args:readonly string[],expected=0){
  const p=spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:15000});
  captures.push({name,args,status:p.status,stdout:p.stdout,stderr:p.stderr});
  assert.equal(p.status,expected,p.stdout+p.stderr);return p;
 }
 try{
  const pair=generateKeyPairSync('ed25519'),key=join(temp,'device.pem');writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  const bootstrap=[row('keys/device','class','authorize'),row('keys/device','signer','file'),row('keys/device','coverage','*'),row('keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('signer/timeout','milliseconds','1000..1000',{form:'interval'}),row('signer/response-bytes','bytes','65536..65536',{form:'interval'}),row('wire/digest-algorithms','id','sha256'),row('wire/signature-algorithms','id','ed25519:fixture'),row('wire/era','id','fixture'),row('name','id',label),row('keys/reader','class','read'),row('keys/folder','class','fold'),row('wire/fields','id','scope|role|form|measure|value|by|at|epoch|sig|shape|kind|restsOn|needs'),row('wire/required','id','scope|role|form|measure|value|by|at'),row('wire/roles','id','writes|reads|demands|render'),row('wire/forms','id','alphabet|interval'),row('wire/at-classes','id','policy|origin|place|receipt|witness'),row('wire/kinds','id','capsule'),row('wire/families','id','keys|signer|wire|name|uses|sources|dep|view|region|tree|read|write|leaf|reader|session|vector|configuration')];
  writeFileSync(join(root,'TARGET.bound'),bootstrap.join('\n')+'\n');run('bootstrap',['land','--key','device','--key-file',key]);
  const artifact=join(temp,'artifact');mkdirSync(join(artifact,'lib'),{recursive:true});
  const declaration=[row(`region/${region}`,'reads',provider?'name|configuration/**|region/input':'name|configuration/**',{role:'render'}),...(provider?[row('region/input','reads','src/*.txt',{role:'receipt'}),row('region/input','writes','measurement/**')]:[])];
  writeFileSync(join(artifact,'capsule.bound'),declaration.join('\n')+'\n');
  writeFileSync(join(artifact,entry),`export function render(asked){if(asked.lines.some(line=>line.value==='provider'))throw Error('provider input leaked into place');return [${JSON.stringify(label)},...asked.lines.map(line=>line.value),...(asked.provider?.lines??[]).map(line=>'INPUT '+line.value),...(asked.regions.input?.receipts??[]).filter(line=>line.scope==='measurement/extent').map(line=>'READ '+line.value)];} export function observe(bytes,place,region,files,asked){if(!asked?.provider?.lines.some(line=>line.value==='provider'))throw Error('reader provider context missing');return [{scope:'measurement/extent',role:'writes',measure:'bytes',bound:{kind:'interval',lo:bytes.length,hi:bytes.length}}];}\n`);
  const archive=join(root,'world.tgz');execFileSync('tar',['-czf',archive,'-C',artifact,'capsule.bound',entry]);
  const blob=hash(readFileSync(archive)),standing=standingBytes([row('audit/wire/region-measures','id','coordinates'),row('offers/render','digest',blob,{kind:'capsule',restsOn:blob}),...(provider?[row('audit/wire/provider-inputs','id','standing-projection@1'),row(`offers/render/inputs/${region}`,'reads','configuration/**',{role:'demands'}),row('offers/render/inputs/input','reads','configuration/**',{role:'demands'}),row('configuration/limit','id','provider')]:[])]),pin=hash(standing);
  writeFileSync(join(root,'world.standing'),standing);
  const proposal=join(temp,'selection.proposal');writeFileSync(proposal,[row('uses/world','digest',pin,{needs:'world.standing'}),row('dep/provider','digest',blob,{shape:entry,needs:'world.tgz'}),row('view/report','id',`${region}@1`,{role:'demands'}),...(provider?[row('wire/region-measures','id','coordinates'),row('wire/region-coordinate','id','coordinates'),row('region/input','coordinates','src/*.txt'),row('region/input','receipts','measurement/**')]:[]),row('configuration/limit','id','place')].join('\n')+'\n');
  if(provider){mkdirSync(join(root,'src'));writeFileSync(join(root,'src/input.txt'),'abc');}
  run('selection',['land',proposal,'--key','device','--key-file',key]);
  const cold=run('local named view',['fold','--as','report']);assert.match(cold.stdout,new RegExp(`^${label}$`,'m'));assert.doesNotMatch(cold.stdout,/FETCHED/);
  if(provider){assert.match(cold.stdout,/^INPUT provider$/m);assert.match(cold.stdout,/^READ 3\.\.3$/m);}else assert.doesNotMatch(cold.stdout,/^INPUT /m);
  assert.match(cold.stdout,/^place$/m);
  if(provider){const resigned=standingBytes(standing.trimEnd().split('\n').map(line=>{const parsed=parse(line);if(parsed.kind!=='fact')throw Error('fixture line');return canonical({...parsed.value.fields,by:'resigned',sig:'delivery',epoch:'99'});}));assert.equal(resigned,standing);assert.equal(hash(resigned),pin);writeFileSync(join(root,'world.standing'),resigned);}
  const warm=run('warm named view',['fold','--as','report']);assert.doesNotMatch(warm.stderr,/CAPSULE .* run/);assert.doesNotMatch(warm.stdout,/FETCHED/);
  // The local copy cannot be hidden by a previous cached answer or a remote retry.
  writeFileSync(join(root,'.bound','cas','blobs',pin.slice(7)),'corrupt standing');
  const corrupt=run('corrupt local standing',['fold','--as','report'],1);assert.match(corrupt.stderr,/content hash mismatch/);assert.doesNotMatch(corrupt.stdout,/FETCHED/);
 }finally{
  if(process.env.BOUND_TEST_CAPTURE){const at=process.env.BOUND_TEST_CAPTURE+'.'+label+(provider?'.inputs':'')+'.json';writeFileSync(at,JSON.stringify(captures,null,2)+'\n');}
  rmSync(temp,{recursive:true,force:true});
 }
});

test('content scopes preserve independent asynchronous places and reject local corruption before instrument fallback',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-content-scopes-')),one=join(temp,'one'),two=join(temp,'two');
 const bytes=Buffer.from('immutable shared bytes'),digest=hash(bytes),blob=(store:string)=>join(store,'cas','blobs',digest.slice(7));
 for(const store of [one,two]){mkdirSync(join(store,'cas','blobs'),{recursive:true});writeFileSync(blob(store),bytes);}
 try{
  const paths=await Promise.all([one,two].map(store=>withContentStore(store,async()=>{await Promise.resolve();return verifiedContent(digest).path;})));
  assert.deepEqual(paths,[blob(one),blob(two)]);
  writeFileSync(blob(one),'corrupt');assert.throws(()=>verifiedContent(digest,one,two),/content hash mismatch/);
  unlinkSync(blob(one));assert.equal(verifiedContent(digest,one,two).path,blob(two));
  unlinkSync(blob(two));assert.throws(()=>verifiedContent(digest,one,two),/not laid/);

 }finally{rmSync(temp,{recursive:true,force:true});}
});
