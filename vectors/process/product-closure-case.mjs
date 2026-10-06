import {canonical} from '@lapxo/topos/wire';
import{spawnSync}from'node:child_process';import{mkdtempSync,writeFileSync,rmSync,mkdirSync}from'node:fs';import{tmpdir}from'node:os';import{join,resolve}from'node:path';import{generateKeyPairSync}from'node:crypto';
const reader=resolve(process.argv[2]),mode=process.argv[3],temporary=mkdtempSync(join(tmpdir(),'bound-product-vector-')),root=join(temporary,'place');mkdirSync(root);
function run(args){const result=spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:15000});if(result.error||result.signal||result.status===null)throw result.error??Error(result.signal??'no status');process.stdout.write(result.stdout);process.stderr.write(result.stderr);return result.status;}
try {
 if(mode==='stranger'){
  writeFileSync(join(root,'TARGET.bound'),'bound-lock/1 at=policy:fixture by=target form=alphabet measure=id role=writes scope=uses/world value=sha256:'+ '0'.repeat(64)+'\n'+'bound-lock/1 at=policy:fixture by=target form=alphabet measure=id needs=README.md role=demands scope=view/page shape=README.md value=hero@0\n');
  writeFileSync(join(root,'README.md'),'A fresh place, without observations.\n');process.exitCode=run(['fold']);
 } else if(mode==='closed'){
  const pair=generateKeyPairSync('ed25519'),key=join(temporary,'device.pem');writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}));
  const declarations=[['keys/device','class','authorize'],['keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')],['keys/device','coverage','*'],['wire/digest-algorithms','id','sha256'],['wire/signature-algorithms','id','ed25519:fixture'],['wire/era','id','fixture'],['wire/families','id','audit|beat|block|cites|comments|concept|cost|dep|effect|fold|hazard|keys|law|license|lines|literal|offers|question|reader|region|release|render|roles|sample|session|take|test|tree|vector|view|write']];
  for(const role of ['read','fold']) declarations.push([`keys/device-${role}`,'class',role],[`keys/device-${role}`,'coverage','*'],[`keys/device-${role}`,'public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')]);
  writeFileSync(join(root,'TARGET.bound'),[...declarations.map(([scope,measure,value])=>canonical({at:'policy:fixture',by:'target',form:'alphabet',measure,role:'writes',scope,value})),canonical({at:'policy:fixture',by:'target',form:'alphabet',measure:'digest',role:'writes',scope:'uses/wire',value:'sha256:a717c60945add1facfd822b3ee2da73a8fa2f781dd0aa2de9be778e66b8f3591'}),canonical({at:'policy:fixture',by:'target',form:'alphabet',measure:'id',role:'demands',scope:'view/receipts',needs:'receipts.bound',shape:'receipts.bound',value:'receipts@8|receipts@0|receipts@1'})].join('\n')+'\n');
  const admitted=run(['land','--key','device','--key-file',key]);const folded=admitted===0?run(['fold']):admitted;process.exitCode=folded===0?run(['fold','--check']):folded;
 } else throw Error('unknown product case');
}finally{rmSync(temporary,{recursive:true,force:true});}
