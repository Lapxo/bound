import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,generateKeyPairSync,sign,verify} from 'node:crypto';
import {fork} from 'node:child_process';
import {canonical,parse,signedBytes} from '@lapxo/topos/wire';
import {commitLocalAct,localActResult} from '../src/host/ports/local-act.ts';
import {nativePublicationStorage} from '../src/host/ports/publication.ts';
import {underTheRegions} from '../src/land/act.ts';

for(const coordinate of ['catalogue/items','research/observations'])test(`atomic local result: ${coordinate}`,async()=>{
  const temp=mkdtempSync(join(tmpdir(),'bound-commit-'));
  const store=join(temp,'place','.bound');
  mkdirSync(store,{recursive:true});
  try {
    const keys=generateKeyPairSync('ed25519');
    const signed=(fields:Record<string,string>):string=>canonical({...fields,
      sig:'ed25519:'+sign(null,Buffer.from(signedBytes(fields)),keys.privateKey).toString('base64')});
    const record=signed({scope:coordinate,role:'writes',form:'alphabet',measure:'id',
      value:'one',epoch:'7',by:'owner',at:'place:own'});
    const identity='sha256:'+createHash('sha256').update(record+'\n').digest('hex');
    const receipt=signed({scope:'receipts/acts',role:'writes',form:'alphabet',measure:'digest',
      value:identity,epoch:'7',by:'owner',at:'receipt:local'});
    const bundle={records:record+'\n',receipt:receipt+'\n'};
    // Host storage consumes an external verifier. Binding/order rules have their
    // own Topos tests; this test verifies publication and interruption only.
    const verifies=(id:string,got:typeof bundle):boolean=>id===identity
      && got.records===bundle.records && got.receipt===bundle.receipt
      && [record,receipt].every(line=>{
        const p=parse(line);if(p.kind!=='fact')return false;
        return verify(null,Buffer.from(signedBytes(p.value.fields)),keys.publicKey,
          Buffer.from(p.value.fields['sig']!.slice('ed25519:'.length),'base64'));
      });
    assert.equal(localActResult(store,identity,verifies),undefined);
    let preparations=0;
    const prepare=async()=>{preparations++;return bundle};
    await assert.rejects(commitLocalAct(store,identity,[],prepare,verifies,{publish(staged){
      assert.equal(localActResult(store,identity,verifies),undefined);
      assert.equal(readFileSync(join(staged,'records.bound'),'utf8'),bundle.records);
      assert.equal(readFileSync(join(staged,'receipt.bound'),'utf8'),bundle.receipt);
      throw Error('interrupted before publication');
    }}),/interrupted before/);
    assert.equal(localActResult(store,identity,verifies),undefined);
    assert.deepEqual(readdirSync(join(store,'ledger','acts')),[]);

    // Rename may succeed while delivery or directory synchronization fails.
    // Preserve the error; recovery reads the committed pair, never infers rollback.
    await assert.rejects(underTheRegions(store,[],'land',()=>commitLocalAct(store,identity,[],prepare,verifies,{publish(staged,at){
      nativePublicationStorage.publish(staged,at);
      throw Error('delivery lost after publication');
    }})),/delivery lost after/);
    assert.deepEqual(localActResult(store,identity,verifies),bundle);
    const before=preparations;
    assert.deepEqual(await commitLocalAct(store,identity,[],async()=>{throw Error('must not prepare again')},verifies),
      {kind:'once',...bundle});
    assert.equal(preparations,before);

    const at=join(store,'ledger','acts','committed-'+encodeURIComponent(identity));
    writeFileSync(join(at,'receipt.bound'),receipt.replace('value=sha256:','value=sha256:00')+'\n');
    assert.throws(()=>localActResult(store,identity,verifies),/committed result does not verify/);
    await assert.rejects(commitLocalAct(store,identity,[],prepare,verifies),/does not verify/);
    assert.equal(preparations,before);
    rmSync(join(at,'receipt.bound'));
    assert.throws(()=>localActResult(store,identity,verifies),/REFUSE·act committed result unreadable/);

    // A killed process cannot run finally. Its staged, fsynced bytes must still
    // be invisible to another process; this is stronger than throwing in a hook.
    const crashStore=join(temp,'interrupted','.bound');mkdirSync(crashStore,{recursive:true});
    const script=join(temp,'interrupted.mjs');
    writeFileSync(script,`import {commitLocalAct,localActResult} from ${JSON.stringify(new URL('../src/host/ports/local-act.ts',import.meta.url).href)};
      const store=${JSON.stringify(crashStore)},identity=${JSON.stringify(identity)},bundle=${JSON.stringify(bundle)};
      await commitLocalAct(store,identity,[],async()=>bundle,(id,got)=>id===identity&&got.records===bundle.records&&got.receipt===bundle.receipt,
        {publish(){process.send({phase:'staged'});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0)}});
    `);
    const child=fork(script,{stdio:['ignore','ignore','pipe','ipc']});
    const exited=new Promise<void>(resolve=>child.once('close',()=>resolve()));
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      await new Promise<void>((resolve,reject)=>{
        timer=setTimeout(()=>reject(Error('publication child did not stage')),5000);
        child.once('error',reject);
        child.once('close',()=>reject(Error('publication child exited before staging')));
        child.once('message',message=>{
          if((message as {phase?:string}).phase==='staged')resolve();else reject(Error('unexpected publication phase'));
        });
      });
      child.kill('SIGKILL');await exited;
      assert.equal(localActResult(crashStore,identity,verifies),undefined);
      assert.ok(readdirSync(join(crashStore,'ledger','acts')).every(name=>name.startsWith('.stage-')));
    } finally {clearTimeout(timer);child.kill('SIGKILL');await exited}
  } finally {rmSync(temp,{recursive:true,force:true})}
});
