import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,rmSync,symlinkSync} from 'node:fs';
import{join,dirname}from'node:path';import{tmpdir}from'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('standard compiler changes executable imports, never data or calculated loading ports',()=>{
 const input=`import {value} from './fixed.js'; export * from './fixed.js'; const message='fixed/module'; const late=name=>import(name); const literal=()=>import('./fixed.js'); console.log(message,late,literal,value);`;
 const result=execFileSync(require.resolve('esbuild/bin/esbuild'),['--format=esm','--target=es2022','--minify','--tsconfig-raw={"compilerOptions":{}}'],{input,encoding:'utf8'});
 assert.match(result,/from["']\.\/fixed\.js["']/);assert.match(result,/import\(["']\.\/fixed\.js["']\)/);assert.ok(result.includes('fixed/module'));assert.match(result,/=>import\([a-z]+\)/);
});
test('public declarations use delivered types and no external package type imports',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const roots=new Set<string>([pkg.types]);const collect=(x:unknown)=>{if(!x||typeof x!=='object')return;for(const[k,v]of Object.entries(x)){if(k==='types'&&typeof v==='string')roots.add(v);else collect(v)}};collect(pkg.exports);
 for(const file of roots){const text=readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.doesNotMatch(text,/(?:from\s*|import\()["']@lapxo\/(?:topos|obligations)/);}
});

test('one standard type check covers every declaration and rejects an invalid public type',()=>{
 const root=mkdtempSync(join(tmpdir(),'declaration-check-'));
 try{
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')),commands=pkg.scripts.build.split(' && ').filter((c:string)=>c.startsWith('node node_modules/typescript/bin/tsc --noEmit '));assert.equal(commands.length,1);
  const args=commands[0].split(' ').slice(2),files=args.filter((a:string)=>a.endsWith('.d.ts'));assert.equal(files.length,12);assert.ok(args.includes('--strict'));assert.ok(commands[0].includes('--skipLibCheck false'));
  for(const file of files){mkdirSync(dirname(join(root,file)),{recursive:true});cpSync(new URL('../'+file,import.meta.url),join(root,file))}
  writeFileSync(join(root,'package.json'),'{"type":"module"}\n');symlinkSync(new URL('../node_modules',import.meta.url).pathname,join(root,'node_modules'),'dir');
  const check=()=>spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),...args],{cwd:root,encoding:'utf8',timeout:10000});let result=check();assert.equal(result.status,0,result.stdout+result.stderr);
  const selected=files.find((f:string)=>f.startsWith('dist/'))!;writeFileSync(join(root,selected),readFileSync(join(root,selected),'utf8')+'\nexport type InvalidPublicType = __UnboundPublicType__;\n');result=check();assert.notEqual(result.status,0);assert.match(result.stdout+result.stderr,/__UnboundPublicType__/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
