import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical, parse} from '@lapxo/topos/wire';

const reader = process.env.BOUND_TEST_READER ?? new URL('../dist/cli/verb.js', import.meta.url).pathname;
const row = (scope: string, measure: string, value: string) => canonical({scope, measure, value, form:'alphabet', role:'writes', by:'target', at:'policy:race'});

for (const place of ['observations', 'inventory']) for (const mode of ['journal','act']) test(`public standing includes attest evidence in ${place} via ${mode}`, {timeout:30_000}, async () => {
  const temp = mkdtempSync(join(tmpdir(), 'bound-base-'));
  const root = join(temp, place), key = join(temp, 'ephemeral.pem');
  const captures:unknown[]=[];
  try {
    mkdirSync(root);
    const pair = generateKeyPairSync('ed25519'),device=generateKeyPairSync('ed25519');
    const deviceKey=join(temp,'device.pem');writeFileSync(deviceKey,device.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
    writeFileSync(key, pair.privateKey.export({format:'pem', type:'pkcs8'}), {mode:0o600});
    const lines = [row('wire/era','id','sample'), row('wire/signature-algorithms','id','ed25519:sample'), row('wire/digest-algorithms','id','sha256')];
    for (const [name, value] of Object.entries({fields:'scope|role|form|measure|value|by|at|epoch|sig', required:'scope|role|form|measure|value|by|at', forms:'alphabet|interval', roles:'reads|writes|demands', 'at-classes':'policy|place|origin|witness|receipt', families:'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region'})) lines.push(row(`wire/${name}`,'id',value));
    lines.push(row('keys/owner','class','authorize'), row('keys/owner','coverage','*'), row('keys/owner','public-key',pair.publicKey.export({format:'der',type:'spki'}).toString('base64')), row('keys/owner','signer','file'), row('keys/reader','class','read'));
    lines.push(row('keys/device','class','attest'),row('keys/device','coverage','sample/reading|sample/next'),row('keys/device','public-key',device.publicKey.export({format:'der',type:'spki'}).toString('base64')),row('keys/device','signer','file'));
    for (const [scope, measure, value] of [['keys/device','resolution','1..16'], ['keys/owner','resolution','1..16'], ['signer/timeout','milliseconds','5000..5000'], ['signer/response-bytes','bytes','65536..65536']]) lines.push(canonical({scope:scope!,measure:measure!,value:value!,form:'interval',role:'writes',by:'target',at:'policy:race'}));
    lines.push(row('wire/act-result','id','local-act@1'),row('wire/act-result-scope','id','receipts'),row('wire/act-result-context','id','receipt:local-act'),row('keys/folder','class','fold'),canonical({scope:'view/act',measure:'id',value:'act',role:'demands',form:'alphabet',by:'target',at:'policy:race'}));
    lines.push(canonical({scope:'view/standing',measure:'id',value:'standing',role:'demands',form:'alphabet',by:'target',at:'policy:race'}));
    if(mode==='journal') { const i=lines.findIndex(line=>/scope=wire\/act-result /.test(line)); lines.splice(i,1); }
    writeFileSync(join(root,'TARGET.bound'),lines.join('\n')+'\n');
    const run = (args: string[]) => {
      const started=Date.now(),result=spawnSync(process.execPath,[reader,...args],{cwd:root,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''},encoding:'utf8',timeout:15_000});
      captures.push({args:args.map(arg=>arg.replaceAll(temp,'[fixture]')),status:result.status,stdout:result.stdout,stderr:result.stderr,runtimeMs:Date.now()-started});
      return result;
    };
    const boot = run(['land','--key','owner','--key-file',key]);
    assert.equal(boot.status,0,boot.stderr);
    const lot=join(temp,'lot.bound');
    writeFileSync(lot,row('sample/reading','observed','retained')+'\n');
    const sign=run(['sign',lot,'--key','device','--key-file',deviceKey]);
    assert.equal(sign.status,0,sign.stderr);
    const signed=sign.stdout.split('\n').filter(line=>parse(line).kind==='fact').join('\n')+'\n';
    writeFileSync(lot,signed);
    const land=run(['land',lot]);
    assert.equal(land.status,0,land.stdout+land.stderr);
    const publicRead=()=> { const r=run(['fold','--as','standing']); assert.equal(r.status,0,r.stderr); return r.stdout; };
    const first=publicRead();
    // Test-only corrupt delivery: a stored inscription is not proof of authority.
    appendFileSync(join(root,'.bound','ledger','device.bound'),signed.replace('value=retained','value=forged'));
    assert.doesNotMatch(publicRead(),/value=forged/);
    assert.match(first,/scope=sample\/reading.*value=retained/);
    assert.match(first,/by=device.*scope=sample\/reading/);
    const source=join(temp,'source.bound');
    writeFileSync(source,row('sample/next','observed','old')+'\n');
    const nextLand=run(['land',source,'--key','owner','--key-file',key]);assert.equal(nextLand.status,0,nextLand.stdout+nextLand.stderr);
    writeFileSync(source,row('sample/next','observed','new')+'\n');
    const revised=run(['land',source,'--key','owner','--key-file',key]);assert.equal(revised.status,0,revised.stderr);
    const next=publicRead();assert.match(next,/scope=sample\/next.*value=new/);assert.doesNotMatch(next,/scope=sample\/next.*value=old/);
    writeFileSync(source,row('sample/next','observed','withdraw')+'\n');
    const withdrawal=run(['land',source,'--key','owner','--key-file',key]);assert.equal(withdrawal.status,0,withdrawal.stderr);
    const withdrawn=publicRead();assert.doesNotMatch(withdrawn,/scope=sample\/next.*value=new/);assert.match(withdrawn,/scope=sample\/reading.*value=retained/);
    const replay=run(['land',lot]);assert.equal(replay.status,0,replay.stderr);assert.match(replay.stdout,/ONCE/);assert.equal(publicRead(),withdrawn);
    writeFileSync(source,row('keys/device','class','withdraw')+'\n');
    const retire=run(['land',source,'--key','owner','--key-file',key]);assert.equal(retire.status,0,retire.stderr);
    assert.match(publicRead(),/scope=sample\/reading.*value=retained/);
    assert.notEqual(run(['sign',lot,'--key','device','--key-file',deviceKey]).status,0);
    writeFileSync(source,canonical({scope:'view/standing',measure:'id',value:'withdraw',role:'demands',form:'alphabet',by:'target',at:'policy:race'})+'\n');
    const removeView=run(['land',source,'--key','owner','--key-file',key]);assert.equal(removeView.status,0,removeView.stderr);
    const undeclared=run(['fold','--as','standing']);assert.equal(undeclared.status,1);assert.match(undeclared.stderr,/REFUSE·view standing/);
    console.log(`STANDING ${place} ${mode} · attest retained · revisions and withdrawals applied · replay identical`);
  }finally{
    // Optional test transcript: CLI output only, never fixture key material.
    const captureDir=process.env.BOUND_TEST_CAPTURE_DIR;
    if(captureDir){mkdirSync(captureDir,{recursive:true});writeFileSync(join(captureDir,`${place}-${mode}.json`),JSON.stringify({place,mode,captures},null,2)+'\n');}
    rmSync(temp,{recursive:true,force:true});
  }
});
