import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {sign} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {hash} from './installed-consumer.mjs';
export async function nativePhysicalProof(candidate,f,policy,api){
 const {canonical,parse,signedBytes,formatSignature}=candidate.wire,{encodeReadingWitness,readingWitnessStatementBytes}=candidate.contract;
 const {canonicalJson}=await import(pathToFileURL(join(candidate.root,'dist/host/native/reading.js')).href);
 const {carriedFrom}=await import(pathToFileURL(join(candidate.root,'dist/fold/resolved.js')).href);
 const scope=policy.scope;
  const shipped=readFileSync(join(f.root,'receipts.bound'),'utf8').split('\n').filter(line=>line.startsWith('bound-lock/1')),receipts=carriedFrom(join(f.root,'.bound'),shipped);assert.ok(receipts);
  const fields=line=>{const p=parse(line);return p.kind==='fact'?p.value.fields:{}};
  const mapping=readFileSync(join(f.root,'TARGET.bound'),'utf8').split('\n').find(line=>fields(line).scope===f.mapping&&fields(line).value===f.port);assert.ok(mapping,'current signed mapping is present');
  const units=receipts.filter(line=>{const row=fields(line);if(!row.scope?.startsWith('receipts/readings/')||row.measure!=='bytes'||!row.about?.startsWith('["reading-context@1"'))return false;const context=JSON.parse(row.about);return new Map(context[4]).get(JSON.stringify(['context','native/reader-mapping']))===hash(mapping)});
  assert.equal(units.length,1,'a canonical retained native context for the CURRENT signed mapping is required');
  const context=fields(units[0]).value;
  const reading=api.readPlacePhysicalLines({root:f.root,inventory:policy.inventory,regions:[{scope,selectors:policy.selectors}],policy:{entryBudget:policy.entryBudget,byteBudget:policy.byteBudget,rowBudget:policy.rowBudget},context,reader:f.archiveDigest,implementation:f.archiveDigest,run:fields(units[0]).scope});assert.equal(reading.status,'read');
  const witness={class:'attest',...reading.bindings,authentication:'key-covered',key:'device',coverage:hash(JSON.stringify(['*'])),evidence:hash('pending-authorization')};
  const authorization={scope,role:'writes',form:'alphabet',measure:'reading-witness',value:hash(readingWitnessStatementBytes(witness)),restsOn:hash(canonicalJson(policy)+'\n'),at:'attest:'+reading.identity,by:'target'};
  const authorizationFile=join(f.temp,'reading-authorization.bound');writeFileSync(authorizationFile,canonical(authorization)+'\n');const signing=f.ok(['sign',authorizationFile,'--key','device','--key-file',f.key]);const signed=signing.stdout.split('\n').find(line=>line.startsWith('bound-lock/1')&&fields(line).scope===scope&&fields(line).measure==='reading-witness'&&fields(line).sig);assert.ok(signed,'actual selected file signing port returns the signed witness authorization');witness.evidence=hash(signed+'\n');
  const proof={profile:'bound-reading-witness-proof@1',witness:encodeReadingWitness(witness),authorization:signed,receipts},bytes=canonicalJson(proof)+'\n',id=hash(bytes);writeFileSync(join(f.cas,id.slice(7)),bytes);
 return {id,context,proof,reading};
}
