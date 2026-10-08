import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical} from '@lapxo/topos/wire';

for(const name of ['sowing','calibration'])test(`an admitted new ${name} demand remains owed without invented sources or payment`,()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-new-demand-')),root=join(temp,'place');mkdirSync(root);
 const pair=generateKeyPairSync('ed25519'),key=join(temp,'device.pem');writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 const row=(scope:string,measure:string,value:string,extra:Record<string,string>={})=>canonical({scope,measure,value,role:'writes',form:'alphabet',at:'policy:sample',by:'target',...extra});
 const run=(args:string[])=>spawnSync(process.execPath,[new URL('../dist/cli/verb.js',import.meta.url).pathname,...args],{cwd:root,encoding:'utf8',timeout:20000});
 try{
  const seed=[row('keys/device','class','authorize'),row('keys/device','coverage','*'),row('keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/device','signer','file'),row('keys/reader','class','read'),row('keys/folder','class','fold'),row('signer/timeout','milliseconds','5000..5000',{form:'interval'}),row('signer/response-bytes','bytes','65536..65536',{form:'interval'}),row('wire/digest-algorithms','id','sha256'),row('wire/signature-algorithms','id','ed25519:sample'),row('wire/era','id','sample'),row('wire/families','id','keys|signer|wire|tree|write|leaf|reader|read|fold|receipts|rendered|resolved|beat|requirement|view'),row('wire/fields','id','scope|role|form|measure|value|by|at|epoch|sig|needs|about'),row('wire/required','id','scope|role|form|measure|value|by|at'),row('wire/forms','id','alphabet|interval'),row('wire/roles','id','reads|writes|demands'),row('wire/at-classes','id','policy|origin|place|receipt|witness')];
  writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');let p=run(['land','--key','device','--key-file',key]);assert.equal(p.status,0,p.stderr);
  const proposal=join(temp,'requirement.txt');writeFileSync(proposal,row('requirement/'+name,'status','present',{role:'demands',needs:'missing/'+name+'.json'})+'\n');
  const before=readFileSync(join(root,'.bound/ledger/device.bound'),'utf8');p=run(['sign',proposal,'--key','device','--key-file',key]);assert.equal(p.status,0,p.stderr);assert.equal(readFileSync(join(root,'.bound/ledger/device.bound'),'utf8'),before,'sign is prospective');
  p=run(['land',proposal,'--key','device','--key-file',key]);assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/OWED.*new demand declared/);assert.doesNotMatch(p.stdout,/FACT.*take requirement/);assert.ok(!existsSync(join(root,'missing')));
  const judge=join(root,'.bound/ledger/judge.bound');assert.ok(!existsSync(judge)||!readFileSync(judge,'utf8').includes('scope=requirement/'+name),'no payment receipt');
  const ledger=readFileSync(join(root,'.bound/ledger/device.bound'),'utf8');assert.match(ledger,new RegExp('scope=requirement/'+name));
  writeFileSync(proposal,row('requirement/'+name,'status','present',{role:'demands',needs:'missing/revised.json',at:'witness:revision'})+'\n');p=run(['sign',proposal,'--key','device','--key-file',key]);assert.notEqual(p.status,0,'existing demand revision still needs its witness');assert.equal(readFileSync(join(root,'.bound/ledger/device.bound'),'utf8'),ledger);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
