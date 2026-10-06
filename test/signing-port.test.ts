import {generateKeyPairSync,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawnSync} from 'node:child_process';import {strict as assert} from 'node:assert';
import {canonical,parse} from '@lapxo/topos/wire';
import {test} from 'node:test';
test('declared signing ports are equivalent and CLI refusals are atomic',()=>{
const reader=new URL('../src/cli/verb.ts',import.meta.url).pathname,temp=mkdtempSync(join(tmpdir(),'bound-sign-cli-'));
const report={reader,dependency:'isolated Topos signing API candidate; not published 0.1.7',runs:[],complete:false};
const pair=generateKeyPairSync('ed25519'),key=join(temp,'device.pem');writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
const pub=pair.publicKey.export({type:'spki',format:'der'}).toString('base64');const wire=new URL('../node_modules/@lapxo/topos/dist/wire/index.js',import.meta.url).pathname;
const counter=join(temp,'counter'),command=join(temp,'signer.mjs'),registry=join(temp,'bindings.json');
writeFileSync(command,`import{readFileSync,appendFileSync}from'node:fs';import{sign,createPrivateKey}from'node:crypto';import{parse,canonical,formatSignature}from ${JSON.stringify(wire)};appendFileSync(process.argv[2],'1');const rows=readFileSync(0,'utf8').trimEnd().split('\\n');process.stdout.write(rows.map(bytes=>canonical({by:parse(bytes).value.fields.by,sig:formatSignature('ed25519:fixture',sign(null,Buffer.from(bytes),createPrivateKey(process.env.PORT_TEST_KEY)).toString('base64'))})).join('\\n')+'\\n');`);
const good={kind:'command',executable:process.execPath,args:[command,counter]};writeFileSync(registry,JSON.stringify({local:good}));
function run(root,label,args,expected=0){const p=spawnSync(process.execPath,[reader,...args],{cwd:root,env:{...process.env,BOUND_SIGNERS:registry,PORT_TEST_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'})},encoding:'utf8',timeout:10000});report.runs.push({label,status:p.status,stdout:p.stdout,stderr:p.stderr});assert.equal(p.status,expected,p.stdout+p.stderr);return p;}
const row=(scope,measure,value,form='alphabet')=>canonical({scope,measure,value,form,role:'writes',at:'policy:fixture',by:'target'});
function seed(root,name){mkdirSync(root);const rows=[['keys/device','class','authorize'],['keys/device','coverage','*'],['keys/device','public-key',pub],['keys/device','signer',name],['signer/timeout','milliseconds','500..500','interval'],['signer/response-bytes','bytes','65536..65536','interval'],['wire/digest-algorithms','id','sha256'],['wire/signature-algorithms','id','ed25519:fixture'],['wire/era','id','fixture'],['wire/families','id','keys|signer|wire|tree|write|leaf|read|fold|receipts|rendered|resolved|beat|view|region|sample'],['wire/fields','id','scope|role|form|measure|value|by|at|needs|sig|epoch|shape|restsOn|condition|about|kind|view'],['wire/required','id','scope|role|form|measure|value|by|at'],['wire/forms','id','alphabet|interval'],['wire/roles','id','reads|writes|demands'],['wire/at-classes','id','origin|place|receipt|witness|policy']];writeFileSync(join(root,'TARGET.bound'),rows.map(v=>row(...v)).join('\n')+'\n');}
const file=join(temp,'file'),remote=join(temp,'command');
try{seed(file,'file');seed(remote,'local');run(file,'file bootstrap',['land','--key','device','--key-file',key]);run(remote,'command bootstrap',['land','--key','device','--signer','local']);
 const draft=join(temp,'lot.proposal');writeFileSync(draft,[row('sample/a','id','yes'),row('sample/b','id','yes')].join('\n')+'\n');
 const f=run(file,'file signs whole lot',['sign','--key','device','--key-file',key,draft]);const before=readFileSync(counter,'utf8').length;
 const c=run(remote,'command signs whole lot',['sign','--key','device','--signer','local',draft]);assert.equal(readFileSync(counter,'utf8').length-before,1);const signed=p=>p.stdout.split('\n').filter(l=>parse(l).kind==='fact');assert.deepEqual(signed(f),signed(c));
 const signedFile=join(temp,'signed.proposal');writeFileSync(signedFile,signed(c).join('\n')+'\n');run(file,'file consumer admits signed lot',['land',signedFile]);run(remote,'command consumer admits identical lot',['land',signedFile]);
 writeFileSync(draft,[row('sample/failure-a','id','yes'),row('sample/failure-b','id','yes')].join('\n')+'\n');
 const ledger=join(remote,'.bound/ledger/device.bound'),hash=()=>createHash('sha256').update(readFileSync(ledger)).digest('hex');
 const absent=join(temp,'absent');seed(absent,'local');writeFileSync(join(absent,'TARGET.bound'),readFileSync(join(absent,'TARGET.bound'),'utf8').split('\n').filter(l=>!l.includes('measure=signer')).join('\n'));const miss=run(absent,'no declared signer',['land','--signer','local'],1);assert.match(miss.stderr,/missing.*keys\/device/);assert.equal(existsSync(join(absent,'.bound/ledger')),false);
 for(const [label,code,pattern]of[['exit',"process.stdout.write('SECRET_OUTPUT');process.stderr.write('SECRET_ERROR');process.exit(7)",/status=7/],['timeout','setInterval(()=>{},100)',/timeout/],['malformed',"process.stdout.write('SECRET_OUTPUT\\n')",/invalid response/],['partial',"process.stdout.write('bound-lock/1 by=device sig=bad\\n')",/invalid response/]]){
  writeFileSync(registry,JSON.stringify({local:{kind:'command',executable:process.execPath,args:['--eval',code]}}));const beforeHash=hash();const p=run(remote,label,['land','--key','device','--signer','local',draft],1);assert.match(p.stderr,pattern);assert.ok(!(p.stdout+p.stderr).includes('SECRET'));assert.equal(hash(),beforeHash);
 }
 writeFileSync(registry,JSON.stringify({local:good}));run(remote,'selection conflict',['sign','--signer','file',draft],1);run(remote,'retired inert out refuses',['sign','--out','ignored',draft],2);
 const invalid=join(temp,'invalid.proposal');writeFileSync(invalid,row('sample/valid','id','yes')+'\n'+row('sample/unknown','id','yes').replace('bound-lock/1','bound-lock/0')+'\n');
 const invalidBefore=hash();const refused=run(remote,'unknown wire row refuses whole lot',['land','--signer','local',invalid],1);assert.match(refused.stderr,/version this reader does not know/);assert.equal(hash(),invalidBefore);assert.equal(refused.stdout,'');
 report.complete=true;report.fileCommandIdentical=true;report.oneInvocationPerLot=true;report.failureAtomic=true;
}finally{rmSync(temp,{recursive:true,force:true});}

});
