import assert from 'node:assert/strict';import{test}from'node:test';import{canonical,parse}from'@lapxo/topos/wire';import{readingIdentityBytes}from'@lapxo/topos/contract';import{sha256}from'../src/host/hash.ts';import{portableReadingReceipt,verifiedReadingReceipts}from'../src/host/reading-closures.ts';import{publicationLines,publicationReceipts}from'../src/render/receipts.ts';import type{PlaceFold}from'../src/cli/place.ts';
const observation=(place:string,tag:string)=>{
 const closure=new TextDecoder().decode(readingIdentityBytes({instrument:sha256('instrument'),implementation:sha256('reader'),policy:sha256('policy'),inputs:[[place,sha256(tag)]],environment:[]})),input=sha256(closure),by='reader',claim=canonical({scope:place+'/count',role:'reads',form:'interval',measure:'count',value:'1..1',by,at:'place:'+input}),output=claim+'\n';
 return [canonical({scope:place,role:'writes',form:'alphabet',measure:'observed',value:input,by,at:'place:'+input}),claim,...portableReadingReceipt('receipts/readings/'+sha256(place).slice(7)+'/'+input.slice(7),by,closure,output,sha256)];
};

for(const place of ['field-notes','water-level'])test('history remains verifiable data and omitted notices cannot erase obligations: '+place,()=>{
 const rows=observation(place,'current'),history=observation(place+'/superseded','old');
 assert.equal(verifiedReadingReceipts('/nonexistent',[...rows,...history],sha256,undefined,true),2);
 const forged=history.map(line=>{const p=parse(line);return p.kind==='fact'&&p.value.fields.measure==='count'&&p.value.fields.about?canonical({...p.value.fields,about:p.value.fields.about.replace('1..1','2..2')}):line});assert.equal(verifiedReadingReceipts('/nonexistent',forged,sha256,undefined,true),undefined);
 const missing=history.map(line=>{const p=parse(line);if(p.kind!=='fact'||p.value.fields.measure!=='bytes')return line;const{about,...rest}=p.value.fields;return canonical(rest)});assert.equal(verifiedReadingReceipts('/nonexistent',missing,sha256,undefined,true),undefined);
 const row=(scope:string,form:string,measure:string,value:string,extra={})=>canonical({scope,form,measure,value,role:'demands',by:'target',at:'policy:history',...extra});
 const note=row(place+'/old','alphabet','status','present'),selector=row('publish/standing/history','alphabet','id',place+'/old',{role:'writes'}),standing=[note,selector],fold={standing}as PlaceFold;
 assert.ok(!publicationLines(fold).includes(note));assert.ok(standing.includes(note));assert.equal('authority'in rows,false);
 assert.throws(()=>publicationLines({...fold,standing:[note,selector,row('consumer/contract','alphabet','id','active',{needs:place+'/old'})]}),/cannot omit/);
 const cap=row(place+'/old','interval','bytes','0..1');assert.throws(()=>publicationLines({...fold,standing:[cap,selector]}),/cannot omit/);
 assert.throws(()=>publicationLines({...fold,standing:[selector]}),/unknown historical/);
});

test('publication resource declarations are mandatory and bounded before any read',()=>{
 const row=(scope:string,value:string)=>canonical({scope,measure:'bytes',value,role:'writes',form:'interval',by:'target',at:'policy:resources'});
 for(const value of ['0..0','1..10','0..9007199254740992','0..NaN'])assert.throws(()=>publicationReceipts({standing:[row('publish/receipt-bytes',value)]}as PlaceFold),/selection|resource|canonical/);
 assert.throws(()=>publicationReceipts({standing:[]}as unknown as PlaceFold),/selection/);
});
