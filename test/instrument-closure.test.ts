import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,symlinkSync,writeFileSync,statSync,utimesSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {test} from 'node:test';
import {canonical} from '@lapxo/topos/wire';
import {instrumentCoordinates,instrumentDigest,instrumentOf} from '../src/fold/digests.ts';
import {captureViewInputs} from '../src/host/reading-context.ts';
import {withoutEffects} from '../src/host/read-only.ts';

test('captured import reuse still binds exact bytes, formats and changed dependencies',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'bound-captured-imports-'))),store=join(root,'.bound');
 try{
  writeFileSync(join(root,'TARGET.bound'),canonical({scope:'wire/digest-algorithms',role:'writes',form:'alphabet',measure:'id',value:'sha256',by:'target',at:'policy:wire'})+'\n');
  const entry=join(root,'entry.js'),one=join(root,'one.js'),two=join(root,'two.js');
  writeFileSync(entry,'export {value} from "./one.js";\n');
  utimesSync(entry,1700000000,1700000000);
  for(const file of [one,two])writeFileSync(file,'export const value=1;\n');
  const fresh=(file=entry)=>captureViewInputs({bytes:1048576,files:32},()=>withoutEffects(()=>[...instrumentCoordinates(store,file,[],root,[],true)]));
  fresh();const before=fresh();assert.deepEqual(fresh(),before);
  mkdirSync(join(store,'cas'),{recursive:true});writeFileSync(join(store,'cas','stamps.bound'),'forged private import hints\n');
  assert.deepEqual(fresh(),before,'private hints do not supply captured imports');
  const stamp=statSync(entry);writeFileSync(entry,'export {value} from "./two.js";\n');utimesSync(entry,stamp.atime,stamp.mtime);
  const restored=statSync(entry);assert.deepEqual([restored.ino,restored.size,restored.mtimeMs],[stamp.ino,stamp.size,stamp.mtimeMs]);
  const after=fresh();assert.notDeepEqual(after.inputs,before.inputs);
  assert(after.value.some(([name])=>name===two));assert(!after.value.some(([name])=>name===one));
  writeFileSync(two,'export const value=2;\n');assert.notDeepEqual(fresh(),after,'descendant bytes remain consumed');
  const typed=join(root,'typed.ts'),plain=join(root,'plain.js');
  for(const file of [typed,plain])writeFileSync(file,'export const value: number=1;\n');
  fresh(typed);assert.throws(()=>fresh(plain),/module syntax/,'equal bytes in a different syntax format are checked separately');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('a place-relative instrument entry is anchored to the selected place without losing imports',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-entry-anchor-'));
 try{
  const store=join(root,'.bound');
  writeFileSync(join(root,'TARGET.bound'),canonical({scope:'wire/digest-algorithms',role:'writes',form:'alphabet',measure:'id',value:'sha256',by:'target',at:'policy:wire'})+'\n');
  mkdirSync(join(root,'modules'));
  const entry=join(root,'modules','entry.js'),child=join(root,'modules','child.js');
  writeFileSync(entry,'export {value} from "./child.js";\n');writeFileSync(child,'export const value=1;\n');
  const short=(value:string)=>value.replace(/^[^:]*:/,'').slice(0,12);
  const first=short(instrumentDigest(store,entry,[],root));
  assert.equal(instrumentOf(store,'modules/entry.js',[],root),first);
  assert.equal(instrumentOf(store,relative(process.cwd(),entry)),first,'omitting root retains the existing cwd-relative entry contract');
  assert.equal(instrumentCoordinates(store,entry,[],root).size,2);
  writeFileSync(child,'export const value=200;\n');
  const second=instrumentOf(store,'modules/entry.js',[],root);
  assert.notEqual(second,first,'import changes still invalidate the instrument identity');
  assert.equal(second,short(instrumentDigest(store,entry,[],root)));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('implementation identity follows compiled imports, package exports and declared subprocesses, independently of location', () => {
  const root=mkdtempSync(join(tmpdir(),'bound-implementation-'));
  try {
    const store=join(root,'.bound');
    const wire=canonical({scope:'wire/digest-algorithms',role:'writes',form:'alphabet',measure:'id',value:'sha256',by:'target',at:'policy:wire'});
    writeFileSync(join(root,'TARGET.bound'),wire+'\n');
    mkdirSync(join(root,'node_modules','fixture-provider'),{recursive:true});
    writeFileSync(join(root,'node_modules','fixture-provider','package.json'),'{"type":"module","exports":"./index.js"}');
    const provider=join(root,'node_modules','fixture-provider','index.js');
    writeFileSync(provider,'export const value=1;\n');
    writeFileSync(join(root,'entry.js'),`import "node:fs"; export {value} from "fixture-provider"; import("./helper.js"); const record={scope: 'receipts/import', role: 'writes'}; const text="import 'missing-string'"; const pattern=/import 'missing-regex'/; // import 'missing-comment'
`);
    writeFileSync(join(root,'helper.js'),'export const helper=1;\n');
    writeFileSync(join(root,'worker.js'),'export const worker=1;\n');
    const process=canonical({scope:'process/test',kind:'process',role:'writes',form:'alphabet',measure:'id',value:'present',needs:'worker.js',by:'target',at:'policy:process'});
    const digest=()=>instrumentDigest(store,join(root,'entry.js'),[],root,[process]);
    const first=digest();
    writeFileSync(provider,'export const value=200;\n');
    const second=digest(); assert.notEqual(second,first,'bare compiled imports must be measured');
    writeFileSync(join(root,'worker.js'),'export const worker=200;\n');
    const third=digest(); assert.notEqual(third,second,'a declared child process is implementation');
    writeFileSync(join(root,'helper.js'),'export const helper=200;\n');
    assert.notEqual(digest(),third,'a literal dynamic import is implementation');
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('implementation follows loader aliases without merging distinct equal-byte modules', () => {
  const root=mkdtempSync(join(tmpdir(),'bound-module-alias-'));
  try {
    const store=join(root,'.bound');
    writeFileSync(join(root,'TARGET.bound'),canonical({scope:'wire/digest-algorithms',role:'writes',form:'alphabet',measure:'id',value:'sha256',by:'target',at:'policy:wire'})+'\n');
    mkdirSync(join(root,'modules'));
    writeFileSync(join(root,'modules','one.js'),'export const value=1;\n');
    symlinkSync(join(root,'modules'),join(root,'alias'),'dir');
    const entry=join(root,'entry.js');
    writeFileSync(entry,'import "./modules/one.js"; import "./alias/one.js";\n');
    assert.equal(instrumentCoordinates(store,entry,[],root).size,2);
    writeFileSync(join(root,'modules','two.js'),'export const value=1;\n');
    writeFileSync(entry,'import "./modules/one.js"; import "./modules/two.js";\n');
    assert.equal(instrumentCoordinates(store,entry,[],root).size,3);
  } finally {rmSync(root,{recursive:true,force:true});}
});
