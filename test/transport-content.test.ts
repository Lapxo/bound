import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign,verify} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {canonical,signedBytes} from '@lapxo/topos/wire';
import {standingBytes} from '@lapxo/topos/standing';


const hash=(bytes:Uint8Array|string)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const row=(scope:string,measure:string,value:string,extra:Record<string,string>={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',at:'policy:fixture',by:'target',...extra});
const reader=process.env.BOUND_TEST_READER??new URL('../src/cli/verb.ts',import.meta.url).pathname;
for(const [label,region,entry,scheme] of [['summary','summary','run.mjs','alpha'],['inventory','items','lib/serve.mjs','beta']] as const) for(const provider of [false]) test(`a place selects its ${label} standing through declared ${scheme} transport${provider?' with separate declared provider inputs':''}`,()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-local-content-')),root=join(temp,'place');mkdirSync(root);
 const captures:unknown[]=[];const registry=join(temp,'host-registry.json');
 function run(name:string,args:readonly string[],expected=0){
  const p=spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:15000,env:{...process.env,BOUND_TRANSPORTS:registry}});
  captures.push({name,args,status:p.status,stdout:p.stdout,stderr:p.stderr});
  assert.equal(p.status,expected,p.stdout+p.stderr);return p;
 }
 try{
  const pair=generateKeyPairSync('ed25519'),key=join(temp,'device.pem');writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  const bootstrap=[row('keys/device','class','authorize'),row('keys/device','signer','file'),row('keys/device','coverage','*'),row('keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('signer/timeout','milliseconds','1000..1000',{form:'interval'}),row('signer/response-bytes','bytes','65536..65536',{form:'interval'}),row('wire/digest-algorithms','id','sha256'),row('wire/signature-algorithms','id','ed25519:fixture'),row('wire/era','id','fixture'),row('name','id',label),row('keys/reader','class','read'),row('keys/folder','class','fold'),row('wire/fields','id','scope|role|form|measure|value|by|at|epoch|sig|shape|kind|restsOn|needs'),row('wire/required','id','scope|role|form|measure|value|by|at'),row('wire/roles','id','writes|reads|demands|render'),row('wire/forms','id','alphabet|interval'),row('wire/at-classes','id','policy|origin|place|receipt|witness'),row('wire/kinds','id','capsule'),row('wire/families','id','keys|signer|wire|name|uses|sources|dep|view|region|tree|read|write|leaf|reader|session|vector|configuration|transport')];
  bootstrap.push(row('wire/transport','id','content-request/1'),row(`transport/${scheme}`,'id','fixture'),row('transport/timeout','milliseconds','0..2000',{form:'interval'}),row('transport/response-bytes','bytes','0..1048576',{form:'interval'}));
  writeFileSync(join(root,'TARGET.bound'),bootstrap.join('\n')+'\n');run('bootstrap',['land','--key','device','--key-file',key]);
  // Transport declarations obey the same coverage boundary as every admitted act.
  const limited=generateKeyPairSync('ed25519'),limitedKey=join(temp,'limited.pem');
  writeFileSync(limitedKey,limited.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  const keyProposal=join(temp,'limited-key.proposal');
  writeFileSync(keyProposal,[row('keys/limited','class','authorize'),row('keys/limited','signer','file'),row('keys/limited','coverage','configuration/**'),row('keys/limited','public-key',limited.publicKey.export({type:'spki',format:'der'}).toString('base64'))].join('\n')+'\n');
  run('admit limited key',['land',keyProposal,'--key','device','--key-file',key]);
  const unauthorizedProposal=join(temp,'unauthorized-transport.proposal');
  writeFileSync(unauthorizedProposal,row(`transport/${scheme}`,'id','unauthorized')+'\n');
  const beforeUnauthorized=readFileSync(join(root,'TARGET.bound'));
  const unauthorized=run('uncovered transport declaration',['land',unauthorizedProposal,'--key','limited','--key-file',limitedKey],1);
  assert.match(unauthorized.stderr,/REFUSE·signer limited uncovered transport/);
  const uncoveredFields={scope:`transport/${scheme}`,measure:'id',value:'unauthorized',form:'alphabet',role:'writes',at:'policy:fixture',by:'limited',epoch:'3'};
  const uncoveredSignature=sign(null,Buffer.from(signedBytes(uncoveredFields)),limited.privateKey).toString('base64');
  assert.equal(verify(null,Buffer.from(signedBytes(uncoveredFields)),limited.publicKey,Buffer.from(uncoveredSignature,'base64')),true);
  writeFileSync(unauthorizedProposal,canonical({...uncoveredFields,sig:`ed25519:fixture:${uncoveredSignature}`})+'\n');
  const admission=run('uncovered signed transport admission',['land',unauthorizedProposal],1);
  assert.match(admission.stderr,/REFUSE·(?:authority|signer .* uncovered transport)/);
  assert.deepEqual(readFileSync(join(root,'TARGET.bound')),beforeUnauthorized,'an uncovered transport binding cannot enter standing');
  const artifact=join(temp,'artifact');mkdirSync(join(artifact,'lib'),{recursive:true});
  writeFileSync(join(artifact,'capsule.bound'),row(`region/${region}`,'reads','name|configuration/**',{role:'render'})+'\n');
  writeFileSync(join(artifact,entry),`export function render(asked){if(asked.lines.some(line=>line.value==='provider'))throw Error('provider input leaked into place');return [${JSON.stringify(label)},...asked.lines.map(line=>line.value),...(asked.provider?.lines??[]).map(line=>'INPUT '+line.value)];}\n`);
  const archive=join(root,'world.tgz');execFileSync('tar',['-czf',archive,'-C',artifact,'capsule.bound',entry]);
  const blob=hash(readFileSync(archive)),standing=standingBytes([row('audit/wire/region-measures','id','coordinates'),row('offers/render','digest',blob,{kind:'capsule',restsOn:blob}),row('audit/wire/capsule-declaration','id','standing-regions@1'),row(`offers/render/declaration/region/${region}`,'reads','name|configuration/**',{role:'render'}),row('offers/unasked','digest',hash('unasked artifact bytes'),{kind:'capsule',restsOn:hash('unasked artifact bytes')}),row('offers/unasked/declaration/region/unasked','reads','name',{role:'render'}),...(provider?[row('audit/wire/provider-inputs','id','standing-projection@1'),row(`offers/render/inputs/${region}`,'reads','configuration/**',{role:'demands'}),row('configuration/limit','id','provider')]:[])]),pin=hash(standing);
  writeFileSync(join(temp,'standing'),standing);
  const adapter=join(temp,'transport.mjs'),calls=join(temp,'calls');
  writeFileSync(adapter,`import{readFileSync,appendFileSync}from'node:fs';const req=JSON.parse(readFileSync(0,'utf8'));if(req.protocol!=='content-request/1')process.exit(9);appendFileSync(${JSON.stringify(calls)},req.location+'\\n');process.stdout.write(readFileSync(req.location.endsWith('standing')?${JSON.stringify(join(temp,'standing'))}:${JSON.stringify(archive)}));`);
  writeFileSync(registry,JSON.stringify({fixture:{kind:'command',executable:process.execPath,args:[adapter]}}));
  const proposal=join(temp,'selection.proposal');writeFileSync(proposal,[row('uses/world','digest',pin),row('sources/world','id',`${scheme}:standing`),row('dep/provider','digest',blob,{shape:entry}),row('sources/provider','id',`${scheme}:artifact`),row('view/report','id',`${region}@1`,{role:'demands'}),row('configuration/limit','id','place')].join('\n')+'\n');
  run('selection',['land',proposal,'--key','device','--key-file',key]);
  assert.equal(existsSync(calls),false,'admission does not execute transport');
  run('help before materialization',['fold','--as','help']);assert.equal(existsSync(calls),false,'help does not materialize the world');
  run('check before materialization',['fold','--check'],1);assert.equal(existsSync(calls),false,'check verifies existing evidence without fetching');
  const cold=run('local named view',['fold','--as','report']);assert.match(cold.stdout,new RegExp(`^${label}$`,'m'));assert.match(cold.stdout,/FETCHED/);assert.equal(readFileSync(calls,'utf8').trim().split('\n').length,2);
  if(provider)assert.match(cold.stdout,/^INPUT provider$/m);else assert.doesNotMatch(cold.stdout,/^INPUT /m);
  assert.match(cold.stdout,/^place$/m);
  const beforeCalls=readFileSync(calls,'utf8');
  const warm=run('warm named view',['fold','--as','report']);assert.doesNotMatch(warm.stderr,/CAPSULE .* run/);assert.doesNotMatch(warm.stdout,/FETCHED/);assert.equal(readFileSync(calls,'utf8'),beforeCalls);
  // The local copy cannot be hidden by a previous cached answer or a remote retry.
  writeFileSync(join(root,'.bound','cas','blobs',pin.slice(7)),'corrupt standing');
  const corrupt=run('corrupt local standing',['fold','--as','report'],1);assert.match(corrupt.stderr,/content hash mismatch/);assert.doesNotMatch(corrupt.stdout,/FETCHED/);assert.equal(readFileSync(calls,'utf8'),beforeCalls);
 }finally{
  if(process.env.BOUND_TEST_CAPTURE){const at=process.env.BOUND_TEST_CAPTURE+'.'+label+(provider?'.inputs':'')+'.json';writeFileSync(at,JSON.stringify(captures,null,2)+'\n');}
  rmSync(temp,{recursive:true,force:true});
 }
});

