import assert from 'node:assert/strict';import{mkdtempSync,mkdirSync,writeFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{spawnSync}from'node:child_process';
import {test} from 'node:test';
import {runTypedSample} from '../samples/readers/run-typed.mjs';

test('typed sample lands from a new standing closure and prints object states through the installed-compatible CLI',()=>{
  runTypedSample(process.env.BOUND_TEST_READER ?? new URL('../dist/cli/verb.js',import.meta.url).pathname,process.env.BOUND_TEST_CAPTURE);
});

test('a repository-artifact place uses the same object contract with a different selected codec',()=>{
  const capture=process.env.BOUND_TEST_CAPTURE?.replace(/\.json$/,'.artifacts.json');
  runTypedSample(process.env.BOUND_TEST_READER ?? new URL('../dist/cli/verb.js',import.meta.url).pathname,capture,'artifacts.json');
});

for (const fails of [false,true]) test('public sample releases all temporary content after '+(fails?'preparation failure':'independent clients close'),()=>{
 const dir=mkdtempSync(join(tmpdir(),'sample-lifetime-test-')),source=join(dir,'source'),scratch=join(dir,'scratch');
 try{
  mkdirSync(join(source,'dist/observe'),{recursive:true});mkdirSync(join(source,'dist/cli'),{recursive:true});mkdirSync(join(source,'vendor/syntax'),{recursive:true});mkdirSync(join(source,'docs/contracts'),{recursive:true});mkdirSync(scratch);
  writeFileSync(join(source,'package.json'),'{"type":"module"}');writeFileSync(join(source,'dist/observe/runner.js'),'export const ownLock=()=>[];export const ownStore=()=>"not-read";');writeFileSync(join(source,'dist/cli/verb.js'),'// immutable sample entry\n');writeFileSync(join(source,'vendor/syntax/parser.js'),'// immutable sample dependency\n');
  if(!fails)writeFileSync(join(source,'docs/contracts/refusals.bound'),'');
  const helper=new URL('../samples/readers/public-instrument.mjs',import.meta.url).href;
  const code=`import assert from 'node:assert/strict';import{existsSync,readdirSync}from'node:fs';const{publicInstrument}=await import(${JSON.stringify(helper)});const entry=${JSON.stringify(join(source,'dist/cli/verb.js'))};if(${fails}){await assert.rejects(publicInstrument(entry));}else{const first=await publicInstrument(entry),second=await publicInstrument(entry);assert.notEqual(first.reader,second.reader);first.close();assert.equal(existsSync(first.reader),false);assert.equal(existsSync(second.reader),true);second.close();second.close();}assert.deepEqual(readdirSync(${JSON.stringify(scratch)}),[]);`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TMPDIR:scratch,TMP:scratch,TEMP:scratch},encoding:'utf8',timeout:25000,maxBuffer:1048576});assert.equal(result.status,0,result.stderr+result.stdout);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
