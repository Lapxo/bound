import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,statSync,utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {actIdentity,canonical,parse,signedBytes} from '@lapxo/topos/wire';
import {committedLocalActs,intactLocalAct,committedInventoryFingerprint,withCommittedLocalActObservation,localActResult,type LocalActBundle} from '../src/host/ports/local-act.ts';
import {verifiedLegacyActResult} from '../src/cli/act-result.ts';
import {storeOf,rootLedgerLines,ledgerWriters,ledgerLines,writerFile} from '../src/land/ledger.ts';
import {admissionHistoryAt} from '../src/fold/admission-history.ts';
import {fieldOf,isConfig,selfName} from '../src/fold/claims.ts';
import {actingRootFixture} from './support/acting-root.ts';
test('synchronous committed observation is coherent only within its invocation and never retains verifier verdicts',()=>{
 const temp=mkdtempSync(join(tmpdir(),'committed-observation-')),keys=generateKeyPairSync('ed25519');
 const signed=(fields:Record<string,string>)=>canonical({...fields,sig:'ed25519:'+sign(null,Buffer.from(signedBytes(fields)),keys.privateKey).toString('base64')});
 const record=signed({scope:'sample/value',role:'writes',form:'alphabet',measure:'id',value:'value',by:'owner',at:'place:own',epoch:'1'}),records=record+'\n';
 const identity=actIdentity([record],{scope:'receipts',context:'receipt:local-act',localEpoch:1,digest:bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex'),placements:[{place:'.',records:[record]}]});
 const receipt=signed({scope:'receipts',role:'writes',form:'alphabet',measure:'digest',value:identity,by:'folder',at:'receipt:local-act',epoch:'1'})+'\n';
 const stores=['one','other'].map(name=>join(temp,name)),directories=stores.map(store=>join(store,'ledger','acts','committed-'+encodeURIComponent(identity)));
 const restore=(index:number)=>{mkdirSync(directories[index]!,{recursive:true});writeFileSync(join(directories[index]!,'records.bound'),records);writeFileSync(join(directories[index]!,'receipt.bound'),receipt);writeFileSync(join(directories[index]!,'place-..bound'),records)};
 try{
  restore(0);restore(1);let verifications=0;
  const file=join(directories[0]!,'records.bound'),fixed=Math.floor(Date.now()/1000);utimesSync(file,fixed,fixed);const stamp=statSync(file);
  withCommittedLocalActObservation(stores[0]!,()=>{
   const rows=committedLocalActs(stores[0]!);assert.equal(Object.isFrozen(rows),true);assert.equal(Object.isFrozen(rows[0]!.bundle.placements![0]),true);
   assert.throws(()=>{(rows[0]!.bundle as {records:string}).records='mutation'},TypeError);
   assert.equal(localActResult(stores[0]!,identity,()=>{verifications++;return true})!.records,records);
   assert.throws(()=>localActResult(stores[0]!,identity,()=>{verifications++;return false}),/does not verify/);
   writeFileSync(file,records.replace('value=value','value=other'));utimesSync(file,stamp.atime,stamp.mtime);
   assert.equal(statSync(file).size,stamp.size);assert.equal(Math.floor(statSync(file).mtimeMs),Math.floor(stamp.mtimeMs));
   assert.equal(committedLocalActs(stores[0]!),rows,'same synchronous observation retains immutable input');
   withCommittedLocalActObservation(stores[1]!,()=>{assert.equal(committedLocalActs(stores[1]!)[0]!.bundle.records,records);assert.equal(committedLocalActs(stores[0]!),rows)});
   withCommittedLocalActObservation(stores[0]!,()=>assert.equal(committedLocalActs(stores[0]!),rows));
  });
  assert.equal(verifications,2);
  assert.throws(()=>withCommittedLocalActObservation(stores[0]!,()=>undefined),/REFUSE·act/,'next observation rereads even restored stamps');
  restore(0);assert.throws(()=>withCommittedLocalActObservation(stores[0]!,()=>{throw Error('body failure')}),/body failure/);
  assert.throws(()=>withCommittedLocalActObservation(stores[0]!,()=>Promise.resolve()),/must be synchronous/);
  writeFileSync(file,records.replace('value=value','value=other'));
  assert.throws(()=>committedLocalActs(stores[0]!),/REFUSE·act/,'failed and async callbacks do not leave a scope');
  restore(0);assert.equal(withCommittedLocalActObservation(stores[0]!,()=>localActResult(stores[0]!,identity,()=>true))!.records,records);
 }finally{rmSync(temp,{recursive:true,force:true})}
});
test('last integrity fingerprint rereads complete inventory and never retains returned bodies',()=>{
 const store=mkdtempSync(join(tmpdir(),'local-act-integrity-')),keys=generateKeyPairSync('ed25519');
 const signed=(f:Record<string,string>)=>canonical({...f,sig:'ed25519:'+sign(null,Buffer.from(signedBytes(f)),keys.privateKey).toString('base64')});
 const records=['one','two'].map(value=>signed({scope:'sample/item',role:'writes',form:'alphabet',measure:'id',value,by:'owner',at:'place:own',epoch:'1'}));
 const placements=[{place:'.',records}],digest=(bytes:Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
 const identity=actIdentity(records,{scope:'receipts',context:'receipt:local-act',localEpoch:1,digest,placements});
 const receipt=signed({scope:'receipts',role:'writes',form:'alphabet',measure:'digest',value:identity,by:'folder',at:'receipt:local-act',epoch:'1'})+'\n';
 const directory=join(store,'ledger/acts','committed-'+encodeURIComponent(identity));mkdirSync(directory,{recursive:true});
 const original={records:records.join('\n')+'\n',receipt,placement:records.join('\n')+'\n'};
 const restore=()=>{writeFileSync(join(directory,'records.bound'),original.records);writeFileSync(join(directory,'receipt.bound'),receipt);writeFileSync(join(directory,'place-..bound'),original.placement)};
 try{
  restore();assert.equal(committedLocalActs(store).length,1);
  const first=committedLocalActs(store);first[0]!.bundle.records='not retained';assert.equal(committedLocalActs(store)[0]!.bundle.records,original.records);
  for(const [file,bytes]of [['records.bound',original.records.replace('value=one','value=changed')],['receipt.bound',receipt.replace(identity,'sha256:'+'0'.repeat(64))],['place-..bound',[...records].reverse().join('\n')+'\n']]as const){writeFileSync(join(directory,file),bytes);assert.throws(()=>committedLocalActs(store),/REFUSE·act/ );restore();assert.equal(committedLocalActs(store).length,1)}
  rmSync(join(directory,'receipt.bound'));assert.throws(()=>committedLocalActs(store),/unreadable/);restore();assert.equal(committedLocalActs(store).length,1);
  const foreign=join(store,'ledger/acts','committed-'+encodeURIComponent('sha256:'+'f'.repeat(64)));mkdirSync(foreign);for(const file of ['records.bound','receipt.bound','place-..bound'])writeFileSync(join(foreign,file),readFileSync(join(directory,file)));assert.throws(()=>committedLocalActs(store),/REFUSE·act/ );rmSync(foreign,{recursive:true});assert.equal(committedLocalActs(store).length,1);
  // Placement coordinate ARRAY order is normalized by the existing SDK, while
  // records INSIDE each placement remain ordered. Host must not invent a law.
  const pair=[{place:'catalog/TARGET.bound',records:[records[0]!]},{place:'inventory/TARGET.bound',records:[records[1]!]}],pairId=actIdentity(records,{scope:'receipts',context:'receipt:local-act',localEpoch:1,digest,placements:pair});
  const pairReceipt=signed({scope:'receipts',role:'writes',form:'alphabet',measure:'digest',value:pairId,by:'folder',at:'receipt:local-act',epoch:'1'})+'\n';
  const bundle:LocalActBundle={records:original.records,receipt:pairReceipt,placements:pair.map(p=>({place:p.place,records:p.records.join('\n')+'\n'}))};assert.equal(intactLocalAct(pairId,bundle),true);assert.equal(intactLocalAct(pairId,{...bundle,placements:[...bundle.placements!].reverse()}),true);
 }finally{rmSync(store,{recursive:true,force:true})}
});

test('streaming inventory key preserves tuple boundaries, UTF8 bytes and ordered placements',()=>{
 const key=(identity:string,records:string,receipt:string,placements?:LocalActBundle['placements'])=>committedInventoryFingerprint([{identity,bundle:{records,receipt,...(placements===undefined?{}:{placements})}}]);
 assert.notEqual(key('a','b:c','d'),key('a:b','c','d'));
 assert.notEqual(key('a','\0é🙂:12','d'),key('a','\0é🙂','12:d'));
 assert.notEqual(key('a','é','d'),key('a','e\u0301','d'));
 assert.notEqual(key('a','x','d'),key('a','x','d',[]));
 const places=[{place:'a:1',records:'r\0é'},{place:'b',records:'s🙂'}];
 assert.notEqual(key('a','x','d',places),key('a','x','d',[...places].reverse()));
 assert.notEqual(key('a','x','d',places),key('a','x','d',[{place:'a',records:'1:r\0é'},places[1]!]));
 assert.notEqual(key('a','first\nsecond\n','d',places),key('a','second\nfirst\n','d',places));
 assert.equal(key('a','x','d',places),key('a','x','d',places.map(p=>({...p}))));
 const previous=(rows:readonly {identity:string;bundle:LocalActBundle}[])=>{
  const hash=createHash('sha256'),text=(value:string)=>{const bytes=Buffer.from(value,'utf8');hash.update(String(bytes.byteLength)+':');hash.update(bytes)};
  text('committed-integrity-inventory');text(String(rows.length));
  for(const{identity,bundle}of rows){text(identity);text(bundle.records);text(bundle.receipt);if(bundle.placements===undefined){text('absent');continue}text('present');text(String(bundle.placements.length));for(const placement of bundle.placements){text(placement.place);text(placement.records)}}
  return hash.digest('hex');
 };
 for(const rows of [[],[{identity:'é🙂\ud800',bundle:{records:'\0first\nsecond\udfff',receipt:'é\u0301:12',placements:[]}}],[{identity:'one',bundle:{records:'a',receipt:'b'}},{identity:'two',bundle:{records:'\ud800\udfff\ud800',receipt:'r',placements:places}}]]as readonly (readonly {identity:string;bundle:LocalActBundle}[])[])assert.equal(committedInventoryFingerprint(rows),previous(rows));
});

test('historical proof rereads its anchor and history and never shares returned results',()=>{
 const fixture=actingRootFixture('fresh-historical-proof');
 try{
  const proposal=join(fixture.temp,'historical-proof.bound');
  writeFileSync(proposal,canonical({scope:'sample/proof',role:'writes',form:'alphabet',measure:'id',value:'kept',by:'target',at:'witness:fresh-historical-proof'})+'\n');
  const landed=fixture.run(['land',proposal,'--key','owner','--key-file',fixture.key]);
  assert.equal(landed.status,0,landed.stdout+landed.stderr);
  const identity=/^ACT (\S+)/m.exec(landed.stdout)?.[1];assert.ok(identity,landed.stdout);
  const first=verifiedLegacyActResult(fixture.root,identity),expected=[...first.records],store=storeOf(fixture.root);
  (first.result.records as string[]).push('caller mutation');
  (first.result as {identity:string}).identity='caller mutation';
  (first.records as string[]).push('another caller mutation');
  const second=verifiedLegacyActResult(fixture.root,identity);
  assert.equal(second.result.identity,identity);assert.deepEqual(second.result.records,expected);assert.deepEqual(second.records,expected);
  const anchorFile=join(store,selfName()+'.keys'),anchorBytes=readFileSync(anchorFile,'utf8'),anchors=JSON.parse(anchorBytes) as Record<string,{publicKey:string}>;
  Object.values(anchors)[0]!.publicKey=fixture.lane.publicKey.export({format:'der',type:'spki'}).toString('base64');
  writeFileSync(anchorFile,JSON.stringify(anchors));
  assert.throws(()=>verifiedLegacyActResult(fixture.root,identity),/REFUSE/);
  writeFileSync(anchorFile,anchorBytes);assert.deepEqual(verifiedLegacyActResult(fixture.root,identity).records,expected);
  const journal=writerFile(store,'owner'),journalBytes=readFileSync(journal,'utf8');
  const context=journalBytes.split('\n').find(line=>fieldOf(line,'scope')==='wire/act-result-context');assert.ok(context);
  const parsed=parse(context);assert.equal(parsed.kind,'fact');if(parsed.kind!=='fact')throw Error('fixture context not a claim');
  const fields={...parsed.value.fields,value:'receipt:changed-historical-context'},signature=fields.sig!;
  const changed=canonical({...fields,sig:signature.slice(0,signature.lastIndexOf(':')+1)+sign(null,Buffer.from(signedBytes(fields)),fixture.owner.privateKey).toString('base64')});
  writeFileSync(journal,journalBytes.replace(context,changed));
  assert.throws(()=>verifiedLegacyActResult(fixture.root,identity),/REFUSE/);
  writeFileSync(journal,journalBytes);assert.deepEqual(verifiedLegacyActResult(fixture.root,identity).result.records,expected);
  // Warm the ordinary append-reader cache, then preserve both stamp inputs.
  // Historical authority must read the changed bytes despite that cache hit.
  const fixedSeconds=Math.floor(Date.now()/1000);utimesSync(journal,fixedSeconds,fixedSeconds);
  assert.ok(ledgerLines(store,'owner').includes(context));
  const stamp=statSync(journal),sameSizeFields={...parsed.value.fields,value:'receipt:other-act'};
  const sameSize=canonical({...sameSizeFields,sig:signature.slice(0,signature.lastIndexOf(':')+1)+sign(null,Buffer.from(signedBytes(sameSizeFields)),fixture.owner.privateKey).toString('base64')});
  assert.equal(Buffer.byteLength(sameSize),Buffer.byteLength(context));
  writeFileSync(journal,journalBytes.replace(context,sameSize));utimesSync(journal,stamp.atime,stamp.mtime);
  const preserved=statSync(journal);assert.equal(preserved.size,stamp.size);assert.equal(Math.floor(preserved.mtimeMs),Math.floor(stamp.mtimeMs));
  assert.ok(ledgerLines(store,'owner').includes(context),'ordinary append-reader stamp cache is unchanged');
  assert.throws(()=>verifiedLegacyActResult(fixture.root,identity),/REFUSE/);
  writeFileSync(journal,journalBytes);utimesSync(journal,stamp.atime,stamp.mtime);
  assert.deepEqual(verifiedLegacyActResult(fixture.root,identity).result.records,expected);
 }finally{fixture.close()}
});

test('warm committed integrity never substitutes for original signature admission',()=>{
 const fixture=actingRootFixture('warm-original-signature');
 try{
  const proposal=join(fixture.temp,'signed-original.bound');
  writeFileSync(proposal,canonical({scope:'sample/integrity',role:'writes',form:'alphabet',measure:'id',value:'original',by:'target',at:'witness:warm-original-signature'})+'\n');
  const landed=fixture.run(['land',proposal,'--key','owner','--key-file',fixture.key]);
  assert.equal(landed.status,0,landed.stdout+landed.stderr);
  const identity=/^ACT (\S+)/m.exec(landed.stdout)?.[1];assert.ok(identity,landed.stdout);
  const store=storeOf(fixture.root),prior=verifiedLegacyActResult(fixture.root,identity);
  const directory=join(store,'ledger/acts','committed-'+encodeURIComponent(identity));
  assert.equal(prior.records.length,1);
  const trace=canonical({scope:'sample/trace',role:'writes',form:'alphabet',measure:'id',value:'legacy-only',by:'audit',at:'place:own'});
  writeFileSync(join(store,'ledger','audit.bound'),trace+'\n'+trace+'\n');
  const legacyRead=()=>ledgerWriters(store).flatMap(writer=>ledgerLines(store,writer));
  // Compare the old public readers, including a legacy-only writer with repeats,
  // with a single-inventory read over mixed historical and committed originals.
  assert.deepEqual(rootLedgerLines(store),legacyRead());
  assert.equal(rootLedgerLines(store).filter(line=>line===trace).length,2);
  for(const epoch of [1,prior.epoch,Number.MAX_SAFE_INTEGER])assert.deepEqual(admissionHistoryAt(fixture.root,epoch),
   [...new Set(legacyRead())].filter(line=>fieldOf(line,'sig')!==''&&(!isConfig(line)||Number(fieldOf(line,'epoch'))<=epoch)));
  assert.equal(prior.bundle.placements?.length,1);
  assert.equal(prior.bundle.placements![0]!.place,'.');
  const original=prior.records[0]!,parsed=parse(original);assert.equal(parsed.kind,'fact');
  if(parsed.kind!=='fact')throw Error('fixture original is not a claim');
  const signature=parsed.value.fields.sig!;
  const split=signature.lastIndexOf(':')+1;
  const corrupted=canonical({...parsed.value.fields,sig:signature.slice(0,split)+(signature[split]==='A'?'B':'A')+signature.slice(split+1)});
  assert.notEqual(corrupted,original);
  const corruptedFields=parse(corrupted);assert.equal(corruptedFields.kind,'fact');
  if(corruptedFields.kind!=='fact')throw Error('corrupted signature changed the claim grammar');
  assert.equal(signedBytes(corruptedFields.value.fields),signedBytes(parsed.value.fields));
  const changed={...prior.bundle,records:corrupted+'\n',placements:[{place:'.',records:corrupted+'\n'}]};
  // The act identifies ordered payloads, excluding sig. A valid integrity seal
  // therefore does not establish that the original was signed by its authority.
  assert.equal(intactLocalAct(identity,changed),true);
  committedLocalActs(store);committedLocalActs(store);
  writeFileSync(join(directory,'records.bound'),changed.records);
  writeFileSync(join(directory,'place-..bound'),changed.placements[0]!.records);
  assert.equal(committedLocalActs(store).find(row=>row.identity===identity)!.bundle.records,changed.records);
  assert.equal(committedLocalActs(store).find(row=>row.identity===identity)!.bundle.records,changed.records);
  assert.deepEqual(rootLedgerLines(store),legacyRead());
  assert.throws(()=>verifiedLegacyActResult(fixture.root,identity),/REFUSE·act record not admitted/);
  writeFileSync(join(directory,'records.bound'),prior.bundle.records);
  writeFileSync(join(directory,'place-..bound'),prior.bundle.placements![0]!.records);
  assert.deepEqual(verifiedLegacyActResult(fixture.root,identity).records,prior.records);
 }finally{fixture.close()}
});
