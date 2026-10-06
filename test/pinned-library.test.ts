import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {resolvePinned} from '../src/host/provide.ts';

test('a digest-laid package without exports loads its declared main and subpaths',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-library-'));
 try {
  mkdirSync(join(root,'lib'));
  writeFileSync(join(root,'package.json'),JSON.stringify({name:'fixture-library',main:'lib/entry.cjs'}));
  writeFileSync(join(root,'lib/entry.cjs'),'module.exports={value:17};');
  writeFileSync(join(root,'lib/extra.cjs'),'module.exports={value:23};');
  const pin={at:root,pkg:'fixture-library',json:pathToFileURL(join(root,'package.json')).href,exports:false};
  const hook=registerHooks({resolve(specifier,context,next){return specifier==='fixture-library'||specifier.startsWith('fixture-library/')?resolvePinned(specifier,context,next,pin):next(specifier,context);}});
  try {
   assert.equal((await import('fixture-library')).default.value,17);
   assert.equal((await import('fixture-library/lib/extra.cjs')).default.value,23);
   assert.throws(()=>resolvePinned('fixture-library/../outside',{},()=>({url:''}),pin),/REFUSE·pin/);
  } finally {hook.deregister();}
 } finally {rmSync(root,{recursive:true,force:true});}
});
test('a package export map remains closed even when a private file exists',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-library-'));
 try {
  writeFileSync(join(root,'package.json'),JSON.stringify({name:'fixture-exports',type:'module',exports:{'.':'./entry.js'}}));
  writeFileSync(join(root,'entry.js'),'export const value=31;');writeFileSync(join(root,'private.js'),'export const value=99;');
  const pin={at:root,pkg:'fixture-exports',json:pathToFileURL(join(root,'package.json')).href,exports:true};
  const hook=registerHooks({resolve(specifier,context,next){return specifier==='fixture-exports'||specifier.startsWith('fixture-exports/')?resolvePinned(specifier,context,next,pin):next(specifier,context);}});
  try {assert.equal((await import('fixture-exports')).value,31);await assert.rejects(import('fixture-exports/private.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});} finally {hook.deregister();}
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('a package main cannot substitute a file outside its digest-laid tree',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-library-'));
 try {
  const at=join(root,'package');mkdirSync(at);
  writeFileSync(join(root,'outside.cjs'),'module.exports={value:99};');
  writeFileSync(join(at,'package.json'),JSON.stringify({name:'fixture-escape',main:'../outside.cjs'}));
  const pin={at,pkg:'fixture-escape',json:pathToFileURL(join(at,'package.json')).href,exports:false};
  assert.throws(()=>resolvePinned('fixture-escape',{},()=>({url:''}),pin),/REFUSE·pin library entry leaves its laid tree/);
 } finally {rmSync(root,{recursive:true,force:true});}
});
