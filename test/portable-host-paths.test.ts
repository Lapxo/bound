import test from 'node:test';
import assert from 'node:assert/strict';
import {win32,posix,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {insideDirectory,relativeCoordinate} from '../src/host/paths.ts';
import {roleAt,roleClaimsOf,canonical} from '@lapxo/topos/wire';
import {nativeHostInstrument} from '../src/host/native-receiver.ts';

const cases:readonly [string,string,typeof win32,boolean][]=[
 ['C:\\Work\\Bound','C:\\Work\\Bound\\dist\\entry.js',win32,true],
 ['C:\\Work\\Bound','C:\\Work\\outside\\entry.js',win32,false],
 ['C:\\Work\\Bound','C:\\Work\\Bound-other\\entry.js',win32,false],
 ['C:\\Work\\Bound','D:\\Work\\Bound\\entry.js',win32,false],
 ['C:\\Work\\Bound','C:\\Work\\Bound\\..cache\\entry.js',win32,true],
 ['C:\\Work\\Bound','C:\\Work\\Bound',win32,false],
 ['C:\\Work\\Bound','C:relative.js',win32,false],
 ['C:\\','C:\\entry.js',win32,true],
 ['C:\\Program Files\\Bound','C:\\Program Files\\Bound\\fuente ñ\\entry.js',win32,true],
 ['\\\\server\\share\\Bound','\\\\server\\share\\Bound\\dist\\entry.js',win32,true],
 ['\\\\server\\share\\Bound','\\\\server\\other\\entry.js',win32,false],
 ['\\\\server\\share\\Bound','\\\\other\\share\\Bound\\entry.js',win32,false],
 ['\\\\?\\C:\\Bound','\\\\?\\C:\\Bound\\entry.js',win32,true],
 ['/work/bound','/work/bound/dist/entry.js',posix,true],
 ['/work/bound','/work/outside/entry.js',posix,false],
 ['/work/bound','/work/bound-other/entry.js',posix,false],
 ['/work/bound','/work/bound/..cache/entry.js',posix,true],
 ['/work/bound','/work/bound',posix,false],
 ['/work/bound','relative.js',posix,false],
];
for(const [index,[root,path,syntax,expected]]of cases.entries())test('host directory containment '+index,()=>assert.equal(insideDirectory(root,path,syntax),expected));

test('Windows parent escape reproduces the old native-program predicate defect',()=>{
 const root='C:\\Work\\Bound',path='C:\\Work\\outside\\entry.js',step=win32.relative(root,path);
 assert.equal(step,'..\\outside\\entry.js');
 const oldAccepted=!(step==='..'||step.startsWith('../')||win32.isAbsolute(step));
 assert.equal(oldAccepted,true);assert.equal(insideDirectory(root,path,win32),false);
});

test('physical paths become wire coordinates before selecting a top-level region',()=>{
 for(const [syntax,root,path]of [[win32,'C:\\Work\\Bound','C:\\Work\\Bound\\src\\reader.js'],[posix,'/work/bound','/work/bound/src/reader.js']]as const){
  const coordinate=relativeCoordinate(root,path,syntax);assert.equal(coordinate,'src/reader.js');assert.equal(coordinate.split('/')[0],'src');
 }
 assert.equal(win32.relative('C:\\Work\\Bound','C:\\Work\\Bound\\src\\reader.js').split('/')[0],'src\\reader.js');
});

test('root equality is an explicit caller choice',()=>{
 assert.equal(insideDirectory('C:\\Bound','C:\\Bound',win32,true),true);
 assert.equal(insideDirectory('/bound','/bound',posix,true),true);
});

test('Windows URL conversion preserves spaces, percent, hash, Unicode and UNC',()=>{
 for(const name of ['C:\\Program Files\\Bound\\é # 100%.js','\\\\server\\share\\with spaces\\é.js']){
  assert.equal(fileURLToPath(pathToFileURL(name,{windows:true}),{windows:true}),win32.resolve(name));
 }
});

test('actual public instrument metadata accepts a legal dot-prefixed child and rejects a sibling',()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-paths-')),root=join(temp,'instrument with spaces é'),directory=join(root,'..runtime'),entry=join(directory,'entry.js'),outside=join(temp,'outside.js');
 try{
  mkdirSync(directory,{recursive:true});writeFileSync(join(root,'TARGET.bound'),canonical({scope:'wire/families',role:'writes',form:'alphabet',measure:'id',value:'view',by:'target'})+'\n');writeFileSync(entry,'export const fixture=true;\n');writeFileSync(outside,'export const fixture=false;\n');
  const result=nativeHostInstrument(resolve(root),resolve(entry));assert.equal(result.runtime.root,realpathSync(root));assert.equal(result.runtime.entry,realpathSync(entry));
  assert.throws(()=>nativeHostInstrument(resolve(root),resolve(outside)),error=>error instanceof Error&&'code'in error&&error.code==='host/context');
 }finally{rmSync(temp,{recursive:true,force:true});}
});

test('Windows physical paths retain the selected coordinate-role boundary',()=>{
 const root='C:\\Work\\Bound',file='C:\\Work\\Bound\\vendor\\tool\\entry.js';
 const claims=roleClaimsOf([{scope:'coordinate-role/vendor',measure:'role',value:'foreign'}]);
 assert.equal(roleAt(win32.relative(root,file),claims),'source');
 assert.equal(roleAt(relativeCoordinate(root,file,win32),claims),'foreign');
});
