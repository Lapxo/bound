import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {installedConsumer} from './support/installed-consumer.js';
import {nativePhysicalPlace} from './support/native-physical-place.js';
import {nativePhysicalProof} from './support/physical-witness-proof.js';
import {readingWitnessAdmission} from '../src/host/native/reading-witness-admission.ts';
import * as api from '../src/host/physical-lines.ts';
import {withHostCall} from '../src/host/call-context.ts';
test('dedicated hook verifies actual native evidence before consuming transaction integration',async()=>{
 const candidate=await installedConsumer(),{canonical}=candidate.wire;
 const canonicalJson=value=>JSON.stringify(value,(key,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a<b?-1:a>b?1:0)):x);
 const scope='core/lines',policy={profile:'bound-reading-witness-policy@1',scope,place:'.',unit:'physical-lines/utf8-lf@1',inventory:['src'],selectors:['src/*.txt'],producer:'device',port:'port/physical',readerMapping:'reader/capsule/physical/port',byteBudget:'65536',rowBudget:'65536',entryBudget:32,evidenceBytes:4194304,receiptRows:512,authorityBytes:1048576,authorityLines:2048};
 const row=(scope,measure,value,extra={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',by:'target',at:'policy:consumer',...extra});
 const selected=[row('wire/reading-witness-admission','id','bound-reading-witness-admission@1'),row('physical/reading-policy','reading-witness','lock',{about:canonicalJson(policy)}),row('region/core','coordinates','src/*.txt'),row(scope,'lines','0..3',{role:'reads',form:'interval'})];
 const f=await nativePhysicalPlace(candidate,'hook-native-proof',selected);
 try{
  const {id,context,proof}=await nativePhysicalProof(candidate,f,policy,api);
  const runtime={root:f.instrument,entry:f.cli,directory:join(f.instrument,'dist/cli'),extension:'.js',lock:readFileSync(join(f.instrument,'TARGET.bound'),'utf8').split('\n').filter(Boolean)};
  const vocabulary=readFileSync(join(f.root,'TARGET.bound'),'utf8').split('\n').filter(line=>line.startsWith('bound-lock/1'));
  const withdrawal=row(scope,'lines','withdraw',{role:'reads',form:'interval',at:'policy:consumer'});
  const check=at=>withHostCall({instrumentName:'bound',runtime},()=>readingWitnessAdmission(f.root,[withdrawal,row(scope,'lines','0..4',{role:'reads',form:'interval',at})],vocabulary));
  const missing=check('policy:no-proof');assert.equal(missing.kind,'ask');
  const good=check('witness:'+id);f.captures.push({nativeProof:id,context,hookResult:good});assert.equal(good.kind,'allow',JSON.stringify(good));assert.ok(good.evidence.includes(id));
  const forged=check('witness:sha256:'+'0'.repeat(64));assert.equal(forged.kind,'refuse');
  writeFileSync(join(f.root,'src/input.txt'),'changed\n');const stale=check('witness:'+id);assert.equal(stale.kind,'refuse');
 }finally{if(process.env.BOUND_TEST_CAPTURE)writeFileSync(process.env.BOUND_TEST_CAPTURE+'.hook.json',JSON.stringify(f.captures,null,2)+'\n');f.close()}
});
