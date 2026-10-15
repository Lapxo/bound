import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,statSync,utimesSync} from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
import {canonical,signedBytes,formatSignature} from '@lapxo/topos/wire';
import {authenticatedRootStanding} from '../src/host/admitted-place.ts';
import {admissionHistoryAt,admissionAnchor} from '../src/fold/admission-history.ts';
import {authorityFor} from '../src/fold/signers.ts';
import {eraOf} from '../src/fold/digests.ts';
import {fieldOf,foldClaims,isConfig,selfName} from '../src/fold/claims.ts';
import {ledgerLines,storeOf,writerFile} from '../src/land/ledger.ts';
import {actingRootFixture} from './support/acting-root.ts';
import {join} from 'node:path';

test('one fresh Root inventory preserves historical grant cutoffs and ignores restored stamps',()=>{
 const fixture=actingRootFixture('historical-prefix'),later=generateKeyPairSync('ed25519');
 try{
  const store=storeOf(fixture.root),journal=writerFile(store,'owner'),original=readFileSync(journal,'utf8');
  const row=(scope:string,measure:string,value:string,epoch:string,by='owner',key=fixture.owner.privateKey,form='alphabet')=>{
   const fields={scope,measure,value,epoch,by,form,role:'writes',at:'policy:fixture'};
   return canonical({...fields,sig:formatSignature('ed25519:sample',sign(null,Buffer.from(signedBytes(fields)),key).toString('base64'))});
  };
  const early=row('sample/early','id','before','2','later',later.privateKey),late=row('sample/late','id','after','4','later',later.privateKey);
  assert.equal(isConfig(early),true);
  const grants=[row('keys/later','class','authorize','3'),row('keys/later','coverage','*','3'),row('keys/later','public-key',later.publicKey.export({format:'der',type:'spki'}).toString('base64'),'3'),row('keys/later','resolution','1..16','3','owner',fixture.owner.privateKey,'interval')];
  writeFileSync(journal,original+[early,...grants,late].join('\n')+'\n');
  // Compare against the former per-epoch reopening algorithm, using real
  // historical authority. A later grant must not authenticate an earlier row.
  const history=admissionHistoryAt(fixture.root,Number.MAX_SAFE_INTEGER),anchor=admissionAnchor(fixture.root);
  const admitted=history.filter(line=>{
   const snapshot=admissionHistoryAt(fixture.root,Number(fieldOf(line,'epoch'))||0);
   return authorityFor(snapshot,anchor,eraOf(foldClaims(snapshot.filter(record=>fieldOf(record,'scope').startsWith('wire/'))).standing).admitted).of(line).kind==='admitted';
  });
  const first=authenticatedRootStanding(fixture.root);
  assert.deepEqual(first,foldClaims(admitted).standing);
  assert.equal(first.includes(early),false);assert.equal(first.includes(late),true);
  const expected=[...first];(first as string[]).splice(0,first.length,'caller mutation');
  assert.deepEqual(authenticatedRootStanding(fixture.root),expected,'returned arrays cannot poison the retained projection');
  const fixed=Math.floor(Date.now()/1000);utimesSync(journal,fixed,fixed);ledgerLines(store,'owner');
  const stamp=statSync(journal),bytes=readFileSync(journal,'utf8'),changed=row('sample/late','id','other','4','later',later.privateKey);
  assert.equal(Buffer.byteLength(changed),Buffer.byteLength(late));
  writeFileSync(journal,bytes.replace(late,changed));utimesSync(journal,stamp.atime,stamp.mtime);
  assert.equal(statSync(journal).size,stamp.size);assert.equal(Math.floor(statSync(journal).mtimeMs),Math.floor(stamp.mtimeMs));
  const second=authenticatedRootStanding(fixture.root);
  assert.equal(second.includes(late),false);assert.equal(second.includes(changed),true);assert.equal(second.includes(early),false);
  const changedBytes=readFileSync(journal,'utf8');
  const replaceSameSize=(before:string,after:string)=>{
   assert.equal(Buffer.byteLength(before),Buffer.byteLength(after));
   writeFileSync(journal,changedBytes.replace(before,after));utimesSync(journal,stamp.atime,stamp.mtime);
   assert.equal(statSync(journal).size,stamp.size);assert.equal(Math.floor(statSync(journal).mtimeMs),Math.floor(stamp.mtimeMs));
  };
  // Signature-only changes invalidate a warm projection even though the
  // declaration's meaning and all filesystem stamp inputs remain unchanged.
  const marker='sig="ed25519:sample:',offset=changed.indexOf(marker)+marker.length;
  assert.ok(offset>=marker.length);
  const bad=changed.slice(0,offset)+(changed[offset]==='A'?'B':'A')+changed.slice(offset+1);
  replaceSameSize(changed,bad);assert.equal(authenticatedRootStanding(fixture.root).includes(changed),false);
  writeFileSync(journal,changedBytes);utimesSync(journal,stamp.atime,stamp.mtime);assert.equal(authenticatedRootStanding(fixture.root).includes(changed),true);
  const narrowed=row('keys/later','coverage','?','3');
  replaceSameSize(grants[1]!,narrowed);assert.equal(authenticatedRootStanding(fixture.root).includes(changed),false,'changed historical coverage is re-evaluated');
  writeFileSync(journal,changedBytes);utimesSync(journal,stamp.atime,stamp.mtime);assert.equal(authenticatedRootStanding(fixture.root).includes(changed),true);
  const anchorFile=join(store,selfName()+'.keys'),anchorBytes=readFileSync(anchorFile,'utf8');
  const changedAnchor=anchorBytes.replace(fixture.owner.publicKey.export({format:'der',type:'spki'}).toString('base64'),later.publicKey.export({format:'der',type:'spki'}).toString('base64'));
  assert.notEqual(changedAnchor,anchorBytes);assert.equal(Buffer.byteLength(changedAnchor),Buffer.byteLength(anchorBytes));
  const anchorStamp=statSync(anchorFile);writeFileSync(anchorFile,changedAnchor);utimesSync(anchorFile,anchorStamp.atime,anchorStamp.mtime);
  assert.equal(authenticatedRootStanding(fixture.root).includes(changed),false,'fresh bootstrap anchor participates in the retained identity');
  writeFileSync(anchorFile,anchorBytes);assert.deepEqual(authenticatedRootStanding(fixture.root),second);
 }finally{fixture.close()}
});
