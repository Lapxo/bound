import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {canonical, parse} from '@lapxo/topos/wire';

const reader = process.env.BOUND_TEST_READER ?? new URL('../src/cli/verb.ts', import.meta.url).pathname;
const row = (scope: string, measure: string, value: string) => canonical({scope, measure, value, form:'alphabet', role:'writes', by:'target', at:'policy:race'});
const native=process.env.BOUND_TEST_NATIVE_RESULT==='1';
const pause = () => new Promise(resolve => setTimeout(resolve, 10));

for (const place of ['observations', 'inventory']) test(`concurrent CLI acts preserve the prepared base in ${place}`, {timeout:30_000}, async () => {
  const temp = mkdtempSync(join(tmpdir(), 'bound-base-'));
  const root = join(temp, place), key = join(temp, 'ephemeral.pem');
  const children: ReturnType<typeof spawn>[] = [];
  try {
    mkdirSync(root);
    const pair = generateKeyPairSync('ed25519');
    writeFileSync(key, pair.privateKey.export({format:'pem', type:'pkcs8'}), {mode:0o600});
    const lines = [row('wire/era','id','sample'), row('wire/signature-algorithms','id','ed25519:sample'), row('wire/digest-algorithms','id','sha256')];
    for (const [name, value] of Object.entries({fields:'scope|role|form|measure|value|by|at|epoch|sig', required:'scope|role|form|measure|value|by|at', forms:'alphabet|interval', roles:'reads|writes|demands', 'at-classes':'policy|place|origin|witness|receipt', families:'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region'})) lines.push(row(`wire/${name}`,'id',value));
    lines.push(row('keys/owner','class','authorize'), row('keys/owner','coverage','*'), row('keys/owner','public-key',pair.publicKey.export({format:'der',type:'spki'}).toString('base64')), row('keys/owner','signer','file'), row('keys/reader','class','read'));
    for (const [scope, measure, value] of [['keys/owner','resolution','1..16'], ['signer/timeout','milliseconds','5000..5000'], ['signer/response-bytes','bytes','65536..65536']]) lines.push(canonical({scope:scope!,measure:measure!,value:value!,form:'interval',role:'writes',by:'target',at:'policy:race'}));
    if(native)lines.push(row('wire/act-result','id','local-act@1'),row('wire/act-result-scope','id','receipts'),row('wire/act-result-context','id','receipt:local-act'),row('keys/folder','class','fold'));
    if(native)lines.push(canonical({scope:'view/act',measure:'id',value:'act',role:'demands',form:'alphabet',by:'target',at:'policy:race'}));
    writeFileSync(join(root,'TARGET.bound'),lines.join('\n')+'\n');
    const run = (args: string[]) => spawnSync(process.execPath,[...(process.env.BOUND_TEST_INSTALLED==='1'?[]:['--conditions=source']),reader,...args],{cwd:root,encoding:'utf8',timeout:15_000});
    const boot = run(['land','--key','owner','--key-file',key]);
    assert.equal(boot.status,0,boot.stderr);
    const baseline = readFileSync(join(root,'.bound','ledger','owner.bound'),'utf8');
    const lots = ['first','second','interrupted'].map(name => {
      const file = join(temp,`${name}.bound`);
      writeFileSync(file,row(`sample/${name}`,'observed',name)+'\n');
      const signed = run(['sign',file,'--key','owner','--key-file',key]);
      assert.equal(signed.status,0,signed.stderr);
      writeFileSync(file,signed.stdout.split('\n').filter(line=>parse(line).kind==='fact').join('\n')+'\n');
      return file;
    });
    // Hold the normal host lock so both real processes finish preparation on one base.
    const lock = join(root,'.bound','lock');
    mkdirSync(join(root,'.bound','locks'),{recursive:true});
    writeFileSync(lock,`${process.pid} race ${new Date().toISOString()} test-owner\n`,{flag:'wx'});
    const acts = lots.map(file => {
      const child = spawn(process.execPath,[...(process.env.BOUND_TEST_INSTALLED==='1'?[]:['--conditions=source']),reader,'land',file],{cwd:root,stdio:['ignore','pipe','pipe']});
      children.push(child);
      const result = {out:'',err:''};
      child.stdout!.on('data',bytes=>result.out+=bytes);
      child.stderr!.on('data',bytes=>result.err+=bytes);
      const done = new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
      return {result,done};
    });
    const deadline = Date.now()+10_000;
    while (!acts.every(act=>act.result.err.includes('WAIT '))) {
      assert.ok(Date.now()<deadline,JSON.stringify(acts.map(act=>act.result)));
      await pause();
    }
    // An interrupted prepared act never reached commitment, even though signed.
    children[2]!.kill('SIGTERM');
    assert.equal(await acts[2]!.done, 1);
    assert.match(acts[2]!.result.err, /REFUSE·crash signal/);
    assert.equal(readFileSync(join(root,'.bound','ledger','owner.bound'),'utf8'), baseline);
    rmSync(lock);
    const statuses = await Promise.all(acts.slice(0,2).map(act=>act.done));
    assert.deepEqual([...statuses].sort(),[0,1],JSON.stringify(acts.map(act=>act.result)));
    const failed = statuses.indexOf(1), passed = statuses.indexOf(0);
    assert.match(acts[failed]!.result.err,/REFUSE·base moved .*nothing landed/);
    const view = run(['fold','--as','lines']);
    assert.equal(view.status,0,view.stderr);
    const facts = view.stdout.split('\n').flatMap(line=>{const p=parse(line);return p.kind==='fact'?[p.value.fields]:[];});
    assert.equal(facts.filter(f=>f.scope?.startsWith('sample/')).length,1);
    const held = readFileSync(join(root,'.bound','ledger','owner.bound'),'utf8');
    if(native){
      const identity=/^ACT (\S+)/m.exec(acts[passed]!.result.out)?.[1];assert.ok(identity,acts[passed]!.result.out);
      assert.ok(!acts[failed]!.result.out.includes('ACT sha256:'));
      const result=run(['fold','--as','act',identity]);assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.includes(readFileSync(lots[passed]!,'utf8').trim()));
      console.log(result.stdout.trim());
    }else assert.ok(held.includes(readFileSync(lots[passed]!,'utf8').trim()));
    assert.ok(!held.includes(readFileSync(lots[failed]!,'utf8').trim()));
    assert.ok(!held.includes(readFileSync(lots[2]!,'utf8').trim()));
    const replay = run(['land',lots[passed]!]);
    assert.equal(replay.status,0,replay.stderr);
    assert.match(replay.stdout,/ONCE/);
    assert.equal(readFileSync(join(root,'.bound','ledger','owner.bound'),'utf8'),held);
    console.log(`RACE ${place} · one committed · stale base refused · replay ONCE`);
  } finally {
    await Promise.all(children.filter(child=>child.exitCode===null && child.signalCode===null).map(child=>new Promise<void>(resolve=>{child.once('close',()=>resolve());child.kill('SIGTERM');})));
    rmSync(temp,{recursive:true,force:true});
  }
});
