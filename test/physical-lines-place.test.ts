import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,generateKeyPairSync,sign,verify} from 'node:crypto';
import {canonical} from '@lapxo/topos/wire';
import {encodeReadingWitness,decodeReadingWitness,readingWitnessStatementBytes,type ReadingWitness} from '@lapxo/topos/contract';
import {physicalLinesRegions,readPlacePhysicalLines,authenticatePhysicalLinesWitness,judgePhysicalLines,type PhysicalLinesReading,type PhysicalLinesWitnessAuthority} from '../src/host/physical-lines.ts';

const caseYes=JSON.parse(readFileSync(new URL('../samples/physical-lines/yes.json',import.meta.url),'utf8'));
const caseNo=JSON.parse(readFileSync(new URL('../samples/physical-lines/no.json',import.meta.url),'utf8'));
const sha=(bytes:string|Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const d=sha('fixture');
function fixture(label:string){
 const root=mkdtempSync(join(tmpdir(),label));mkdirSync(join(root,'src','core'),{recursive:true});mkdirSync(join(root,'src','ports'));
 writeFileSync(join(root,'src','core','one.ts'),caseYes.coreSource);
 writeFileSync(join(root,'src','core','empty.ts'),'');writeFileSync(join(root,'src','ports','two.ts'),caseYes.portsSource);
 return {root,read:(regions:readonly {scope:string;selectors:readonly string[]}[]=[{scope:'core/lines',selectors:['src/core/*.ts']},{scope:'ports/lines',selectors:['src/ports/*.ts']}])=>{
  const got=readPlacePhysicalLines({root,inventory:['src'],regions,policy:{entryBudget:100,byteBudget:'10000',rowBudget:'10000'},context:d,reader:d,implementation:d,run:'native-physical-lines'});
  assert.equal(got.status,'read',JSON.stringify(got));if(got.status!=='read')throw Error('fixture did not read');return got;
 },close:()=>rmSync(root,{recursive:true,force:true})};
}
const ceiling=(scope:string,value:string,at='policy')=>canonical({scope,role:'reads',form:'interval',measure:'lines',value,at,by:'fixture'});
function proof(reading:PhysicalLinesReading){
 const pair=generateKeyPairSync('ed25519');
 const initial:ReadingWitness={class:'attest',...reading.bindings,authentication:'key-covered',key:'fixture-key',coverage:d,evidence:d};
 const signature=sign(null,Buffer.from(readingWitnessStatementBytes(initial)),pair.privateKey);
 const witness={...initial,evidence:sha(signature)};
 const authority:PhysicalLinesWitnessAuthority={producers:[{authentication:'key-covered',key:witness.key,coverage:d}],verify:({statementBytes,witness})=>witness.evidence===sha(signature)&&verify(null,Buffer.from(statementBytes),pair.publicKey,signature)};
 return {line:encodeReadingWitness(witness),authority};
}
// Two actual, unrelated directories exercise the same public reading and native judges.
for(const place of caseYes.places as string[])test(place+' actual physical counts and native quartet',()=>{
 const f=fixture(place);try{
  const reading=f.read(),core=reading.reading.regions.find(row=>row.scope==='core/lines');
  assert.equal(core?.status,'measured');if(core?.status!=='measured')throw Error('no core reading');
  assert.deepEqual(core.value,{numerator:'3',denominator:'1'});assert.equal(core.members.length,2);
  assert.deepEqual(reading.perFile.regions.find(row=>row.scope==='src/core/empty.ts')?.value,{numerator:'0',denominator:'1'});
  assert.deepEqual(reading.perFile.regions.find(row=>row.scope==='src/ports/two.ts')?.value,{numerator:'3',denominator:'1'});
  const standing=[ceiling('core/lines',caseYes.within),ceiling('ports/lines','0..3')];
  assert.equal(judgePhysicalLines({reading,standing,proposed:[]}).status,'READY');
  assert.equal(judgePhysicalLines({reading,standing:[ceiling('core/lines',caseNo.over)],proposed:[]}).status,'BLOCK');
  const old=[ceiling('core/lines',caseNo.over),ceiling('ports/lines','0..3')],p=proof(reading),at=authenticatePhysicalLinesWitness(reading,p.line,p.authority);
  const proposed=[ceiling('core/lines','0..3',at)];
  const landed=judgePhysicalLines({reading,standing:old,proposed,witness:p.line,authority:p.authority});assert.equal(landed.status,'READY');assert.equal(landed.rejected.length,0);
  assert.equal(judgePhysicalLines({reading,standing:old,proposed}).status,'BLOCK');
  assert.throws(()=>authenticatePhysicalLinesWitness(reading,p.line,{...p.authority,verify:()=>false}),/witness-authentication/);
  assert.throws(()=>authenticatePhysicalLinesWitness(reading,p.line,{...p.authority,producers:[]}),/producer-not-admitted/);
  const altered=encodeReadingWitness({...decodeReadingWitness(p.line),result:sha(caseNo.changedWitnessResult)});
  assert.throws(()=>authenticatePhysicalLinesWitness(reading,altered,p.authority),/witness-binding\/result/);
  assert.throws(()=>authenticatePhysicalLinesWitness({...reading},p.line,p.authority),/actual-reading-required/);
 }finally{f.close()}
});
test('named stray, unmatched selector, partial selector and overlaps remain explicit',()=>{
 const f=fixture('native-lines-selection-');try{
  writeFileSync(join(f.root,'src','stray.txt'),'unassigned\n');
  const reading=f.read([{scope:'core/lines',selectors:['src/core/*.ts','src/core/missing.ts']},{scope:'whole/lines',selectors:['src/core/*.ts']},{scope:'absent/lines',selectors:['src/absent/*.ts']}]);
  assert.equal(reading.reading.valuation.disjointBySupport,false);
  assert.ok(reading.reading.valuation.overlaps.some(overlap=>overlap.atom==='src/core/one.ts'));
  assert.deepEqual(reading.stray,['src/ports/two.ts','src/stray.txt']);
  const verdict=judgePhysicalLines({reading,standing:[ceiling('core/lines','0..10'),ceiling('absent/lines','0..10')],proposed:[]});
  assert.equal(verdict.status,'UNMEASURED');assert.deepEqual(verdict.unmeasured,[{scope:'core/lines',cause:'selector-no-match',selectors:['src/core/missing.ts']},{scope:'absent/lines',cause:'selector-no-match',selectors:['src/absent/*.ts']}]);
 }finally{f.close()}
});
test('CI evidence must match the admitted producer policy before the proof port runs',()=>{
 const f=fixture('native-lines-ci-');try{
  const reading=f.read(),witness:ReadingWitness={class:'attest',...reading.bindings,authentication:'ci-run-unkeyed',repository:'https://ci.example/project',commit:'commit-1',workflow:d,attempt:'1',evidence:d};let calls=0;
  const wrong={authentication:'ci-run-unkeyed' as const,repository:witness.repository,commit:'different-commit',workflow:d,run:reading.bindings.run,attempt:'1'};
  const authority={producers:[wrong],verify:()=>{calls++;return true}};
  assert.throws(()=>authenticatePhysicalLinesWitness(reading,encodeReadingWitness(witness),authority),/producer-not-admitted/);assert.equal(calls,0);
  assert.throws(()=>authenticatePhysicalLinesWitness(reading,encodeReadingWitness(witness),{producers:[{...wrong,commit:witness.commit}],verify:()=>false}),/witness-authentication/);
 }finally{f.close()}
});
test('links, byte budget and invalid text cannot manufacture complete readings',()=>{
 const f=fixture('native-lines-limits-');try{
  symlinkSync(join(f.root,'src/core/one.ts'),join(f.root,'src/core/link.ts'));
  const input={root:f.root,inventory:['src'],regions:[{scope:'core/lines',selectors:['src/core/*.ts']}],policy:{entryBudget:100,byteBudget:'10000',rowBudget:'10000'},context:d,reader:d,implementation:d,run:'native'};
  const linked=readPlacePhysicalLines(input);assert.equal(linked.status,'unmeasured');if('unavailable' in linked)assert.ok(linked.unavailable.some(row=>row.name==='src/core/link.ts'));
  rmSync(join(f.root,'src/core/link.ts'));assert.equal(readPlacePhysicalLines({...input,policy:{...input.policy,byteBudget:'1'}}).status,'unmeasured');
  writeFileSync(join(f.root,'src/core/one.ts'),caseNo.invalidText);assert.throws(()=>readPlacePhysicalLines(input),/isolated-cr/);
 }finally{f.close()}
});

test('standing selectors are generic and per-file ceiling observations name their actual file',()=>{
 const f=fixture('native-lines-per-file-');try{
  const bound=canonical({scope:'core/lines',role:'reads',form:'interval',measure:'file-lines',value:'0..2',at:'policy',by:'fixture'});
  const standing=[bound,canonical({scope:'region/core',role:'writes',form:'alphabet',measure:'coordinates',value:'src/core/*.ts',by:'fixture',at:'policy'})];
  assert.deepEqual(physicalLinesRegions(standing),[{scope:'core/lines',selectors:['src/core/*.ts']}]);
  const verdict=judgePhysicalLines({reading:f.read(physicalLinesRegions(standing)),standing,proposed:[]});
  assert.equal(verdict.status,'BLOCK');assert.deepEqual(verdict.observations,[{scope:'core/lines',file:'src/core/empty.ts',value:'0'},{scope:'core/lines',file:'src/core/one.ts',value:'3'}]);
  assert.throws(()=>physicalLinesRegions([bound]),/region-declaration/);
 }finally{f.close()}
});
