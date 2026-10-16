import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdirSync,symlinkSync,mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{pathToFileURL}from'node:url';import{referenceRootFixture}from'./support/reference-root.ts';
const root=new URL('../',import.meta.url),page=readFileSync(new URL('README.md',root),'utf8'),code=/```js\n([\s\S]*?)\n```/.exec(page)?.[1];assert.ok(code);
const yes=JSON.parse(readFileSync(new URL('samples/readme/yes.json',root),'utf8')),no=JSON.parse(readFileSync(new URL('samples/readme/no.json',root),'utf8'));
for(const place of yes.places)test('installed README example '+place,async()=>{
 const{f,bundle,trust,ledger}=referenceRootFixture('readme-'+place),consumer=mkdtempSync(join(tmpdir(),'bound-readme-consumer-'));try{
  const packages=join(consumer,'node_modules/@lapxo');mkdirSync(packages,{recursive:true});symlinkSync(root.pathname,join(packages,'bound'),'dir');writeFileSync(join(consumer,'package.json'),'{"type":"module"}\n');const example=join(consumer,'example.js');writeFileSync(example,code);const{openAndProject}=await import(pathToFileURL(example).href),before=ledger();
  assert.equal(no.mutation,'append-one-carrier-byte');const readings=await openAndProject(bundle.reference,trust);assert.equal(readings[0].state,yes.state);await assert.rejects(()=>openAndProject(bundle.reference,{...trust,fetchBytes:async()=>Buffer.from(bundle.carrier+' ')}),/blob integrity/);assert.deepEqual(ledger(),before);const marker='README '+place+' · REQUIRED · altered carrier refused';assert.ok(page.includes(marker));console.log(marker);
 }finally{f.close();rmSync(consumer,{recursive:true,force:true})}
});
