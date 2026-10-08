import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical} from '@lapxo/topos/wire';

for(const bounded of [false,true])test(`a requested native view waits for its ${bounded?'bounded':'historical'} declared reading and reuses the unchanged answer`,()=>{
 const reader=process.env.BOUND_TEST_READER ?? new URL('../dist/cli/verb.js',import.meta.url).pathname;
 const temp=mkdtempSync(join(tmpdir(),'bound-completion-')),root=join(temp,'place'),pair=generateKeyPairSync('ed25519');
 const key=join(temp,'key.pem');writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 const row=(scope,measure,value,form='alphabet')=>canonical({scope,measure,value,form,role:'writes',at:'policy:sample',by:'target'});
 const pub=pair.publicKey.export({type:'spki',format:'der'}).toString('base64');
 const seed=[['keys/device','class','authorize'],['keys/device','coverage','*'],['keys/device','public-key',pub],['keys/device','signer','file'],['keys/reader','class','read'],['keys/folder','class','fold'],['signer/timeout','milliseconds','5000..5000','interval'],['signer/response-bytes','bytes','65536..65536','interval'],['wire/digest-algorithms','id','sha256'],['wire/signature-algorithms','id','ed25519:sample'],['wire/era','id','sample'],['wire/families','id','keys|signer|wire|tree|write|leaf|reader|read|fold|receipts|rendered|resolved|beat|view|region|sample|vector|cost|source|class|pipeline|host'],['wire/fields','id','scope|role|form|measure|value|by|at|needs|sig|epoch|shape|restsOn|condition|about|kind|view'],['wire/required','id','scope|role|form|measure|value|by|at'],['wire/forms','id','alphabet|interval'],['wire/roles','id','reads|writes|demands'],['wire/at-classes','id','origin|place|receipt|witness|policy']].map(v=>row(...v));

 seed.push(row('wire/shapes','id','run|input.txt'),row('wire/receipt-fields','id','scope|role|form|measure|value|by|at'),row('wire/region-measures','id','coordinates'),row('wire/region-coordinate','id','coordinates'));
 seed.push(canonical({scope:'reader/extent',role:'writes',form:'alphabet',measure:'reader',value:'extent.mjs',shape:'input.txt',needs:'src/',at:'policy:sample',by:'target'}));
 seed.push(canonical({scope:'view/evidence',role:'demands',form:'alphabet',measure:'id',value:'receipts@8',at:'policy:sample',by:'target'}));
 const captures:unknown[]=[];
 const run=(args:string[])=>{const started=Date.now(),result=spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:20000});captures.push({reader,args,status:result.status,stdout:result.stdout,stderr:result.stderr,runtimeMs:Date.now()-started});return result;};
 try{
  mkdirSync(join(root,'src'),{recursive:true});writeFileSync(join(root,'src/input.txt'),'first');
  writeFileSync(join(root,'extent.mjs'),String.raw`import {appendFileSync} from 'node:fs'; export const observe = bytes => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,120); appendFileSync('calls','run\n'); return [{scope:'extent',role:'writes',measure:'bytes',bound:{kind:'interval',lo:bytes.length,hi:bytes.length}}]; };`);
  if(bounded)seed.push(row('wire/reader-lifetime','id','bounded-process@1'),row('reader/timeout','milliseconds','0..1000','interval'),row('reader/response-bytes','bytes','0..65536','interval'),row('wire/reader-empty','id','declared-empty@1'),row('wire/reader-inputs','id','declared-presence@1'),row('reader/inputs','id','required'));
  writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');
  const bootstrap=run(['land','--key','device','--key-file',key]);assert.equal(bootstrap.status,0,bootstrap.stderr);
  const first=run(['fold','--as','evidence']);assert.equal(first.status,0,first.stderr);assert.match(first.stdout,/scope=extent .*value=5\.\.5/,first.stderr);assert.equal(first.stderr.includes('GREY     reading:'),false,first.stderr);
  const calls=readFileSync(join(root,'calls'),'utf8');
  const second=run(['fold','--as','evidence']);assert.equal(second.status,0,second.stderr);assert.match(second.stdout,/scope=extent .*value=5\.\.5/);assert.equal(readFileSync(join(root,'calls'),'utf8'),calls);assert.match(second.stderr,/OBSERVE\s+0 run/);
  writeFileSync(join(root,'src/input.txt'),'changed');
  const changed=run(['fold','--as','evidence']);assert.equal(changed.status,0,changed.stderr);assert.match(changed.stdout,/scope=extent .*value=7\.\.7/);assert.equal(readFileSync(join(root,'calls'),'utf8'),calls+'run\n');
  // An operational refusal cannot seal unchanged inputs as a completed fold.
  writeFileSync(join(root,'extent.mjs'),"import {existsSync,writeFileSync} from 'node:fs'; export const observe = bytes => {if(!existsSync('attempt')){writeFileSync('attempt','started');throw Error('temporary reader unavailable');}return [{scope:'extent',role:'writes',measure:'bytes',bound:{kind:'interval',lo:bytes.length,hi:bytes.length}}];};");
  const failedPass=run(['fold']);assert.equal(failedPass.status,1,failedPass.stderr);assert.match(failedPass.stderr,/temporary reader unavailable/);assert.doesNotMatch(failedPass.stdout,/PASS\s+closed/);
  const recoveredPass=run(['fold']);assert.equal(recoveredPass.status,0,recoveredPass.stderr);assert.doesNotMatch(recoveredPass.stderr,/temporary reader unavailable/);
  const recoveredView=run(['fold','--as','evidence']);assert.equal(recoveredView.status,0,recoveredView.stderr);assert.match(recoveredView.stdout,/scope=extent .*value=7\.\.7/);
  writeFileSync(join(root,'extent.mjs'),"export const observe = () => { throw Error('declared reading refused'); };");
  const refused=run(['fold','--as','evidence']);assert.equal(refused.status,1,refused.stderr);assert.match(refused.stderr,/REFUSE·reader .*declared reading refused/);assert.equal(refused.stdout.includes('scope=extent'),false,'no stale result is presented as a completed reading');
  if(bounded){
   writeFileSync(join(root,'extent.mjs'),"export const observe = () => { process.stdout.write('partial');setInterval(()=>{},1000);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100000);return []; }; ");
   const timed=run(['fold','--as','evidence']);assert.equal(timed.status,1,timed.stderr);assert.match(timed.stderr,/declared timeout exhausted/);assert.doesNotMatch(timed.stdout,/scope=extent/);
   writeFileSync(join(root,'extent.mjs'),"export const observe = () => []; ");
   const emptyRequired=run(['fold','--as','evidence']);assert.equal(emptyRequired.status,1,emptyRequired.stderr);assert.match(emptyRequired.stderr,/REFUSE·reader/);
   const permission=join(temp,'empty.proposal');writeFileSync(permission,row('reader/empty','id','allow')+'\n');
   const admitted=run(['land',permission,'--key','device','--key-file',key]);assert.equal(admitted.status,0,admitted.stderr);
   const emptyAllowed=run(['fold','--as','evidence']);assert.equal(emptyAllowed.status,0,emptyAllowed.stderr);assert.doesNotMatch(emptyAllowed.stdout,/scope=extent/);
   rmSync(join(root,'src/input.txt'));const missing=run(['fold','--as','evidence']);assert.equal(missing.status,1,missing.stderr);assert.match(missing.stderr,/required input selection is empty/);

  }
 }finally{if(process.env.BOUND_TEST_CAPTURE)writeFileSync(process.env.BOUND_TEST_CAPTURE+(bounded?'.bounded':'.historical')+'.json',JSON.stringify(captures,null,2)+'\n');rmSync(temp,{recursive:true,force:true});}
});
