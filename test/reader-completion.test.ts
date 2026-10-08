import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {gzipSync} from 'node:zlib';
import {standingBytes} from '@lapxo/topos/standing';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical} from '@lapxo/topos/wire';

for(const profile of ['historical','bounded-process@1','bounded-process@2','disjoint@2','capsule@2','projection@2'])test(`a requested native view consumes ${profile} without changing its compatibility contract`,()=>{
 const bounded=profile!=='historical',capsuleMode=['capsule@2','projection@2'].includes(profile);
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
  if(bounded)seed.push(row('wire/reader-lifetime','id',profile==='disjoint@2'||capsuleMode?'bounded-process@2':profile),row('reader/timeout','milliseconds','0..1000','interval'),row('reader/response-bytes','bytes','0..65536','interval'),row('wire/reader-empty','id','declared-empty@1'),row('wire/reader-inputs','id','declared-presence@1'),row('reader/inputs','id','required'));
  if(profile.endsWith('@2')&&!capsuleMode)seed.push(row('reader/extent/timeout','milliseconds',profile==='disjoint@2'?'1500..2000':'200..800','interval'));
  if(capsuleMode){
   const hash=(bytes:Uint8Array|string)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
   const member=(name:string,text:string)=>{const bytes=Buffer.from(text),h=Buffer.alloc(512);h.write(name);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h.write('0',156);h.write('ustar\0',257);h.write(h.reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);return Buffer.concat([h,bytes,Buffer.alloc(Math.ceil(bytes.length/512)*512-bytes.length)]);};
   const plan=canonical({scope:'one',role:'reads',form:'alphabet',measure:'reads',value:'src/input.txt',at:'receipt:1',by:'world'});
   const module="import{appendFileSync}from'node:fs';const note=()=>appendFileSync("+JSON.stringify(join(root,'calls'))+",'run\\n');const claim=n=>[{scope:'extent',role:'writes',measure:'bytes',bound:{kind:'interval',lo:n,hi:n}}];export const observe=bytes=>{note();return claim(bytes.length);};export const render=()=>["+JSON.stringify(plan)+"];export const receipt=asked=>{note();return claim(asked.lines.find(line=>line.scope==='src/input.txt').about.length);};";
   const declarations=[row('region/extent','reads','**'),row('region/extent','writes','**'),...(profile==='projection@2'?[row('region/extent','input-projection','inputs')]:[])];
   const archive=gzipSync(Buffer.concat([member('capsule.bound',declarations.join('\n')+'\n'),member('entry.js',module),Buffer.alloc(1024)])),blob=hash(archive);
   const standing=standingBytes([canonical({scope:'offers/provider',kind:'capsule',role:'writes',form:'alphabet',measure:'digest',value:blob,restsOn:blob,by:'world',at:'policy:sample'})]),pin=hash(standing);
   const cas=join(root,'.bound/cas/blobs');mkdirSync(cas,{recursive:true});writeFileSync(join(cas,blob.slice(7)),archive);writeFileSync(join(cas,pin.slice(7)),standing);
   const without=seed.filter(line=>!line.includes('scope=reader/extent ')&&!line.includes('scope=reader/timeout '));seed.splice(0,seed.length,...without);
   const families=seed.findIndex(line=>line.includes('scope=wire/families '));seed[families]=seed[families].replace('value=', 'value=dep|uses|');
   const shapes=seed.findIndex(line=>line.includes('scope=wire/shapes '));seed[shapes]=seed[shapes].replace('value=', 'value=entry.js|');
   seed.push(row('reader/timeout','milliseconds','0..3000','interval'),row('reader/provider/extent/timeout','milliseconds','0..2500','interval'),row('uses/provider','id',pin),canonical({scope:'dep/provider',role:'writes',form:'alphabet',measure:'id',value:blob,shape:'entry.js',at:'policy:sample',by:'target'}),row('region/extent','coordinates','src/**'));
  }
  writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');
  const bootstrap=run(['land','--key','device','--key-file',key]);assert.equal(bootstrap.status,0,bootstrap.stderr);
  const first=run(['fold','--as','evidence']);
  if(profile==='disjoint@2'){assert.equal(first.status,1,first.stderr);assert.match(first.stderr,/REFUSE·reader extent conflicting timeout/);assert.equal(first.stdout.includes('scope=extent'),false);assert.throws(()=>readFileSync(join(root,'calls')));console.log(first.stderr.trim());return;}
  assert.equal(first.status,0,first.stderr);assert.match(first.stdout,/scope=extent .*value=5\.\.5/,first.stderr);assert.equal(first.stderr.includes('GREY     reading:'),false,first.stderr);
  let calls=readFileSync(join(root,'calls'),'utf8');
  const second=run(['fold','--as','evidence']);assert.equal(second.status,0,second.stderr);assert.match(second.stdout,/scope=extent .*value=5\.\.5/);assert.equal(readFileSync(join(root,'calls'),'utf8'),calls);assert.match(second.stderr,/OBSERVE\s+0 run/);
  if(capsuleMode){
   const policy=join(temp,'capsule-limits.proposal');writeFileSync(policy,row('reader/provider/extent/timeout','milliseconds','0..2000','interval')+'\n');
   const admitted=run(['land',policy,'--key','device','--key-file',key]);assert.equal(admitted.status,0,admitted.stderr);
   const reread=run(['fold','--as','evidence']);assert.equal(reread.status,0,reread.stderr);assert.match(reread.stdout,/scope=extent .*value=5\.\.5/);assert.equal(readFileSync(join(root,'calls'),'utf8'),calls+'run\n');calls=readFileSync(join(root,'calls'),'utf8');
   const idle=run(['fold','--as','evidence']);assert.equal(idle.status,0,idle.stderr);assert.equal(readFileSync(join(root,'calls'),'utf8'),calls);assert.match(idle.stderr,/OBSERVE\s+0 run/);
   writeFileSync(policy,row('reader/provider/extent/timeout','milliseconds','4000..5000','interval')+'\n');const refused=run(['land',policy,'--key','device','--key-file',key]);assert.equal(refused.status,0,refused.stderr);
   const conflicting=run(['fold','--as','evidence']);assert.equal(conflicting.status,1,conflicting.stderr);assert.match(conflicting.stderr,/REFUSE·reader provider\/extent conflicting timeout/);assert.doesNotMatch(conflicting.stdout,/scope=extent/);assert.equal(readFileSync(join(root,'calls'),'utf8'),calls);console.log(conflicting.stderr.trim());return;
  }
  if(profile==='bounded-process@2'){
   const policy=join(temp,'limits.proposal');writeFileSync(policy,row('reader/extent/timeout','milliseconds','200..700','interval')+'\n');
   const narrowed=run(['land',policy,'--key','device','--key-file',key]);assert.equal(narrowed.status,0,narrowed.stderr);
   const reread=run(['fold','--as','evidence']);assert.equal(reread.status,0,reread.stderr);assert.match(reread.stdout,/scope=extent .*value=5\.\.5/);
   assert.equal(readFileSync(join(root,'calls'),'utf8'),calls+'run\n','changed effective policy cannot reuse an old current-response receipt');
   calls=readFileSync(join(root,'calls'),'utf8');
   const kept=run(['fold','--as','evidence']);assert.equal(kept.status,0,kept.stderr);assert.equal(readFileSync(join(root,'calls'),'utf8'),calls);assert.match(kept.stderr,/OBSERVE\s+0 run/);
  }
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
 }finally{if(process.env.BOUND_TEST_CAPTURE)writeFileSync(process.env.BOUND_TEST_CAPTURE+'.'+profile.replaceAll('@','-')+'.json',JSON.stringify(captures,null,2)+'\n');rmSync(temp,{recursive:true,force:true});}
});
