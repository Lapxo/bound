import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {installedConsumer,hash} from './support/installed-consumer.js';
test('installed physical line public producers refuse invalid evidence and declared resources',async()=>{
 const candidate=await installedConsumer(),api=await import(candidate.require.resolve('@lapxo/bound/physical-lines')),{canonical}=candidate.wire,{encodeReadingWitness}=candidate.contract;
 const root=mkdtempSync(join(tmpdir(),'bound-public-physical-')),d=hash('public producer fixture');mkdirSync(join(root,'src'));writeFileSync(join(root,'src','one.txt'),'line\n');
 const input={root,inventory:['src'],regions:[{scope:'generic/lines',selectors:['src/*.txt']}],policy:{entryBudget:16,byteBudget:'4096',rowBudget:'4096'},context:d,reader:d,implementation:d,run:'public-native'};
 const expect=(cause,run)=>assert.throws(run,error=>error instanceof Error&&(error.code==='physical-lines/'+cause||error.message.startsWith('REFUSE·physical-lines/'+cause)));
 try{
  expect('inventory-policy',()=>api.readPlacePhysicalLines({...input,policy:{...input.policy,entryBudget:-1}}));
  expect('inventory-boundary',()=>api.readPlacePhysicalLines({...input,inventory:[]}));
  assert.throws(()=>api.readPlacePhysicalLines({...input,root:join(root,'does-not-exist')}),error=>error?.code==='physical-lines/failed');
  expect('context',()=>api.readPlacePhysicalLines({...input,context:'unknown'}));
  expect('run',()=>api.readPlacePhysicalLines({...input,run:'invalid run'}));
  const ceiling=canonical({scope:'generic/lines',role:'reads',form:'interval',measure:'lines',value:'0..1',by:'target',at:'policy:public'});
  expect('region-declaration',()=>api.physicalLinesRegions([ceiling]));
  expect('region-selectors',()=>api.physicalLinesRegions([ceiling,canonical({scope:'region/generic',role:'writes',form:'alphabet',measure:'coordinates',value:'',by:'target',at:'policy:public'})]));
  const reading=api.readPlacePhysicalLines(input);assert.equal(reading.status,'read');
  const witness={class:'attest',...reading.bindings,authentication:'key-covered',key:'fixture',coverage:d,evidence:d},line=encodeReadingWitness(witness),authority={producers:[{authentication:'key-covered',key:'fixture',coverage:d}],verify:()=>false};
  expect('actual-reading-required',()=>api.authenticatePhysicalLinesWitness({...reading},line,authority));
  expect('witness-binding',()=>api.authenticatePhysicalLinesWitness(reading,encodeReadingWitness({...witness,result:hash('changed result')}),authority));
  expect('witness-authentication',()=>api.authenticatePhysicalLinesWitness(reading,line,authority));
  expect('witness-producer-not-admitted',()=>api.authenticatePhysicalLinesWitness(reading,line,{...authority,producers:[]}));
  expect('witness-authority-absent',()=>api.judgePhysicalLines({reading,standing:[ceiling],proposed:[],witness:line}));
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('compiled package self-reference resolves the declared public host without source fallback',async()=>{
 const self=await installedConsumer('');const entry=self.require.resolve('@lapxo/bound/host');assert.ok(entry.endsWith('/dist/host/index.js'));assert.equal(self.root,new URL('../',import.meta.url).pathname.replace(/\/$/,''));assert.equal(typeof self.host.readRootStandingInProcess,'function');
});
test('missing compiled dist refuses even when a source host exists',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-no-compiled-dist-'));try{
  mkdirSync(join(temp,'test/support'),{recursive:true});mkdirSync(join(temp,'src/host'),{recursive:true});const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));writeFileSync(join(temp,'package.json'),JSON.stringify(pkg));writeFileSync(join(temp,'src/host/index.ts'),'export const sourceFallback=true;\n');cpSync(new URL('./support/installed-consumer.js',import.meta.url),join(temp,'test/support/installed-consumer.js'));
  const copied=await import(pathToFileURL(join(temp,'test/support/installed-consumer.js')).href);await assert.rejects(copied.installedConsumer(''),error=>error?.code==='MODULE_NOT_FOUND'||error?.code==='ERR_MODULE_NOT_FOUND');
 }finally{rmSync(temp,{recursive:true,force:true})}
});
