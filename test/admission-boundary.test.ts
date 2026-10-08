import {strict as assert} from 'node:assert';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,statSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {canonical,parse,signedBytes,formatSignature} from '@lapxo/topos/wire';

test('a prospective lot uses the consumer authority, preserves bytes, and cannot withdraw its own new line',()=>{
 const yes=JSON.parse(readFileSync(new URL('../samples/admission/yes/one-boundary.json',import.meta.url),'utf8'));
 const no=JSON.parse(readFileSync(new URL('../samples/admission/no/one-boundary.json',import.meta.url),'utf8'));
 const reader=process.env.BOUND_TEST_READER??new URL('../src/cli/verb.ts',import.meta.url).pathname;
 const temp=mkdtempSync(join(tmpdir(),'bound-boundary-')),pair=generateKeyPairSync('ed25519');
 const key=join(temp,'key.pem');writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 const row=(scope,measure,value,form='alphabet')=>canonical({scope,measure,value,form,role:'writes',at:'policy:sample',by:'target'});
 const pub=pair.publicKey.export({type:'spki',format:'der'}).toString('base64');
 const seed=[['keys/device','class','authorize'],['keys/device','coverage','*'],['keys/device','public-key',pub],['keys/device','signer','file'],['keys/reader','class','read'],['keys/folder','class','fold'],['signer/timeout','milliseconds','5000..5000','interval'],['signer/response-bytes','bytes','65536..65536','interval'],['wire/digest-algorithms','id','sha256'],['wire/signature-algorithms','id','ed25519:sample'],['wire/era','id','sample'],['wire/families','id','keys|signer|wire|tree|write|leaf|reader|read|fold|receipts|rendered|resolved|beat|view|region|sample'],['wire/fields','id','scope|role|form|measure|value|by|at|needs|sig|epoch|shape|restsOn|condition|about|kind|view'],['wire/required','id','scope|role|form|measure|value|by|at'],['wire/forms','id','alphabet|interval'],['wire/roles','id','reads|writes|demands'],['wire/at-classes','id','origin|place|receipt|witness|policy']].map(v=>row(...v));
 for(const [name,shape] of [['summary',''],['page','summary.md']]) seed.push(canonical({scope:`view/${name}`,role:'demands',form:'alphabet',measure:'id',value:'field@3',shape,at:'policy:sample',by:'target'}));
 seed.push(canonical({scope:'sample/limit',form:'interval',role:'reads',measure:'count',value:'0..5',at:'policy:sample',by:'target'}));
 // This negative attempts to discharge an existing obligation, not declare a new one.
 seed.push(canonical({scope:'sample/required',form:'alphabet',role:'demands',measure:'id',value:'present',needs:'missing.txt',at:'policy:sample',by:'target'}));
 const run=(cwd,args)=>spawnSync(process.execPath,[reader,...args],{cwd,encoding:'utf8',timeout:20000});
 const digest=root=>{const all=[];const visit=(dir,base='')=>{for(const n of readdirSync(dir).sort()){const at=join(dir,n),rel=join(base,n);if(statSync(at).isDirectory())visit(at,rel);else all.push([rel,createHash('sha256').update(readFileSync(at)).digest('hex')]);}};visit(root);return all;};
 const stamp=(line)=>{const got=parse(line);assert.equal(got.kind,'fact');const fields={...got.value.fields,by:'device',epoch:'2'};return canonical({...fields,sig:formatSignature('ed25519:sample',sign(null,Buffer.from(signedBytes(fields)),pair.privateKey).toString('base64'))});};
 try{
  const roots=['north','south'].map(n=>join(temp,n));
  for(const root of roots){mkdirSync(root);writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');const p=run(root,['land','--key','device','--key-file',key]);assert.equal(p.status,0,p.stderr);}
  const external=join(temp,'lot.bound'),valid=stamp(canonical({...yes.lot[0],by:'target'}));writeFileSync(external,valid+'\n');
  for(const root of roots){const before=digest(root);const p=run(temp,['fold',root,'--as','lines',external]);assert.equal(p.status,0,p.stderr);assert.ok(p.stdout.includes('scope=sample/reading'));assert.deepEqual(digest(root),before);}
  for(const root of roots){const before=digest(root);for(const args of [['fold',root,'--as','lines','--place','absent',external],['land','--place','absent',external]]){const p=run(root,args);assert.equal(p.status,2,p.stderr);assert.match(p.stderr,/REFUSE·place/);assert.deepEqual(digest(root),before);}}
  for(const root of roots) for(const name of ['summary','page']) {
    const before=digest(root);const p=run(temp,['fold',root,'--as',name,external]);
    assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/TOLD/);assert.deepEqual(digest(root),before,'native and shaped previews must not persist calculated evidence');
  }
  const local=join(roots[0],'lot.bound');writeFileSync(local,valid+'\n');const beforeLocal=digest(roots[0]);const localView=run(roots[0],['fold','--as','lines',local]);assert.equal(localView.status,0,localView.stderr);assert.deepEqual(digest(roots[0]),beforeLocal);
  const invalid=join(temp,'invalid.bound');writeFileSync(invalid,no.lot.map(fields=>stamp(canonical({...fields,by:'target'}))).join('\n')+'\n');
  for(const root of roots){const before=digest(root);for(const args of[['fold',root,'--as','lines',invalid],['land',invalid]]){const p=run(root,args);assert.equal(p.status,1,p.stderr);assert.match(p.stderr,/REFUSE·withdraw/);assert.deepEqual(digest(root),before);}}
  writeFileSync(invalid,stamp(canonical({scope:'sample/limit',form:'interval',role:'reads',measure:'count',value:'0..10',at:'policy:sample',by:'target'}))+'\n');
  for(const root of roots){const before=digest(root);for(const args of[['fold',root,'--as','lines',invalid],['land',invalid]]){const p=run(root,args);assert.equal(p.status,1,p.stderr);assert.match(p.stderr,/REFUSE·widening/);assert.deepEqual(digest(root),before);}}
  for(const fields of [
    {scope:'write/src/removed.txt',form:'alphabet',role:'writes',measure:'digest',value:'withdraw',at:'policy:sample',by:'target'},
    {scope:'sample/required',form:'alphabet',role:'demands',measure:'id',value:'present',needs:'missing-revision.txt',at:'policy:sample',by:'target'},
  ]) {
    writeFileSync(invalid,stamp(canonical(fields))+'\n');
    for(const root of roots){const before=digest(root);for(const args of [['fold',root,'--as','lines',invalid],['land',invalid]]){const p=run(root,args);assert.equal(p.status,1,p.stderr);assert.match(p.stderr,/REFUSE·(?:withdraw|takes)/);assert.deepEqual(digest(root),before,'evidence-based admission refuses identically without acquiring readings');}}
  }
  writeFileSync(invalid,valid.replace('value=yes','value=no')+'\n');
  for(const args of[['fold',roots[0],'--as','lines',invalid],['land',invalid]]){const before=digest(roots[0]),p=run(roots[0],args);assert.equal(p.status,1,p.stderr);assert.match(p.stderr,/REFUSE·signed/);assert.deepEqual(digest(roots[0]),before);}
  const landed=run(roots[1],['land',external]);assert.equal(landed.status,0,landed.stderr);assert.match(landed.stdout,/FACT.*signed 1/);
  const beforeReplay=digest(roots[1]);const replay=run(roots[1],['fold','--as','lines',external]);assert.equal(replay.status,0,replay.stderr);assert.match(replay.stdout,/ONCE/);assert.deepEqual(digest(roots[1]),beforeReplay);
  // Standalone file fold still reads the file, independently of consumer authority.
  const folded=run(temp,['fold',external]);assert.equal(folded.status,0,folded.stderr);assert.match(folded.stdout,/FACT.*1 standing/);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
