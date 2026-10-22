import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical,parse,signedBytes,formatSignature} from '@lapxo/topos/wire';
import {nativeHostInstrument} from '@lapxo/bound/host';
import {sha256} from '../src/host/hash.ts';
import {withHostCall} from '../src/host/call-context.ts';
import {withContentStore} from '../src/host/content-store.ts';
import {underRootAuthority} from '../src/land/act.ts';
import {storeOf} from '../src/land/ledger.ts';
import {admissionHistoryAt,admissionAnchor} from '../src/fold/admission-history.ts';
import {projectAuthenticatedStanding} from '../src/host/standing-projection.ts';
import {epochOf,localActLines} from '../src/cli/owner.ts';
import {sourced} from '../src/land/vouched.ts';
import {admissionEvidenceResult} from '../src/cli/accept.ts';
import {prepareNativeAuthorityCard} from '../src/host/native/authority-card.ts';
const entry=process.env.BOUND_TEST_READER??new URL('../dist/cli/verb.js',import.meta.url).pathname,instrument=nativeHostInstrument(resolve(entry,'../../..'),entry),captures:unknown[]=[];
for(const name of ['dependency-register','dependency-index'])test('native dependency reading refuses withdrawal through the authority port: '+name,async()=>{
 const temp=mkdtempSync(join(tmpdir(),'authority-dependency-')),root=join(temp,name),pair=generateKeyPairSync('ed25519'),key=join(temp,'fixture.pem');mkdirSync(join(root,'src'),{recursive:true});writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 const row=(scope:string,measure:string,value:string,extra:Record<string,string>={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',by:'target',at:'policy:dependency',...extra});
 const run=(args:string[])=>spawnSync(process.execPath,[entry,...args],{cwd:root,encoding:'utf8',timeout:20000,maxBuffer:4194304});
 const ok=(args:string[])=>{const result=run(args);assert.equal(result.status,0,result.stderr+result.stdout);return result};
 try{
  const bytes='protected dependency '+name+'\n',token='in:input.txt:'+sha256(bytes).slice(7,19);
  writeFileSync(join(root,'src/input.txt'),bytes);
  // The real observer receives the source bytes and validates them exactly;
  // only that successful process execution emits its dependency memo.
  writeFileSync(join(root,'extent.mjs'),`export const observe=bytes=>{if(new TextDecoder().decode(bytes)!==${JSON.stringify(bytes)})throw Error('dependency input differs');return [{scope:'vector-memo/dependency/block',role:'reads',measure:'memo',bound:{kind:'enumerated',values:[${JSON.stringify(token)}]}}]};\n`);
  const seed=[row('keys/device','class','authorize'),row('keys/device','coverage','*'),row('keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/device','signer','file'),row('keys/reader','class','read'),row('keys/folder','class','fold'),row('signer/timeout','milliseconds','5000..5000',{form:'interval'}),row('signer/response-bytes','bytes','65536..65536',{form:'interval'}),row('wire/era','id','dependency'),row('wire/signature-algorithms','id','ed25519:dependency'),row('wire/digest-algorithms','id','sha256')];
  for(const [k,v] of Object.entries({families:'keys|signer|wire|tree|write|leaf|reader|read|fold|receipts|rendered|resolved|beat|view|region|sample|vector|cost|source|class|pipeline|host|store',fields:'scope|role|form|measure|value|by|at|needs|sig|epoch|shape|restsOn|condition|about|kind|view',required:'scope|role|form|measure|value|by|at',forms:'alphabet|interval',roles:'reads|writes|demands','at-classes':'origin|place|receipt|witness|policy',shapes:'run|input.txt|receipts.bound|src/readout.txt','receipt-fields':'scope|role|form|measure|value|by|at'}))seed.push(row('wire/'+k,'id',v));
  seed.push(row('reader/extent','reader','extent.mjs',{shape:'input.txt',needs:'src/'}),row('view/a-receipts','id','receipts@8|receipts@0|receipts@1',{role:'demands',shape:'receipts.bound',needs:'receipts.bound'}),row('view/z-readout','id','lines@8',{role:'demands',shape:'src/readout.txt',needs:'src/readout.txt'}));
  writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');ok(['land','--key','device','--key-file',key]);writeFileSync(join(root,'src/readout.txt'),'previous edition\n');ok(['fold','--as','a-receipts']);ok(['fold']);ok(['fold','--check']);
  const history=admissionHistoryAt(root,Number.MAX_SAFE_INTEGER),standing=projectAuthenticatedStanding(history,admissionAnchor(root)),draft=parse(row(withHostCall({instrumentName:instrument.name,runtime:instrument.runtime,output:()=>{}},()=>sourced(standing))+'/src/input.txt','digest','withdraw'));assert.equal(draft.kind,'fact');if(draft.kind!=='fact')throw Error('invalid dependency fixture');
  const fields={...draft.value.fields,by:'device',epoch:String(epochOf(localActLines(root))+1)},proposed=canonical({...fields,sig:formatSignature('ed25519:dependency',sign(null,Buffer.from(signedBytes(fields)),pair.privateKey).toString('base64'))});
  const before=readFileSync(join(root,'src/input.txt'));
  const direct=await withHostCall({instrumentName:instrument.name,runtime:instrument.runtime,output:()=>{}},()=>withContentStore(storeOf(root),()=>underRootAuthority(storeOf(root),'dependency removal evidence',()=>admissionEvidenceResult(root,[proposed],standing,100))));
  assert.equal(direct.kind,'refuse',JSON.stringify(direct));if(direct.kind==='refuse')assert.equal(direct.code,'admission/withdraw',JSON.stringify(direct));
  const card=await prepareNativeAuthorityCard({root,place:'.',key:'device',instrument,authorityEpoch:epochOf(history),clock:{name:'test-clock',unit:'ticks',now:100},horizon:{clock:'test-clock',unit:'ticks',from:90,through:110},limits:{bytes:262144,items:512},actions:[{kind:'admission',records:[proposed]}]});
  assert.equal(card.kind,'fact',JSON.stringify(card));if(card.kind==='fact'){assert.equal(card.value.judgments[0]!.decision,'deny');assert.ok(card.value.judgments[0]!.evidence.some(item=>typeof item==='object'&&item!==null&&'check' in item&&item.check==='admissionEvidence'&&'result' in item&&(item.result as {code?:string}).code==='admission/withdraw'));}
  assert.deepEqual(readFileSync(join(root,'src/input.txt')),before);ok(['fold','--check']);captures.push({place:name,reader:'extent.mjs',source:'src/input.txt',memo:token,direct,card,sourceUnchanged:true});
 }finally{rmSync(temp,{recursive:true,force:true});}
});
process.on('exit',()=>{if(process.env.BOUND_TEST_CAPTURE)writeFileSync(process.env.BOUND_TEST_CAPTURE+'.withdrawal.json',JSON.stringify(captures,null,2)+'\n')});
