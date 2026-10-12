import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical} from '@lapxo/topos/wire';

for(const name of ['orchard','catalog'])test(`a first native judgment on vouched ${name} bytes lands once without movement`,()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-new-demand-')),root=join(temp,'place');mkdirSync(root);
 const pair=generateKeyPairSync('ed25519'),key=join(temp,'device.pem');writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 const row=(scope:string,measure:string,value:string,extra:Record<string,string>={})=>canonical({scope,measure,value,role:'writes',form:'alphabet',at:'policy:sample',by:'target',...extra});
 const run=(args:string[])=>spawnSync(process.execPath,[new URL('../dist/cli/verb.js',import.meta.url).pathname,...args],{cwd:root,encoding:'utf8',timeout:20000});
 try{
  const seed=[row('wire/templates','id','{roots}|{cone}'),row('wire/states','id','absent|present|unread|withdraw'),row('keys/device','class','authorize'),row('keys/device','coverage','*'),row('keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/device','signer','file'),row('keys/reader','class','read'),row('keys/folder','class','fold'),row('signer/timeout','milliseconds','5000..5000',{form:'interval'}),row('signer/response-bytes','bytes','65536..65536',{form:'interval'}),row('wire/digest-algorithms','id','sha256'),row('wire/signature-algorithms','id','ed25519:sample'),row('wire/era','id','sample'),row('wire/families','id','keys|signer|wire|tree|write|leaf|reader|read|fold|receipts|rendered|resolved|beat|requirement|view'),row('wire/fields','id','scope|role|form|measure|value|by|at|epoch|sig|needs|about'),row('wire/required','id','scope|role|form|measure|value|by|at'),row('wire/forms','id','alphabet|interval'),row('wire/roles','id','reads|writes|demands'),row('wire/at-classes','id','policy|origin|place|receipt|witness')];
  mkdirSync(join(root,'samples/yes'),{recursive:true});
  writeFileSync(join(root,'samples/yes/case.json'),'{}\n');
  const demand=row('requirement/'+name,'status','present',{role:'demands',needs:'samples/yes/case.json'});
  writeFileSync(join(root,'TARGET.bound'),[...seed,demand].join('\n')+'\n');
  let p=run(['land','--key','device','--key-file',key]);assert.equal(p.status,0,p.stderr);
  const proposal=join(temp,'requirement.txt');writeFileSync(proposal,demand+'\n');
  p=run(['land',proposal]);assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/FACT.*take requirement/);assert.match(p.stdout,/MOVED +0 sources/);
  const judge=join(root,'.bound/ledger/judge.bound'),before=readFileSync(judge,'utf8');
  assert.match(before,/measure=cone .*value=samples\/yes\/case.json/,'unchanged first judgment retains a nonempty measured cone');
  p=run(['land',proposal]);assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/every demand of it paid/);assert.equal(readFileSync(judge,'utf8'),before,'replay adds no judgment');
 }finally{rmSync(temp,{recursive:true,force:true});}
});
