import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,statSync,utimesSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {withHostCall} from '../src/host/call-context.ts';
import {observeText} from '../src/observe/files.ts';
import {ledgerLines} from '../src/land/ledger.ts';
const wire=(value:string)=>`bound-lock/1 scope=sample/current role=writes form=alphabet measure=id value=${value} by=owner at=policy:fixture`;
test('persistent non-view readers retain no metadata-backed authority between calls',()=>{
 const root=mkdtempSync(join(tmpdir(),'persistent-fresh-')),store=join(root,'.bound'),at=join(store,'ledger','owner.bound');mkdirSync(join(store,'ledger'),{recursive:true});writeFileSync(at,wire('first')+'\n');
 const request=<T>(run:()=>T)=>withHostCall({instrumentName:'bound',freshBytes:true},run);
 try{
  assert.equal(request(()=>observeText(at)),wire('first')+'\n');assert.deepEqual(request(()=>ledgerLines(store,'owner')),[wire('first')]);
  const stat=statSync(at);writeFileSync(at,wire('other')+'\n');utimesSync(at,stat.atime,stat.mtime);
  assert.equal(request(()=>observeText(at)),readFileSync(at,'utf8'));assert.deepEqual(request(()=>ledgerLines(store,'owner')),[wire('other')]);
  rmSync(at);assert.equal(request(()=>observeText(at)),undefined);assert.deepEqual(request(()=>ledgerLines(store,'owner')),[]);
 }finally{rmSync(root,{recursive:true,force:true})}
});
