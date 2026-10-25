import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';

test('compiled public APIs run with npm resolution denied and the same fixed loading refusals',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-vendor-consumer-'));
 try{
  cpSync(new URL('../dist/',import.meta.url),join(root,'dist'),{recursive:true});
  cpSync(new URL('../assets/',import.meta.url),join(root,'assets'),{recursive:true});
  mkdirSync(join(root,'vendor'),{recursive:true});
  cpSync(new URL('../vendor/',import.meta.url),join(root,'vendor'),{recursive:true});
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.dependencies,undefined,'the installed package must not request runtime npm dependencies');
  delete pkg.devDependencies;writeFileSync(join(root,'package.json'),JSON.stringify(pkg));
  writeFileSync(join(root,'consumer.js'),`import {registerHooks} from 'node:module';
import assert from 'node:assert/strict';import{createHash}from'node:crypto';
registerHooks({resolve(name,context,next){if(!name.startsWith('node:')&&!name.startsWith('.')&&!name.startsWith('file:')&&name!=='@lapxo/bound'&&!name.startsWith('@lapxo/bound/'))throw Error('external package resolution denied: '+name);return next(name,context)}});
const engine=await import('@lapxo/bound/engine'),host=await import('@lapxo/bound/host'),reference=await import('@lapxo/bound/reference/native'),closure=await import('@lapxo/bound/closure/native'),wasm=await import('@lapxo/bound/wasm');
assert.equal(typeof engine.objectFold,'function');assert.equal(typeof host.prepareNativeReadingIdentity,'function');assert.equal(typeof reference.inspectReference,'function');assert.equal(typeof wasm.evaluateWasm,'function');
const sha=s=>'sha256:'+createHash('sha256').update(s).digest('hex'),limits={members:200,bytes:1000000,responseBytes:3000000};
for(const source of ['globalThis.effect=1; if(false) import(target);','globalThis.effect=1; const late=()=>require("fs");','globalThis.effect=1; const late=()=>import(target);']){
 const snapshot={identity:sha('snapshot'),entry:'entry.js',members:new Map([['entry.js',{source,digest:sha(source)}]])};
 assert.throws(()=>closure.deliverModuleClosure(['arbitrary/need'],new Map([['arbitrary/need',snapshot]]),()=>undefined,limits),/unresolved|CommonJS load/);assert.equal(globalThis.effect,undefined);
}
console.log('PASS public APIs; external package resolution denied; pre-execution negatives retained');`);
  const result=spawnSync(process.execPath,[join(root,'consumer.js')],{cwd:root,env:{PATH:process.env.PATH,NODE_PATH:'',NODE_OPTIONS:'',LANG:'C',LC_ALL:'C',TZ:'UTC'},encoding:'utf8',timeout:10_000});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS public APIs; external package resolution denied/);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('public declarations compile against delivered vendor types without npm runtime dependencies',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-vendor-types-'));
 try{
  cpSync(new URL('../dist/',import.meta.url),join(root,'dist'),{recursive:true});
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));delete pkg.devDependencies;
  writeFileSync(join(root,'package.json'),JSON.stringify(pkg));
  writeFileSync(join(root,'consumer.ts'),`import{objectFold,type ObjectRecord,type ObjectContext}from'@lapxo/bound/engine';
import{inspectReference}from'@lapxo/bound/reference/native';import{prepareNativeReadingIdentity}from'@lapxo/bound/host';
declare const records:readonly ObjectRecord[];declare const context:ObjectContext;
const projection=objectFold(records,context);const inspection=inspectReference('#bound:',[]);
const prepare:typeof prepareNativeReadingIdentity=prepareNativeReadingIdentity;
void projection;void inspection;void prepare;`);
  const require=createRequire(import.meta.url),types=dirname(dirname(require.resolve('@types/node/package.json')));
  const result=spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'--noEmit','--strict','--target','es2022','--module','nodenext','--moduleResolution','nodenext','--types','node','--typeRoots',types,join(root,'consumer.ts')],{cwd:root,encoding:'utf8',timeout:10_000});
  assert.equal(result.status,0,result.stdout+result.stderr);
 }finally{rmSync(root,{recursive:true,force:true})}
});
