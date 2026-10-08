import {test} from 'node:test';
import {strictEqual,deepStrictEqual,match} from 'node:assert';
import {mkdtempSync,cpSync,rmSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

const reader=new URL('../src/cli/verb.ts',import.meta.url).pathname;
for(const name of ['typed','artifacts'])test(`formed ${name} place: native fold, verified inputs, no signer and receipt reuse`,()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-formed-')),root=join(temp,'place');
 try{
  cpSync(new URL(`../samples/${name}`,import.meta.url),root,{recursive:true});
  const target=readFileSync(join(root,'TARGET.bound'),'utf8');
  const run=()=>spawnSync(process.execPath,[reader,root],{cwd:temp,encoding:'utf8',timeout:15000});
  const first=run();strictEqual(first.status,0,first.stderr);
  const cells=(text:string)=>text.split('\n').filter(l=>l.startsWith('CELL ')).map(l=>JSON.parse(l.slice(5)));
  const output=cells(first.stdout);strictEqual(output.length,4);strictEqual(output.find(c=>c.cell==='C').state,'FREE');
  deepStrictEqual(output.find(c=>c.cell==='B').ownMarks,['s-B','j-B','r-B']);
  strictEqual(readFileSync(join(root,'TARGET.bound'),'utf8'),target);
  const second=run();strictEqual(second.status,0,second.stderr);deepStrictEqual(cells(second.stdout),output);
  match(second.stdout,/RECEIPTS 4 read · 0 opened · idle · provider 0/);
  strictEqual(readdirSync(root).some(f=>f.endsWith('.pem')),false);
  const input=join(root,'fixtures/history.txt'),original=readFileSync(input);
  writeFileSync(input,Buffer.concat([original,Buffer.from('\n')]));
  const corrupted=run();strictEqual(corrupted.status,1);match(corrupted.stderr,/REFUSE·history fixtures\/history.txt input digest/);
  writeFileSync(input,original);
  const pin=target.split('\n').find(l=>l.includes('scope=uses/sample '))?.match(/value=sha256:([a-f0-9]+)/)?.[1];
  if(!pin)throw Error('sample has no selected standing');
  const artifact=join(root,'fixtures',pin);
  writeFileSync(artifact,Buffer.concat([readFileSync(artifact),Buffer.from('\n')]));
  const invalid=run();strictEqual(invalid.status,1);match(invalid.stderr,/REFUSE·pin .*content hash mismatch/);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
