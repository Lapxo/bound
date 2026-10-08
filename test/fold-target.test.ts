import {test} from 'node:test';
import {strictEqual,match,deepStrictEqual} from 'node:assert';
import {mkdtempSync,writeFileSync,readdirSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const reader=new URL('../src/cli/verb.ts',import.meta.url).pathname;
test('a named invalid fold input refuses without silently folding its containing place',()=>{
 for(const name of ['one','two']){
  const root=mkdtempSync(join(tmpdir(),'bound-fold-target-'));
  try{
   writeFileSync(join(root,'TARGET.bound'),'');
   writeFileSync(join(root,name+'.json'),'{}');
   mkdirSync(join(root,'empty'));
   const before=readdirSync(root).sort();
   for(const args of [['fold',name+'.json'],['fold','missing.bound'],['fold','empty'],['empty'],[name+'.json'],['fold','.','.']]){
    const target=args.at(-1)!;
    const got=spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:10000});
    strictEqual(got.status,1,got.stderr);match(got.stderr,/REFUSE·target/);
    match(got.stderr,new RegExp(target.replace('.','\\.')));
    strictEqual(got.stdout,'');deepStrictEqual(readdirSync(root).sort(),before);
   }
  }finally{rmSync(root,{recursive:true,force:true});}
 }
});
