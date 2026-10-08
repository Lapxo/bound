import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync,execFileSync} from 'node:child_process';
import {canonical} from '@lapxo/topos/wire';
import {standingBytes} from '@lapxo/topos/standing';

/** Byte-fixed historical profile fixture, never a document parser in Bound. */
export function runHistoricalDocumentViews(reader,positive,negative,selectedPlace) {
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
  const build=positive.buildProvider;assert.equal(sha(build.providerSource),build.providerDigest);
  const buildWorld=join(temp,'build-provider');mkdirSync(buildWorld);writeFileSync(join(buildWorld,'index.cjs'),build.providerSource);writeFileSync(join(buildWorld,'package.json'),'{"type":"commonjs"}\n');
  writeFileSync(join(buildWorld,'capsule.bound'),build.regions.map(r=>row('region/'+r.name,'reads',r.reads,{role:'render'})).join('\n')+'\n');
  const buildArchive=join(temp,'build.tgz');execFileSync('tar',['-czf',buildArchive,'-C',buildWorld,'capsule.bound','index.cjs','package.json']);const buildBytes=readFileSync(buildArchive),buildArtifact=sha(buildBytes);
  const prose=positive.proseProvider;assert.equal(sha(prose.providerSource),prose.providerDigest);const proseWorld=join(temp,'prose-provider');mkdirSync(proseWorld);writeFileSync(join(proseWorld,'provider.mjs'),prose.providerSource);writeFileSync(join(proseWorld,'package.json'),'\x7b"type":"module"\x7d\n');writeFileSync(join(proseWorld,'capsule.bound'),row('region/text','reads','prose/**',{role:'render'})+'\n');const proseArchive=join(temp,'prose.tgz');execFileSync('tar',['-czf',proseArchive,'-C',proseWorld,'capsule.bound','provider.mjs','package.json']);const proseBytes=readFileSync(proseArchive),proseArtifact=sha(proseBytes);
  const standing=standingBytes([row('region/world','reads','offers/**'),row('offers/document','digest',artifact,{kind:'capsule',restsOn:artifact}),row('offers/build','digest',buildArtifact,{kind:'capsule',restsOn:buildArtifact}),row('offers/prose','digest',proseArtifact,{kind:'capsule',restsOn:proseArtifact})]),pin=sha(standing);
  for(const place of positive.places.filter(p=>selectedPlace===undefined||p.name===selectedPlace)) {
   const root=join(temp,place.name);mkdirSync(root);mkdirSync(join(root,'docs'));
   const pair=generateKeyPairSync('ed25519'),key=join(temp,place.name+'.pem');writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
   const seed=positive.wire.map(([n,v])=>row('wire/'+n,'id',v));
   seed.push(row('keys/device','class','authorize'),row('keys/device','coverage','*'),row('keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/device','signer','file'),row('keys/device','resolution','1..16',{form:'interval'}),row('keys/reader','class','read'),row('keys/fold','class','fold'),row('signer/timeout','milliseconds','5000..5000',{form:'interval'}),row('signer/response-bytes','bytes','65536..65536',{form:'interval'}),row('reader/timeout','milliseconds','30000..30000',{form:'interval'}),row('reader/response-bytes','bytes','67108864..67108864',{form:'interval'}),row('reader/inputs','id','required'),row('reader/empty','id','refuse'),row('uses/historical','digest',pin),row('dep/historical','digest',artifact,{shape:'index.mjs'}));
   seed.push(row('dep/build','digest',buildArtifact,{shape:'index.cjs'}),...Object.entries(place.buildOptions).map(([name,value])=>row('build/'+name,'id',value,{shape:'tsconfig.json'})),row('view/tsconfig','id','build',{role:'demands',shape:'tsconfig.json',needs:'tsconfig.json'}));
   seed.push(row('name','id',place.name),row('version','id',place.version),row('license','id','MIT'),row('lang','id','en'),row('form/page/statement','id','3'),row('form/template/cff/name','id','name'),row('prose/en/cff/name','text','lock',{about:'Cite {name}.'}),row('term/item','id',place.term,{about:place.meaning}),row('page/seq/heading','text','lock',{about:place.heading}),...place.steps.map((step,i)=>row('page/seq/step-'+i,'text','lock',{about:step})),row('view/citation-file','id','cff@3',{role:'demands',shape:'CITATION.cff',needs:'CITATION.cff'}),row('view/guide','id','seq@3',{role:'demands',shape:'docs/guide.md',needs:'docs/guide.md'}),row('view/reference','id','term@3|set@3|ref@3',{role:'demands',shape:'docs/reference.md',needs:'docs/reference.md'}));
   seed.push(row('form/prose/en/sentence','id','capital|period'),row('docs/tagline','text','lock',{about:place.tagline}),row('prose/en/idea/heading','text','lock',{about:place.ideaHeading}),row('prose/en/idea','text','lock',{about:place.idea}),row('view/explanation','id','idea|what-holds|refuses',{role:'demands',shape:'docs/why.md',needs:'docs/why.md'}),row('view/readme-historical','id','hero@3|commands@3|idea@3',{role:'demands',shape:'README.md',needs:'README.md'}));
   seed.push(row('dep/prose','digest',proseArtifact,{shape:'provider.mjs'}));for(const output of place.outputs)seed.push(row('prose/'+output.view,'text','lock',{shape:output.path,about:output.body}),row('view/'+output.view,'id','text@3',{role:'demands',shape:output.path,needs:output.path}));
   writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');const cas=join(root,'.bound/cas/blobs');mkdirSync(cas,{recursive:true});writeFileSync(join(cas,pin.split(':')[1]),standing);writeFileSync(join(cas,artifact.split(':')[1]),bytes);writeFileSync(join(cas,buildArtifact.split(':')[1]),buildBytes);writeFileSync(join(cas,proseArtifact.split(':')[1]),proseBytes);
   const run=args=>{const start=Date.now(),p=spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:20000});events.push({place:place.name,args:args.map(a=>a===key?'[ephemeral key]':a),status:p.status,stdout:p.stdout,stderr:p.stderr,runtimeMs:Date.now()-start});return p;};
   const boot=run(['land','--key','device','--key-file',key]);assert.equal(boot.status,0,boot.stderr);
   const first=run(['fold']);assert.equal(first.status,0,first.stderr);const before=new Map(['CITATION.cff','docs/guide.md','docs/reference.md','tsconfig.json','docs/why.md','README.md',...place.outputs.map(o=>o.path)].map(path=>[path,readFileSync(join(root,path),'utf8')]));const second=run(['fold']);assert.equal(second.status,0,second.stderr);assert.match(second.stdout,/9 renders · 9 same/);for(const [path,body]of before)assert.equal(readFileSync(join(root,path),'utf8'),body);
   const expected={'citation-file':`cff-version: 1.2.0\nmessage: "Cite ${place.name}."\ntype: software\ntitle: "${place.name}"\nversion: "${place.version}"\nlicense: "MIT"\n`,'guide':`## ${place.heading}\n\n${place.steps.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n`};
   for(const [view,path]of [['citation-file','CITATION.cff'],['guide','docs/guide.md'],['reference','docs/reference.md']]) {
    const a=run(['fold','--as',view]);assert.equal(a.status,0,a.stderr);const rendered=readFileSync(join(root,path),'utf8');
    if(expected[view]!==undefined)assert.equal(rendered,expected[view]);else {assert.ok(rendered.includes(`**${place.term}** — ${place.meaning}`));assert.match(rendered,/\| pin \| historical \|/);assert.match(rendered,/\[guide\]\(guide.md\)/);}
   }
   const buildExpected={compilerOptions:Object.fromEntries(Object.entries(place.buildOptions).filter(([n])=>n!=='include').map(([n,v])=>[n,v==='true'?true:v==='false'?false:v])),include:place.buildOptions.include.split('|')};
   const buildFirst=run(['fold','--as','tsconfig']);assert.equal(buildFirst.status,0,buildFirst.stderr);const buildText=readFileSync(join(root,'tsconfig.json'),'utf8');assert.deepEqual(JSON.parse(buildText),buildExpected);
   assert.equal(readFileSync(join(root,'tsconfig.json'),'utf8'),before.get('tsconfig.json'));
   const why=`## ${place.ideaHeading}\n\n${place.idea}\n`;assert.equal(readFileSync(join(root,'docs/why.md'),'utf8'),why);const readme=readFileSync(join(root,'README.md'),'utf8');assert.equal(readme.trim().split(/\n+/).join('\n'),`# ${place.name}\n${place.tagline}\n## ${place.ideaHeading}\n${place.idea}`);for(const [view,path]of [['explanation','docs/why.md'],['readme-historical','README.md']]){const got=run(['fold','--as',view]);assert.equal(got.status,0,got.stderr);assert.equal(readFileSync(join(root,path),'utf8'),before.get(path));}
   for(const output of place.outputs)assert.equal(readFileSync(join(root,output.path),'utf8'),output.body);
   const missing=join(temp,place.name+'-missing.proposal');writeFileSync(missing,row('view/'+negative.view,'id',negative.region,{role:'demands'})+'\n');const admitted=run(['land',missing,'--key','device','--key-file',key]);assert.equal(admitted.status,0,admitted.stderr);const refused=run(['fold','--as',negative.view]);assert.equal(refused.status,1,refused.stderr);assert.match(refused.stderr,/REFUSE·view/);assert.ok(refused.stderr.includes(negative.view));   const conflict=negative.conflict,disagreement=join(temp,place.name+'-disagreement.proposal');writeFileSync(disagreement,[...conflict.bodies.map((body,i)=>row('prose/disagreement-'+i,'text','lock',{shape:conflict.path,about:body})),row('view/disagreement','id','text@3',{role:'demands',shape:conflict.path,needs:conflict.path})].join('\n')+'\n');const conflictLand=run(['land',disagreement,'--key','device','--key-file',key]);assert.equal(conflictLand.status,0,conflictLand.stderr);const conflictFold=run(['fold','--as','disagreement']);assert.equal(conflictFold.status,1,conflictFold.stderr);assert.match(conflictFold.stderr,/REFUSE·view conflicting prose/);for(const [path,body]of before)assert.equal(readFileSync(join(root,path),'utf8'),body);

  }
  return events;
 } catch(error){const last=events.at(-1);if(last)process.stderr.write('SAMPLE failure '+JSON.stringify(last)+'\n');throw error;}finally{rmSync(temp,{recursive:true,force:true});}
}
