import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync,execFileSync} from 'node:child_process';
import {canonical} from '@lapxo/topos/wire';
import {standingBytes} from '@lapxo/topos/standing';

/** Byte-fixed historical profile fixture, never a document parser in Bound. */
export function runHistoricalPresentationViews(reader,positive,negative,selectedPlace) {
 const temp=mkdtempSync(join(tmpdir(),'bound-historical-')),events=[];
 const sha=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
 const row=(scope,measure,value,extra={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',at:'policy:historical-sample',by:'target',...extra});
 try {
  assert.equal(sha(positive.providerSource),positive.providerDigest);
  assert.equal(positive.places.length,2);
  if(selectedPlace!==undefined)assert.ok(positive.places.some(p=>p.name===selectedPlace));
  const world=join(temp,'provider');mkdirSync(world);writeFileSync(join(world,'index.mjs'),positive.providerSource);writeFileSync(join(world,'package.json'),'{"type":"module"}\n');
  writeFileSync(join(world,'capsule.bound'),positive.regions.map(r=>row('region/'+r.name,'reads',r.reads,{role:'render'})).join('\n')+'\n');
  const archive=join(temp,'profile.tgz');execFileSync('tar',['-czf',archive,'-C',world,'capsule.bound','index.mjs','package.json']);const bytes=readFileSync(archive),artifact=sha(bytes);
  const standing=standingBytes([row('region/world','reads','offers/**'),row('offers/document','digest',artifact,{kind:'capsule',restsOn:artifact})]),pin=sha(standing);
  for(const place of positive.places.filter(p=>selectedPlace===undefined||p.name===selectedPlace)) {
   const root=join(temp,place.name);mkdirSync(root);mkdirSync(join(root,'docs'));
   const pair=generateKeyPairSync('ed25519'),key=join(temp,place.name+'.pem');writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
   const seed=positive.wire.map(([n,v])=>row('wire/'+n,'id',v));
   seed.push(row('keys/device','class','authorize'),row('keys/device','coverage','*'),row('keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/device','signer','file'),row('keys/device','resolution','1..16',{form:'interval'}),row('keys/reader','class','read'),row('keys/fold','class','fold'),row('signer/timeout','milliseconds','5000..5000',{form:'interval'}),row('signer/response-bytes','bytes','65536..65536',{form:'interval'}),row('reader/timeout','milliseconds','30000..30000',{form:'interval'}),row('reader/response-bytes','bytes','67108864..67108864',{form:'interval'}),row('reader/inputs','id','required'),row('reader/empty','id','refuse'),row('uses/historical','digest',pin),row('dep/historical','digest',artifact,{shape:'index.mjs'}));
   seed.push(row('name','id',place.name),row('lang','id','en'),row('form/page/statement','id','3'),row('form/prose/en/sentence','id','capital|period'),row('docs/tagline','text','lock',{about:place.tagline}),row('prose/en/idea/heading','text','lock',{about:place.heading}),row('prose/en/idea','text','lock',{about:place.idea}),row('view/explanation','id','idea|what-holds|refuses',{role:'demands',shape:'docs/why.md',needs:'docs/why.md'}),row('view/readme-historical','id','hero@3|commands@3|idea@3',{role:'demands',shape:'README.md',needs:'README.md'}));
   writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');const cas=join(root,'.bound/cas/blobs');mkdirSync(cas,{recursive:true});writeFileSync(join(cas,pin.split(':')[1]),standing);writeFileSync(join(cas,artifact.split(':')[1]),bytes);
   const run=args=>{const start=Date.now(),p=spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:20000});events.push({place:place.name,args:args.map(a=>a===key?'[ephemeral key]':a),status:p.status,stdout:p.stdout,stderr:p.stderr,runtimeMs:Date.now()-start});return p;};
   const boot=run(['land','--key','device','--key-file',key]);assert.equal(boot.status,0,boot.stderr);
   const why=`## ${place.heading}\n\n${place.idea}\n`;
   const first=run(['fold']);assert.equal(first.status,0,first.stderr);const before=new Map(['docs/why.md','README.md'].map(path=>[path,readFileSync(join(root,path),'utf8')]));const second=run(['fold']);assert.equal(second.status,0,second.stderr);assert.match(second.stdout,/2 renders · 2 same/);for(const [path,body]of before)assert.equal(readFileSync(join(root,path),'utf8'),body);
   assert.equal(readFileSync(join(root,'docs/why.md'),'utf8'),why);
   const readme=readFileSync(join(root,'README.md'),'utf8');assert.equal(readme.trim().split(/\n+/).join('\n'),`# ${place.name}\n${place.tagline}\n## ${place.heading}\n${place.idea}`);
   for(const [view,path,body]of [['explanation','docs/why.md',why],['readme-historical','README.md',readme]]){const got=run(['fold','--as',view]);assert.equal(got.status,0,got.stderr);assert.equal(readFileSync(join(root,path),'utf8'),body);}
   const missing=join(temp,place.name+'-missing.proposal');writeFileSync(missing,row('view/'+negative.view,'id',negative.region,{role:'demands'})+'\n');const admitted=run(['land',missing,'--key','device','--key-file',key]);assert.equal(admitted.status,0,admitted.stderr);const refused=run(['fold','--as',negative.view]);assert.equal(refused.status,1,refused.stderr);assert.match(refused.stderr,/REFUSE·view/);assert.ok(refused.stderr.includes(negative.view));
  }
  return events;
 } finally {rmSync(temp,{recursive:true,force:true});}
}
