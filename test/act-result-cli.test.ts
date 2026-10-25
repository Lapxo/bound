import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {canonical, parse} from '@lapxo/topos/wire';
import {underAuthorityRegions,underRootProjection} from '../src/land/act.ts';

const reader = process.env.BOUND_TEST_READER ?? new URL('../dist/cli/verb.js', import.meta.url).pathname;
const row = (scope: string, measure: string, value: string) => canonical({scope, measure, value, form:'alphabet', role:'writes', by:'target', at:'policy:race'});

for (const place of ['observations', 'inventory']) test(`committed CLI results survive replay in ${place}`, {timeout:30_000}, async () => {
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
    lines.push(row('keys/device','class','read'),row('keys/device','coverage','sample/reading|sample/next'),row('keys/device','public-key',device.publicKey.export({format:'der',type:'spki'}).toString('base64')),row('keys/device','signer','file'));
    for (const [scope, measure, value] of [['keys/device','resolution','1..16'], ['keys/owner','resolution','1..16'], ['signer/timeout','milliseconds','5000..5000'], ['signer/response-bytes','bytes','65536..65536']]) lines.push(canonical({scope:scope!,measure:measure!,value:value!,form:'interval',role:'writes',by:'target',at:'policy:race'}));
    lines.push(row('wire/act-result','id','local-act@1'),row('wire/act-result-scope','id','receipts'),row('wire/act-result-context','id','receipt:local-act'),row('keys/folder','class','fold'),canonical({scope:'view/act',measure:'id',value:'act',role:'demands',form:'alphabet',by:'target',at:'policy:race'}));
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
    const identity=/^ACT (\S+)/m.exec(land.stdout)?.[1];assert.ok(identity,land.stdout);
    const query=run(['fold','--as','act',identity]);
    assert.equal(query.status,0,query.stdout+query.stderr);
    assert.ok(query.stdout.includes(signed));
    assert.match(query.stdout,/epoch 2 · admitted · conformance not asserted/);
    const rendered=run(['fold','--as','lines']);assert.equal(rendered.status,0,rendered.stderr);assert.match(rendered.stdout,/scope=sample\/reading/);
    const replay=run(['land',lot]);assert.equal(replay.status,0,replay.stderr);assert.match(replay.stdout,/ONCE/);assert.ok(replay.stdout.includes(identity));
    const again=run(['fold','--as','act',identity]);assert.equal(again.status,0,again.stderr);assert.equal(again.stdout,query.stdout);
    const next=join(temp,'next.bound');writeFileSync(next,row('sample/next','observed','next')+'\n');
    const nextSign=run(['sign',next,'--key','device','--key-file',deviceKey]);assert.equal(nextSign.status,0,nextSign.stderr);assert.match(nextSign.stdout,/epoch=3/);
    mkdirSync(join(root,'child'));writeFileSync(join(root,'child','TARGET.bound'),row('sample/title','id','child')+'\n');
    const own=join(temp,'own.bound');writeFileSync(own,row('sample/own','id','child-act')+'\n');
    const ownSigned=run(['sign',own,'--place','child','--key','owner','--key-file',key]);assert.equal(ownSigned.status,0,ownSigned.stderr);
    writeFileSync(own,ownSigned.stdout.split('\n').filter(line=>parse(line).kind==='fact').join('\n')+'\n');
    const ownLand=run(['land',own,'--place','child']);assert.equal(ownLand.status,0,ownLand.stdout+ownLand.stderr);
    const ownIdentity=/^ACT (\S+)/m.exec(ownLand.stdout)?.[1];assert.ok(ownIdentity,ownLand.stdout);
    const ownQuery=run(['fold','--as','act',ownIdentity]);assert.equal(ownQuery.status,0,ownQuery.stdout+ownQuery.stderr);assert.match(ownQuery.stdout,/value=child-act/);
    const ownReplay=run(['land',own,'--place','child']);assert.equal(ownReplay.status,0,ownReplay.stderr);assert.match(ownReplay.stdout,/ONCE/);assert.ok(ownReplay.stdout.includes(ownIdentity));
    // Pause the shared projection after publication, then prepare a second
    // genuine sibling act on its current legacy base. Both may commit while
    // projection delivery waits; the joined root still has one writer.
    for(const child of ['sibling','projection']){mkdirSync(join(root,child));writeFileSync(join(root,child,'TARGET.bound'),row('sample/title','id',child)+'\n')}
    const inFlight:ReturnType<typeof spawn>[]=[];
    const deliveries:Promise<number|null>[]=[];
    const siblingActs:{out:string;err:string;identity?:string}[]=[];
    const beginOwn=(placeName:string,index:number)=>{
      const file=join(temp,`sibling-${index}.bound`);writeFileSync(file,row(`sample/concurrent-${index}`,'id',placeName)+'\n');
      const signed=run(['sign',file,'--place',placeName,'--key','owner','--key-file',key]);assert.equal(signed.status,0,signed.stderr);
      writeFileSync(file,signed.stdout.split('\n').filter(line=>parse(line).kind==='fact').join('\n')+'\n');
      const child=spawn(process.execPath,[reader,'land',file,'--place',placeName],{cwd:root,stdio:['ignore','pipe','pipe']});inFlight.push(child);
      const result={out:'',err:'',identity:undefined as string|undefined};siblingActs.push(result);
      deliveries.push(new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)}));
      child.stderr!.on('data',bytes=>result.err+=bytes);
      return new Promise<void>((resolve,reject)=>{
        child.stdout!.on('data',bytes=>{result.out+=bytes;const identity=/^ACT (\S+)/m.exec(result.out)?.[1];if(identity){result.identity=identity;resolve()}});
        child.once('error',reject);child.once('close',()=>{if(!result.identity)reject(Error('sibling publication failed: '+result.out+result.err))});
      });
    };
    const projectionBefore=readFileSync(join(root,'TARGET.bound'),'utf8');
    try{
      await underAuthorityRegions(join(root,'.bound'),['projection'],'projection fixture',()=>underRootProjection(join(root,'.bound'),'projection fixture',async()=>{
        await beginOwn('child',0);await beginOwn('sibling',1);
        assert.ok(inFlight.every(child=>child.exitCode===null));
        assert.equal(readFileSync(join(root,'TARGET.bound'),'utf8'),projectionBefore);
      }));
      assert.deepEqual(await Promise.all(deliveries),[0,0],JSON.stringify(siblingActs));
      for(const result of siblingActs){const inspected=run(['fold','--as','act',result.identity!]);assert.equal(inspected.status,0,inspected.stderr);assert.ok(inspected.stdout.includes(result.identity!));}
      const projectionLines=readFileSync(join(root,'TARGET.bound'),'utf8').trimEnd().split('\n');
      const claims=projectionLines.filter(line=>!line.startsWith('# '));
      assert.ok(claims.length>=lines.length,'joined projection retains root claims');
      for(const line of claims)assert.equal(parse(line).kind,'fact',line);
      captures.push({args:['land','[sibling publication]'],status:0,siblingActs});
    }finally{
      for(const child of inFlight)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
      await Promise.allSettled(deliveries);
    }
    const retire=join(temp,'retire.bound');
    writeFileSync(retire,[row('keys/device','class','withdraw'),row('keys/folder','class','withdraw'),row('keys/replacement','class','fold'),row('wire/act-result-context','id','receipt:changed')].join('\n')+'\n');
    // The real root-admission process participates in the same protocol as
    // child publication; grant retirement cannot pass an authority read guard.
    let retiring:ReturnType<typeof spawn>|undefined;
    let retirement:Promise<number|null>|undefined;
    let retirementOut='',retirementErr='';
    const ownerBefore=readFileSync(join(root,'.bound','ledger','owner.bound'),'utf8');
    try{
      await underAuthorityRegions(join(root,'.bound'),['child'],'child-publication',async()=>{
        retiring=spawn(process.execPath,[reader,'land',retire,'--key','owner','--key-file',key],{cwd:root,stdio:['ignore','pipe','pipe']});
        retirement=new Promise((resolve,reject)=>{retiring!.once('error',reject);retiring!.once('close',resolve)});
        retiring.stdout!.on('data',bytes=>retirementOut+=bytes);
        await new Promise<void>((resolve,reject)=>{
          const ready=(bytes:Buffer)=>{retirementErr+=bytes;if(retirementErr.includes('WAIT ')){cleanup();resolve()}};
          const exited=()=>{cleanup();reject(Error('root admission exited before authority guard: '+retirementErr))};
          const cleanup=()=>{retiring!.stderr!.off('data',ready);retiring!.off('close',exited)};
          retiring!.stderr!.on('data',ready);retiring!.once('close',exited);retiring!.once('error',reject);
        });
        assert.equal(readFileSync(join(root,'.bound','ledger','owner.bound'),'utf8'),ownerBefore);
        assert.equal(retiring.exitCode,null,'root retirement waits through child publication');
      });
      assert.equal(await retirement,0,retirementOut+retirementErr);
      captures.push({args:['land','[retirement]'],status:0,stdout:retirementOut,stderr:retirementErr});
    }finally{
      if(retiring?.exitCode===null&&retiring.signalCode===null){retiring.kill('SIGTERM');await retirement}
    }
    const historical=run(['fold','--as','act',identity]);assert.equal(historical.status,0,historical.stdout+historical.stderr);assert.equal(historical.stdout,query.stdout,'historical result survives retirement and changed profile');
    const retiredLedger=readFileSync(join(root,'.bound','ledger','owner.bound'));const refused=run(['sign',next,'--key','device','--key-file',deviceKey]);assert.notEqual(refused.status,0,'retired evidence never authorizes a new act');assert.match(refused.stderr,/REFUSE·authority\/coverage keyId=device scope=sample\/next/);assert.equal(JSON.parse(refused.stderr.trim().split('\n').at(-1)!).code,'authority/coverage');assert.deepEqual(readFileSync(join(root,'.bound','ledger','owner.bound')),retiredLedger,'refused signing leaves the owner ledger unchanged');
    console.log('HISTORY '+place+' · original result retained · retired key cannot sign new delivery');
    const missing=run(['fold','--as','act','sha256:'+'0'.repeat(64)]);assert.equal(missing.status,1);assert.match(missing.stderr,/REFUSE·act no committed result/);
    console.log(query.stdout.trim());console.log(`ONCE ${place} · same identity and epoch · public result unchanged`);
    if(process.env.BOUND_TEST_CAPTURE)writeFileSync(process.env.BOUND_TEST_CAPTURE+'.'+place+'.json',JSON.stringify(captures,null,2)+'\n');
  }finally{rmSync(temp,{recursive:true,force:true});}
});
