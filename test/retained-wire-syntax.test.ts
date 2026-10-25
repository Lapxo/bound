import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonical,parse,recordKind} from '@lapxo/topos/wire';
import {parsedLine,isConfig,fieldsOf} from '../src/fold/claims.ts';

test('retained syntax preserves the public parser on exact bytes and cannot be mutated',()=>{
 const rows=[canonical({scope:'port/one',role:'writes',form:'alphabet',measure:'text',value:'lock',about:JSON.stringify({payload:'quotes " and slash \\ and Unicode é'.repeat(1000)})}),canonical({scope:'sample',type:'claim',role:'reads',form:'interval',measure:'count',value:'2..3'}),'bound-lock/1 scope=x scope=y','not wire'];
 for(const line of rows){assert.deepEqual(parsedLine(line),parse(line));const kind=recordKind(line);assert.equal(isConfig(line),kind.kind==='fact'&&kind.value==='config');}
 const held=parsedLine(rows[0]!);assert.equal(held.kind,'fact');if(held.kind!=='fact')return;
 assert.throws(()=>{(held.value.fields as Record<string,string>).scope='changed'},TypeError);
 const copy=fieldsOf(rows[0]!);copy.scope='changed';assert.equal(parsedLine(rows[0]!).kind==='fact'&&fieldsOf(rows[0]!).scope,'port/one');
 const changed=canonical({...held.value.fields,scope:'port/two'});assert.deepEqual(parsedLine(changed),parse(changed));assert.notDeepEqual(parsedLine(changed),held);
});

test('content verification reuses syntax while checking current bytes and the current digest policy',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,rmSync,statSync,utimesSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {createHash}=await import('node:crypto');const {verifiedContent}=await import('../src/host/content-store.ts');const {withHostCall}=await import('../src/host/call-context.ts');
 const root=mkdtempSync(join(tmpdir(),'syntax-policy-')),store=join(root,'.bound'),bytes=Buffer.from('original'),digest='sha256:'+createHash('sha256').update(bytes).digest('hex'),file=join(store,'cas/blobs',digest.slice(7));mkdirSync(join(store,'cas/blobs'),{recursive:true});writeFileSync(file,bytes);
 const policy=[canonical({scope:'wire/era',role:'writes',form:'alphabet',measure:'id',value:'fixture'}),canonical({scope:'wire/signature-algorithms',role:'writes',form:'alphabet',measure:'id',value:'ed25519:fixture'}),canonical({scope:'wire/digest-algorithms',role:'writes',form:'alphabet',measure:'id',value:'sha256'})];
 const read=(lock:readonly string[])=>withHostCall({instrumentName:'fixture',freshBytes:true,runtime:{root,entry:join(root,'entry.js'),directory:root,extension:'.js',lock}},()=>verifiedContent(digest,store,store));
 try{assert.deepEqual(Buffer.from(read(policy).bytes),bytes);assert.deepEqual(Buffer.from(read([...policy]).bytes),bytes);assert.throws(()=>read(policy.map(line=>line.includes('scope=wire/digest-algorithms')?line.replace('value=sha256','value=sha512'):line)),/not admitted/);const stamp=statSync(file);writeFileSync(file,Buffer.from('altered!'));utimesSync(file,stamp.atime,stamp.mtime);assert.throws(()=>read(policy),/content hash mismatch/);writeFileSync(file,bytes);assert.deepEqual(Buffer.from(read(policy).bytes),bytes)}finally{rmSync(root,{recursive:true,force:true})}
});
