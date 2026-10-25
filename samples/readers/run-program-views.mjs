import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync,execFileSync} from 'node:child_process';
import {canonical} from '@lapxo/topos/wire';
import {standingBytes} from '@lapxo/topos/standing';
import {moduleClosure} from './module-closure.mjs';

/** The selected SDK projects declared demands; this sample implements no program algebra. */
export function runProgramViews(reader,positive,negative,selectedPlace) {
 const temp=mkdtempSync(join(tmpdir(),'bound-program-sample-')),events=[];
 const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
 const row=(scope,measure,value,more={})=>canonical({scope,measure,value,role:'writes',form:'alphabet',by:'target',at:'policy:sample',...more});
 try {
  const sdk=new URL(positive.providerMember,new URL('./',import.meta.resolve('@lapxo/topos/package.json')));
  assert.equal(digest(readFileSync(sdk)),positive.providerDigest,'published provider member must match its named bytes');
  const world=join(temp,'provider');mkdirSync(world);
  const wrapper=join(world,'entry.mjs');writeFileSync(wrapper,`import {renderPrograms} from ${JSON.stringify(fileURLToPath(sdk))};export const render=asked=>renderPrograms(asked);`);
  const closure=moduleClosure(new URL('file://'+wrapper));
  for(const[d,b]of closure.blobs)writeFileSync(join(world,d.split(':')[1]),b);
  writeFileSync(join(world,'package.json'),'{"type":"module"}\n');
  writeFileSync(join(world,'capsule.bound'),['demand-status','demand-card'].map(n=>row('region/'+n,'reads','**|region/proofs',{role:'render'})).join('\n')+'\n');
  const archive=join(temp,'provider.tgz');execFileSync('tar',['-czf',archive,'-C',world,'capsule.bound','package.json',...[...closure.blobs.keys()].map(d=>d.split(':')[1])]);const bytes=readFileSync(archive),artifact=digest(bytes);
  const selectors={profile:'admitted-demands@1',selection:'tasks/selection',minimum:'tasks/minimum',evidence:'proofs',elapsed:'clock/elapsed',ceiling:'clock/ceiling'};
  const standing=standingBytes([row('region/world','reads','wire/**|offers/**'),row('wire/provider-inputs','id','standing-projection@1'),...Object.entries(selectors).map(([n,v])=>row('wire/programs/'+n,'id',v)),row('offers/programs','digest',artifact,{kind:'capsule',restsOn:artifact}),...['demand-status','demand-card'].map(n=>row('offers/programs/inputs/'+n,'reads','wire/programs/**',{role:'demands'}))]),pin=digest(standing);
  assert.equal(positive.places.length,2);
  if(selectedPlace!==undefined)assert.ok(positive.places.some(p=>p.name===selectedPlace));
  for(const place of positive.places.filter(p=>selectedPlace===undefined||p.name===selectedPlace)){
   const root=join(temp,place.name);mkdirSync(root);const pair=generateKeyPairSync('ed25519'),key=join(temp,place.name+'.pem');writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
   const [first,last]=place.steps;
   const seed=positive.wire.map(([n,v])=>row('wire/'+n,'id',v));
   seed.push(row('keys/device','class','authorize'),row('keys/device','coverage','*'),row('keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/device','signer','file'),row('keys/device','resolution','1..16',{form:'interval'}),row('keys/reader','class','read'),row('keys/fold','class','fold'),row('signer/timeout','milliseconds','5000..5000',{form:'interval'}),row('signer/response-bytes','bytes','65536..65536',{form:'interval'}),row('reader/timeout','milliseconds','30000..30000',{form:'interval'}),row('reader/response-bytes','bytes','67108864..67108864',{form:'interval'}),row('reader/inputs','id','required'),row('reader/empty','id','refuse'),row('uses/programs','digest',pin),row('dep/programs','digest',artifact,{shape:closure.digest.split(':')[1]}),row('view/programs','id','demand-status@8',{role:'demands'}),row('view/card','id','demand-card@8',{role:'demands'}),row('region/proofs','receipts','proof/**'),row('tasks/selection','id',`tasks/${first}|tasks/${last}`),row('tasks/minimum','id',`tasks/${first}|tasks/${last}`),row('tasks/'+first,'status','present',{role:'demands',needs:'proof/'+first}),row('tasks/'+last,'status','present',{role:'demands',needs:'proof/'+last,restsOn:'tasks/'+first}),row('clock/ceiling','days','0..14',{role:'demands',form:'interval'}));
   const lay=place=>{mkdirSync(join(place,'.bound/cas/blobs'),{recursive:true});writeFileSync(join(place,'.bound/cas/blobs',pin.split(':')[1]),standing);writeFileSync(join(place,'.bound/cas/blobs',artifact.split(':')[1]),bytes);};lay(root);
   writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');
   const run=(root,args)=>{const start=Date.now(),p=spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:20000});events.push({place:place.name,args:args.map(a=>a===key?'[ephemeral key]':a),status:p.status,stdout:p.stdout,stderr:p.stderr,runtimeMs:Date.now()-start});return p;};
   const boot=run(root,['land','--key','device','--key-file',key]);assert.equal(boot.status,0,boot.stderr);
   for(const view of ['programs','card']){
    const a=run(root,['fold','--as',view]),b=run(root,['fold','--as',view]);assert.equal(a.status,0,a.stderr);assert.equal(b.status,0,b.stderr);assert.equal(a.stdout,b.stdout);
    assert.match(a.stdout,/PROGRAM deadline=unread closed=false/);assert.ok(a.stdout.includes('DEMAND tasks/'+first+' unread'));assert.ok(a.stdout.includes('DEMAND tasks/'+last+' blocked'));assert.ok(a.stdout.includes('NEXT tasks/'+first));assert.ok(!a.stdout.includes('NEXT tasks/'+last));assert.doesNotMatch(a.stdout,/CELL |\bFREE\b/);
   }
   assert.equal(negative.cycle,true);
   const cyclic=join(temp,place.name+'-cycle');mkdirSync(cyclic);lay(cyclic);
   const cycle=seed.map(line=>line.includes('scope=tasks/'+first+' ')?canonical({scope:'tasks/'+first,measure:'status',value:'present',role:'demands',form:'alphabet',by:'target',at:'policy:sample',needs:'proof/'+first,restsOn:'tasks/'+last}):line);
   writeFileSync(join(cyclic,'TARGET.bound'),cycle.join('\n')+'\n');const cb=run(cyclic,['land','--key','device','--key-file',key]);assert.equal(cb.status,0,cb.stderr);
   for(const view of ['programs','card']){const bad=run(cyclic,['fold','--as',view]);assert.equal(bad.status,1,bad.stderr);assert.match(bad.stderr,/dependency cycle/);}
  }
  return events;
 } catch(error){const last=events.at(-1);if(last)process.stderr.write('SAMPLE failure '+JSON.stringify(last)+'\n');throw error;}finally{rmSync(temp,{recursive:true,force:true});}
}
