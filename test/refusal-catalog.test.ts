import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {readRefusalCatalog,describeRefusal,BoundRefusal,decodeReference} from '@lapxo/bound/reference';
import {parse} from '@lapxo/topos/wire';
const root=new URL('../',import.meta.url),text=readFileSync(new URL('docs/contracts/refusals.bound',root),'utf8'),catalog=readRefusalCatalog(text);
test('refusal lines are the unique public machine catalog with an exact derived page',()=>{
 const yes=JSON.parse(readFileSync(new URL('samples/refusals/yes.json',root),'utf8'));assert.equal(yes.profile,'bound-refusals@1');
 assert.equal(createRequire(import.meta.url).resolve('@lapxo/bound/refusals'),new URL('docs/contracts/refusals.bound',root).pathname);
 const page=readFileSync(new URL('docs/contracts/refusals.md',root),'utf8');
 assert.equal(new Set(catalog.map(r=>r.code)).size,catalog.length);
 for(const row of catalog){assert.equal(describeRefusal(new BoundRefusal(row.code,'arbitrary diagnostic'),catalog),row);assert.ok(page.includes(`| ${row.code} | ${row.category} | ${row.meaning} | ${row.next} |`));}
 assert.equal(page.split('\n').filter(l=>l.startsWith('| ')).length,catalog.length+2);
});
test('duplicate, missing, unknown and noncanonical catalog fields refuse by name',()=>{
 const no=JSON.parse(readFileSync(new URL('samples/refusals/no.json',root),'utf8'));
 const lines=text.trimEnd().split('\n');
 for(const bad of [text+lines[1]+'\n',lines.slice(1).join('\n')+'\n',lines.filter((_,i)=>i!==2).join('\n')+'\n',text.replace('measure=next','measure=unknown'),text+'garbage\n',text.replace('measure=id role=writes scope=refusal/catalog','measure=id role=demands scope=refusal/catalog')]){
  assert.throws(()=>readRefusalCatalog(bad),error=>error instanceof BoundRefusal&&error.code===no.code);
 }
 assert.throws(()=>describeRefusal(new BoundRefusal('not-declared','ignored'),catalog),error=>error instanceof BoundRefusal&&error.code==='catalog/invalid');
 console.log('REFUSALS lines · unique codes · exact metadata · duplicate refused');
});
test('reference syntax uses a public cause code without parsing the diagnostic',()=>{
 for(const input of ['not a reference','#bound:2?','#bound:1?class=standing&class=standing'])assert.throws(()=>decodeReference(input),error=>error instanceof BoundRefusal&&describeRefusal(error,catalog).code==='reference/format');
 // No package/platform-specific code is required to parse the machine lines.
 for(const line of text.trimEnd().split('\n'))assert.equal(parse(line).kind,'fact');
});

test('standing and refusal quartets seal their public contract, yes, vector and no members',()=>{
 const page=readFileSync(new URL('docs/contracts/standing.md',root),'utf8');
 for(const line of readFileSync(new URL('docs/contracts/standing.bound',root),'utf8').trimEnd().split('\n')){const got=parse(line);assert.equal(got.kind,'fact');if(got.kind==='fact'&&got.value.fields.about){assert.ok(page.includes(got.value.fields.scope));assert.ok(page.includes(got.value.fields.about));}}
 const digest=(bytes:Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
 for(const name of ['standing','refusals']){
  const quartet=JSON.parse(readFileSync(new URL('docs/contracts/'+name+'.publication.json',root),'utf8'));
  assert.deepEqual(quartet.members.map((m:{role:string})=>m.role),['contract','yes','vector','no']);
  for(const member of quartet.members)assert.equal(digest(readFileSync(new URL(member.path,root))),member.digest);
 }
});

test('native refusal remains named if its installed catalog is unavailable',()=>{
 const entry=new URL('../dist/cli/verb.js',import.meta.url),code=`import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';const original=fs.readFileSync;fs.readFileSync=function(path,...args){if(String(path).endsWith('/docs/contracts/refusals.bound'))throw Error('fixture unavailable');return original.call(this,path,...args)};syncBuiltinESMExports();process.argv=[process.execPath,${JSON.stringify(entry.pathname)},'--unsupported-option'];await import(${JSON.stringify(entry.href)});`;
 const result=spawnSync(process.execPath,['--input-type=module','--eval',code],{encoding:'utf8',timeout:15000,maxBuffer:262144});
 assert.notEqual(result.status,0);assert.equal(result.stdout,'');const record=JSON.parse(result.stderr.trim().split('\n').at(-1)!);assert.equal(record.code,'catalog/invalid');assert.deepEqual(record.unmeasured,['category','meaning','next','catalog']);assert.doesNotMatch(result.stderr,/UnhandledPromiseRejection/);
});
