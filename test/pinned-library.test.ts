import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync,cpSync,symlinkSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {canonical} from '@lapxo/topos/wire';
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

// Exercise the real instrument entry: catalog blobs must stay unopened, while a
// selected mount still requires its exact archive instead of Node's local copy.
for(const [missing,renamed,escaped] of [[false,false,false],[true,false,false],[false,true,false],[false,true,true]])test(`provide opens only mounted libraries; missing=${missing}, renamed metadata=${renamed}, escaped entry=${escaped}`,()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-provide-'));
 try{
  const instrument=join(temp,'instrument'),library=join(temp,'library');mkdirSync(instrument);mkdirSync(library);
  cpSync(new URL('../src/',import.meta.url),join(instrument,'src'),{recursive:true});
  mkdirSync(join(instrument,'node_modules/@lapxo'),{recursive:true});
  for(const pkg of ['@lapxo/topos','@lapxo/obligations','acorn'])symlinkSync(new URL('../node_modules/'+pkg,import.meta.url).pathname,join(instrument,'node_modules',pkg),'dir');
  writeFileSync(join(instrument,'package.json'),'{"type":"module"}');
  writeFileSync(join(library,'package.json'),JSON.stringify({name:'fixture-selected-library',type:'module',exports:{'.':'./index.js'}}));
  writeFileSync(join(library,'index.js'),'export const value=31;');writeFileSync(join(library,'private.js'),'export const hidden=99;');
  cpSync(library,join(instrument,'node_modules/fixture-selected-library'),{recursive:true});
  if(renamed)writeFileSync(join(instrument,'node_modules/fixture-selected-library/package.json'),JSON.stringify({name:'forged-routing-name',type:'module',exports:{'.':'./index.js'}}));
  if(escaped){const outside=join(temp,'outside.mjs');writeFileSync(outside,'console.log("UNVERIFIED OUTSIDE EXECUTED");export const value=99;');rmSync(join(instrument,'node_modules/fixture-selected-library/index.js'));symlinkSync(outside,join(instrument,'node_modules/fixture-selected-library/index.js'));}
  const archive=join(temp,'library.tgz'),packed=spawnSync('tar',['-czf',archive,'-C',library,'.']);assert.equal(packed.status,0,String(packed.stderr));
  const bytes=readFileSync(archive),digest='sha256:'+createHash('sha256').update(bytes).digest('hex'),catalog='sha256:'+'a'.repeat(64);
  const row=(scope:string,value:string,extra:Record<string,string>={})=>canonical({scope,value,role:'writes',form:'alphabet',measure:'id',at:'policy:fixture',by:'target',...extra});
  writeFileSync(join(instrument,'TARGET.bound'),[
   row('audit/wire/pin-shape','package'),
   row('dep/inactive-catalog',catalog,{role:'reads'}),
   row('dep/selected',digest,{role:'reads',needs:'node_modules/fixture-selected-library'}),
  ].join('\n')+'\n');
  const cas=join(instrument,'.bound/cas/blobs');mkdirSync(cas,{recursive:true});
  writeFileSync(join(cas,catalog.slice(7)),'corrupt catalog bytes that must not be opened');
  if(!missing)writeFileSync(join(cas,digest.slice(7)),bytes);
  const entry=join(instrument,'src/cli/provide-fixture.ts');
  writeFileSync(entry,`import assert from 'node:assert/strict';import {provide,pinPlace} from '../host/provide.ts';
   ${missing?`provide();console.log('UNUSED MISSING LIBRARY DID NOT OPEN');await assert.rejects(import('fixture-selected-library'),/REFUSE·pin declared library unavailable selected/);`:`provide();assert.equal((await import('fixture-selected-library')).value,31);${renamed?"await assert.rejects(import('forged-routing-name'),/selected library name differs/);":''}await assert.rejects(import('fixture-selected-library/private.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});assert.throws(()=>pinPlace('inactive-catalog'),/does not name its available bytes/);`}
   assert.equal(typeof(await import('acorn')).parse,'function');console.log('PROVIDE VERIFIED');`);
  const got=spawnSync(process.execPath,[entry],{encoding:'utf8'});assert.equal(got.status,0,got.stdout+got.stderr);assert.match(got.stdout,/PROVIDE VERIFIED/);assert.doesNotMatch(got.stdout,/UNVERIFIED OUTSIDE EXECUTED/);
 }finally{rmSync(temp,{recursive:true,force:true})}
});
