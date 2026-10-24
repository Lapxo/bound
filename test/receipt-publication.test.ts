import assert from 'node:assert/strict';
import{test}from'node:test';
import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';import{join,resolve}from'node:path';import{fileURLToPath}from'node:url';
import{canonical,parse}from'@lapxo/topos/wire';import{readingIdentityBytes}from'@lapxo/topos/contract';
import{sha256}from'../src/host/hash.ts';import{portableReadingReceipt}from'../src/host/reading-closures.ts';
import{projectReceiptEvidence,verifyPublicationHistory}from'../tools/compact-archive.ts';
const instrument=resolve(fileURLToPath(new URL('..',import.meta.url)));
const observation=(place:string,tag:string)=>{
 const closure=new TextDecoder().decode(readingIdentityBytes({instrument:sha256('instrument'),implementation:sha256('reader'),policy:sha256('policy'),inputs:[[place,sha256(tag)]],environment:[]})),input=sha256(closure),by='reader',claim=canonical({scope:place+'/count',role:'reads',form:'interval',measure:'count',value:'1..1',by,at:'place:'+input}),output=claim+'\n';
 return [canonical({scope:place,role:'writes',form:'alphabet',measure:'observed',value:input,by,at:'place:'+input}),claim,...portableReadingReceipt('receipts/readings/'+sha256(place).slice(7)+'/'+input.slice(7),by,closure,output,sha256)];
};
for(const place of['field-notes','water-level'])test('current receipt publication preserves authenticated history separately: '+place,async()=>{
 const base=mkdtempSync(join(tmpdir(),'receipt-publication-'));try{
  const source=join(base,'source'),stage=join(base,'stage');mkdirSync(source);mkdirSync(stage);mkdirSync(join(source,'.bound','ledger'),{recursive:true});
  const historyScope=place+'/old-plan';const standing=[canonical({scope:historyScope,role:'demands',form:'alphabet',measure:'status',value:'present',about:'Retire Acorn through the original declared proof',by:'target',at:'policy:history'}),canonical({scope:'publish/standing/history',role:'writes',form:'alphabet',measure:'id',value:historyScope,by:'target',at:'policy:history'}),canonical({scope:'wire/digest-algorithms',role:'writes',form:'alphabet',measure:'id',value:'sha256',by:'target',at:'policy:receipt'}),canonical({scope:'wire/receipt-fields',role:'writes',form:'alphabet',measure:'id',value:'scope|role|form|measure|value|by|at|shape|about',by:'target',at:'policy:receipt'})],lock=standing.join('\n')+'\n';writeFileSync(join(source,'TARGET.bound'),lock);writeFileSync(join(stage,'TARGET.bound'),lock);
  const current=observation(place,'current'),history=observation(place+'/Acorn','superseded-parser'),original=[...current,...history].join('\n')+'\n';writeFileSync(join(source,'receipts.bound'),original);
  const fold={root:source,store:join(source,'.bound'),standing,epoch:1,observed:current,paid:[],receiptHistory:history,materialization:{tree:[],worlds:[],own:standing}};
  const result=await projectReceiptEvidence(instrument,source,stage,base,fold,'https://holder.invalid/evidence/',100000);
  const bytes=readFileSync(join(base,result.file)),read=await verifyPublicationHistory(instrument,bytes,result.digest,100000);
  assert.equal(read.kind,'history');assert.equal(read.records.receipts,original);assert.equal(read.readings,2);assert.equal(read.records.target,lock);assert.equal(readFileSync(join(source,'receipts.bound'),'utf8'),original);
  const published=readFileSync(join(stage,'receipts.bound'),'utf8');assert.ok(published.includes(result.digest));assert.ok(!published.includes(history[2]!));assert.ok(!/acorn/i.test(published));assert.ok(/acorn/i.test(read.records.receipts));assert.ok(!/acorn/i.test(readFileSync(join(stage,'TARGET.bound'),'utf8')));assert.equal(readFileSync(join(source,'TARGET.bound'),'utf8'),lock);assert.ok(published.includes(current[1]!));assert.equal('authority'in read,false);
  const bad=Buffer.from(bytes);bad[bad.length>>1]^=1;await assert.rejects(verifyPublicationHistory(instrument,bad,result.digest,100000),/history identity/);
  const modified=JSON.parse(bytes.toString());modified.records.receipts=modified.records.receipts.split('\n').map((line:string)=>{const f=parse(line);return f.kind==='fact'&&f.value.fields.measure==='count'&&f.value.fields.about?canonical({...f.value.fields,about:f.value.fields.about.replace('1..1','2..2')}):line}).join('\n');modified.digests.receipts=sha256(modified.records.receipts);const forged=Buffer.from(JSON.stringify(modified));await assert.rejects(verifyPublicationHistory(instrument,forged,sha256(forged),100000),/history carrier/);
  const incomplete=JSON.parse(bytes.toString());incomplete.records.receipts=incomplete.records.receipts.split('\n').map((line:string)=>{const p=parse(line);if(p.kind!=='fact'||p.value.fields.measure!=='bytes')return line;const{about,...rest}=p.value.fields;return canonical(rest)}).join('\n');incomplete.digests.receipts=sha256(incomplete.records.receipts);const missing=Buffer.from(JSON.stringify(incomplete));
  await assert.rejects(verifyPublicationHistory(instrument,missing,sha256(missing),100000),/history carrier/);
  await assert.rejects(verifyPublicationHistory(instrument,undefined as unknown as Uint8Array,result.digest,100000),/bytes\/budget/);
  await assert.rejects(verifyPublicationHistory(instrument,bytes,result.digest,bytes.length-1),/budget/);
  await assert.rejects(projectReceiptEvidence(instrument,source,stage,base,fold,'https://holder.invalid/evidence/',1),/budget/);
  const badStanding=standing.map(line=>{const p=parse(line);return p.kind==='fact'&&p.value.fields.scope==='publish/standing/history'?canonical({...p.value.fields,value:'wire/digest-algorithms'}):line;});
  await assert.rejects(projectReceiptEvidence(instrument,source,stage,base,{...fold,standing:badStanding},'https://holder.invalid/evidence/',100000),/cannot omit/);
  const cap=canonical({scope:'budget/bytes',role:'reads',form:'interval',measure:'bytes',value:'0..1',by:'target',at:'policy:budget'}),withCap=standing.map(line=>{const p=parse(line);return p.kind==='fact'&&p.value.fields.scope==='publish/standing/history'?canonical({...p.value.fields,value:'budget/bytes'}):line;}).concat(cap);
  await assert.rejects(projectReceiptEvidence(instrument,source,stage,base,{...fold,standing:withCap},'https://holder.invalid/evidence/',100000),/cannot omit/);
  const needed=standing.concat(canonical({scope:'consumer/contract',role:'writes',form:'alphabet',measure:'id',value:'active',needs:historyScope,by:'target',at:'policy:consumer'}));
  await assert.rejects(projectReceiptEvidence(instrument,source,stage,base,{...fold,standing:needed},'https://holder.invalid/evidence/',100000),/cannot omit/);
  assert.equal(readFileSync(join(stage,'receipts.bound'),'utf8'),published);
 }finally{rmSync(base,{recursive:true,force:true});}
});
