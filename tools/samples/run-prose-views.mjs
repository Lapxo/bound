import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync,execFileSync} from 'node:child_process';
import {canonical} from '@lapxo/topos/wire';
import {standingBytes} from '@lapxo/topos/standing';

/** The sample offers exact admitted prose implementation bytes; an archive is not standing identity. */
export function runProseViews(reader,positive,negative,selectedPlace) {
 const temp=mkdtempSync(join(tmpdir(),'bound-prose-sample-')),events=[];
 const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
 const row=(scope,measure,value,extra={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',at:'policy:prose-sample',by:'target',...extra});
 try {
  assert.equal(digest(positive.providerSource),positive.providerDigest);
  const world=join(temp,'provider');mkdirSync(world);
  writeFileSync(join(world,'provider.mjs'),positive.providerSource);writeFileSync(join(world,'package.json'),'{"type":"module"}\n');
  writeFileSync(join(world,'capsule.bound'),row('region/text','reads','prose/**',{role:'render'})+'\n');
  const archive=join(temp,'provider.tgz');execFileSync('tar',['-czf',archive,'-C',world,'capsule.bound','provider.mjs','package.json']);
  const bytes=readFileSync(archive),artifact=digest(bytes),standing=standingBytes([row('region/world','reads','offers/**'),row('offers/prose','digest',artifact,{kind:'capsule',restsOn:artifact})]),pin=digest(standing);
  assert.equal(positive.places.length,2);
  if(selectedPlace!==undefined)assert.ok(positive.places.some(p=>p.name===selectedPlace));
  for(const place of positive.places.filter(p=>selectedPlace===undefined||p.name===selectedPlace)) {
   const root=join(temp,place.name);mkdirSync(root);
   const pair=generateKeyPairSync('ed25519'),key=join(temp,place.name+'.pem');writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
   const seed=positive.wire.map(([name,value])=>row('wire/'+name,'id',value));
   seed.push(row('keys/device','class','authorize'),row('keys/device','coverage','*'),row('keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/device','signer','file'),row('keys/device','resolution','1..16',{form:'interval'}),row('keys/reader','class','read'),row('keys/fold','class','fold'),row('signer/timeout','milliseconds','5000..5000',{form:'interval'}),row('signer/response-bytes','bytes','65536..65536',{form:'interval'}),row('reader/timeout','milliseconds','30000..30000',{form:'interval'}),row('reader/response-bytes','bytes','67108864..67108864',{form:'interval'}),row('reader/inputs','id','required'),row('reader/empty','id','refuse'),row('uses/prose','digest',pin),row('dep/prose','digest',artifact,{shape:'provider.mjs'}));
   for(const output of place.outputs)seed.push(row('prose/'+output.view,'text','lock',{shape:output.path,about:output.body}),row('view/'+output.view,'id','text@3',{role:'demands',shape:output.path,needs:output.path}));
   writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');const cas=join(root,'.bound/cas/blobs');mkdirSync(cas,{recursive:true});writeFileSync(join(cas,pin.split(':')[1]),standing);writeFileSync(join(cas,artifact.split(':')[1]),bytes);
   const run=args=>{const start=Date.now(),p=spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:30000});events.push({place:place.name,args:args.map(a=>a===key?'[ephemeral key]':a),status:p.status,stdout:p.stdout,stderr:p.stderr,runtimeMs:Date.now()-start});return p;};
   const boot=run(['land','--key','device','--key-file',key]);assert.equal(boot.status,0,boot.stderr);
   for(const output of place.outputs) {
    const first=run(['fold','--as',output.view]);assert.equal(first.status,0,first.stderr);
    assert.equal(readFileSync(join(root,output.path),'utf8'),output.body);
    const second=run(['fold','--as',output.view]);assert.equal(second.status,0,second.stderr);
    assert.equal(second.stdout,first.stdout);
    assert.equal(readFileSync(join(root,output.path),'utf8'),output.body);
   }
   const disagreement=join(temp,place.name+'-disagreement.proposal');
   writeFileSync(disagreement,[...negative.bodies.map((body,i)=>row('prose/disagreement-'+i,'text','lock',{shape:negative.path,about:body})),row('view/disagreement','id','text@3',{role:'demands',shape:negative.path,needs:negative.path})].join('\n')+'\n');
   const admitted=run(['land',disagreement,'--key','device','--key-file',key]);assert.equal(admitted.status,0,admitted.stderr);
   const refused=run(['fold','--as','disagreement']);assert.equal(refused.status,1,refused.stderr);assert.match(refused.stderr,/REFUSE·view conflicting prose/);
   for(const output of place.outputs)assert.equal(readFileSync(join(root,output.path),'utf8'),output.body);
  }
  return events;
 }finally{rmSync(temp,{recursive:true,force:true});}
}
