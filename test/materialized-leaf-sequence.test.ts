import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync} from 'node:zlib';
import {canonical,publicationOf} from '@lapxo/topos/wire';
import {foldClaims} from '../src/fold/claims.ts';
import {standingBytes} from '@lapxo/topos/standing';
import {withHostCall} from '../src/host/call-context.ts';
import {withoutEffects} from '../src/host/read-only.ts';
import {withContentStore} from '../src/host/content-store.ts';
import {foldPlace} from '../src/cli/place.ts';
import {receiptRegion} from '../src/render/receipts.ts';
import {actingRootFixture} from './support/acting-root.ts';
import {catalogReadingInstrument} from './support/conformance-catalog-reading.ts';

const caseYes=JSON.parse(readFileSync(new URL('../samples/materialized-leaf-sequence/yes.json',import.meta.url),'utf8'));
const caseNo=JSON.parse(readFileSync(new URL('../samples/materialized-leaf-sequence/no.json',import.meta.url),'utf8'));
const hash=(bytes:string|Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const row=(scope:string,measure:string,value:string,extra:Record<string,string>={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',by:'target',at:'policy:leaf',...extra});
function member(name:string,text:string){const body=Buffer.from(text),h=Buffer.alloc(512);h.write(name);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(body.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h.write('0',156);h.write('ustar\0',257);h.write(h.reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);return Buffer.concat([h,body,Buffer.alloc(Math.ceil(body.length/512)*512-body.length)])}
for(const place of caseYes.places as string[])test('actual '+place+' version/prose -> receipts-only -> check preserves rendered-leaf guard',{timeout:90000},async()=>{
 const captures:unknown[]=[];
 const instrumentTemp=mkdtempSync(join(tmpdir(),'leaf-consumer-instrument-')),instrument=catalogReadingInstrument(instrumentTemp);
 mkdirSync(join(instrument.root,'docs'),{recursive:true});cpSync(new URL('../docs/contracts/',import.meta.url),join(instrument.root,'docs/contracts'),{recursive:true});
 const instrumentLock=join(instrument.root,'TARGET.bound');writeFileSync(instrumentLock,publicationOf(foldClaims(readFileSync(instrumentLock,'utf8').split('\n').filter(Boolean)).standing).join('\n')+'\n');
 const code=`export const render=asked=>{const value=name=>asked.lines.find(line=>line.scope===name)?.value;return asked.region==='prose'?['# '+value('sample/name'),'',value('sample/prose'),'','Version '+value('sample/version')]:[JSON.stringify({name:value('sample/name'),version:value('sample/version'),description:value('sample/prose')})]};\n`;
 const declarations=['prose','manifest'].map(name=>row('region/'+name,'reads','sample/**',{role:'render'})).join('\n')+'\n';
 const archive=gzipSync(Buffer.concat([member('capsule.bound',declarations),member('entry.js',code),member('package.json','{"type":"module"}\n'),Buffer.alloc(1024)])),blob=hash(archive);
 const standing=standingBytes([row('offers/leaves','digest',blob,{kind:'capsule',restsOn:blob})]),pin=hash(standing);
 const config=[row('wire/shapes','id','entry.js|README.md|manifest.json|receipts.bound'),row('wire/region-measures','id','coordinates'),row('wire/region-coordinate','id','coordinates'),row('wire/receipt-fields','id','scope|role|form|measure|value|by|at'),row('wire/reader-lifetime','id','bounded-process@2'),row('reader/timeout','milliseconds','0..5000',{form:'interval'}),row('reader/response-bytes','bytes','0..65536',{form:'interval'}),row('uses/leaves','digest',pin),row('dep/leaves','digest',blob,{shape:'entry.js'}),row('sample/name','id',place),row('sample/version','id',caseYes.originalVersion),row('sample/prose','text',caseYes.originalProsePrefix+place),row('view/receipts','id','receipts@8|receipts@0|receipts@1',{role:'demands',shape:'receipts.bound',needs:'receipts.bound'}),row('view/readme','id','prose@8',{role:'demands',shape:'README.md',needs:'README.md'}),row('view/manifest','id','manifest@8',{role:'demands',shape:'manifest.json',needs:'manifest.json'})];
 const fixture=actingRootFixture(place,captures,{places:[],entry:process.env.BOUND_TEST_READER??instrument.entry,families:'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region|uses|dep|offers',fields:'scope|role|form|measure|value|by|at|epoch|sig|about|shape|needs|kind|restsOn',extraBootstrapRows:config,runLimits:{timeoutMs:20000,maxBytes:1048576}});
 const ok=(args:string[])=>{const result=fixture.run(args);assert.equal(result.status,0,result.stderr+result.stdout);return result};
 const leaf=(name:string)=>join(fixture.root,name);
 const rejectClosed=(result:{status:number|null;stdout:string;stderr:string})=>{assert.notEqual(result.status,0,result.stderr+result.stdout);assert.doesNotMatch(result.stdout,/PASS\s+closed/);};
 try{
  const cas=join(fixture.root,'.bound/cas/blobs');mkdirSync(cas,{recursive:true});writeFileSync(join(cas,pin.slice(7)),standing);writeFileSync(join(cas,blob.slice(7)),archive);
  ok(['fold']);ok(['fold','--check']);const oldReadme=readFileSync(leaf('README.md'),'utf8'),oldManifest=readFileSync(leaf('manifest.json'),'utf8');
  assert.match(oldReadme,/Original prose/);assert.equal(JSON.parse(oldManifest).version,caseYes.originalVersion);
  const proposal=join(fixture.temp,'edition.bound');writeFileSync(proposal,[row('sample/version','id',caseYes.revisedVersion),row('sample/prose','text',caseYes.revisedProsePrefix+place)].join('\n')+'\n');
  ok(['land',proposal,'--key','owner','--key-file',fixture.key]);
  // Exact consumer trigger: no normal fold or fresh renderer between the admitted edit and receipt-only fold/check.
  const receiptsOnly=fixture.run(['fold','--as','receipts']);const checked=fixture.run(['fold','--check']);
  captures.push({sequence:'admitted-version-prose -> fold --as receipts -> fold --check',receiptsOnlyStatus:receiptsOnly.status,checkStatus:checked.status,readmeUnchanged:readFileSync(leaf('README.md'),'utf8')===oldReadme,manifestUnchanged:readFileSync(leaf('manifest.json'),'utf8')===oldManifest});
  assert.equal(readFileSync(leaf('README.md'),'utf8'),oldReadme);assert.equal(readFileSync(leaf('manifest.json'),'utf8'),oldManifest);rejectClosed(checked);
  const recovered=ok(['fold']);assert.match(recovered.stdout,/RENDERED README\.md/);assert.match(recovered.stdout,/RENDERED manifest\.json/);ok(['fold','--check']);
  assert.match(readFileSync(leaf('README.md'),'utf8'),/Revised prose/);assert.equal(JSON.parse(readFileSync(leaf('manifest.json'),'utf8')).version,caseYes.revisedVersion);
  // Focal negatives on both leaf kinds; the existing pass-receipt-order vector owns delivery subset/default scope coverage.
  for(const file of caseNo.outputNames as string[]){
   const current=readFileSync(leaf(file));
   for(const state of caseNo.states as string[]){
    if(state==='altered')writeFileSync(leaf(file),caseNo.alteredOutput);else rmSync(leaf(file));
    fixture.run(['fold','--as','receipts']);const bad=fixture.run(['fold','--check']);rejectClosed(bad);
    captures.push({file,state,checkStatus:bad.status,closed:bad.stdout.includes('PASS     closed')});
    writeFileSync(leaf(file),current);ok(['fold']);ok(['fold','--check']);
   }
  }
  // One focal binding check reuses the existing delivery guard without replaying its mutation matrix.
  const stage=join(fixture.temp,'selected-delivery');mkdirSync(stage);writeFileSync(join(stage,'README.md'),readFileSync(leaf('README.md')));
  const runtime={root:instrument.root,entry:instrument.entry,directory:join(instrument.root,'dist','cli'),extension:'.js',lock:readFileSync(instrumentLock,'utf8').split('\n').filter(Boolean)};
  await withHostCall({instrumentName:'bound',runtime},()=>withoutEffects(()=>withContentStore(join(fixture.root,'.bound'),()=>{
   const actual=foldPlace(fixture.root,instrument.entry),projected={...actual,root:stage};
   assert.equal(receiptRegion(projected,1).length,0,'default complete guard refuses absent manifest');
   const selected=receiptRegion(projected,1,['README.md']);assert.ok(selected.length,'explicit selected delivery does not require the unselected manifest');
   rmSync(join(stage,'README.md'));assert.equal(receiptRegion(projected,1,['README.md']).length,0,'a missing selected README cannot become an implicit subset');
   captures.push({binding:'materialized-output-selection',defaultMissingManifest:'refused',explicitReadmeOnly:'sealed',missingSelectedReadme:'refused',selection:['README.md'],sealRows:selected.length});
  })));
  assert.ok(existsSync(leaf('receipts.bound')));
  captures.push({binding:{world:pin,archive:blob,renderer:hash(code)},outputs:{readme:hash(readFileSync(leaf('README.md'))),manifest:hash(readFileSync(leaf('manifest.json'))),receipts:hash(readFileSync(leaf('receipts.bound')))}});
 }finally{if(process.env.BOUND_TEST_CAPTURE)writeFileSync(process.env.BOUND_TEST_CAPTURE+'.'+place+'.json',JSON.stringify(captures,null,2)+'\n');fixture.close();rmSync(instrumentTemp,{recursive:true,force:true})}
});
