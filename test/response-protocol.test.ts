import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runReader} from '../src/observe/run.ts';

test('reader host refuses a late response from an unsupported protocol before consuming claims',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-protocol-'));
 try{
  const source=join(root,'reader.js');writeFileSync(join(root,'package.json'),'{}');
  writeFileSync(source,`exports.observe=()=>[{scope:'example',role:'writes',measure:'count',bound:{kind:'interval',lo:0,hi:0}}];setImmediate(()=>process.stdout.write(JSON.stringify([{protocol:'bound-lock/99',kind:'fact',claims:[]}])+'\\n'));`);
  assert.throws(()=>runReader(source,root,[{place:'example',text:'{}'}]),e=>e instanceof Error&&'code' in e&&e.code==='reader/response');
  writeFileSync(source,`exports.observe=()=>[{scope:'example',role:'writes',measure:'count',bound:{kind:'interval',lo:0,hi:0}}];`);
  assert.equal(runReader(source,root,[{place:'example',text:'{}'}])[0]?.length,1);
 }finally{rmSync(root,{recursive:true,force:true})}
});

for(const [name,reply]of Object.entries({missingClaims:[{protocol:'bound-lock/1',kind:'fact'}],objectClaims:[{protocol:'bound-lock/1',kind:'fact',claims:{}}],unknownKind:[{protocol:'bound-lock/1',kind:'success',claims:[]}],extraAnswers:[{protocol:'bound-lock/1',kind:'fact',claims:[]},{protocol:'bound-lock/1',kind:'fact',claims:[]}]}))test('reader shares strict capsule envelope refusal: '+name,()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-envelope-'));try{const source=join(root,'reader.js');writeFileSync(join(root,'package.json'),'{}');writeFileSync(source,`exports.observe=()=>[];setImmediate(()=>process.stdout.write(${JSON.stringify(JSON.stringify(reply))}+'\\n'));`);assert.throws(()=>runReader(source,root,[{place:'input',text:'{}'}]),e=>e instanceof Error&&'code'in e&&e.code==='reader/response');}finally{rmSync(root,{recursive:true,force:true})}
});
