import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,utimesSync,statSync,mkdirSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {canonical} from '@lapxo/topos/wire';
import {nativeHostInstrument,prepareNativeViewIdentities} from '@lapxo/bound/host';
import {actingRootFixture} from './support/acting-root.ts';

const entry=new URL('../dist/cli/verb.js',import.meta.url).pathname,instrument=nativeHostInstrument(resolve(entry,'../../..'),entry),views=['lines','evidence'];
const row=(scope:string,value:string,form='alphabet',measure='id',role='writes')=>canonical({scope,value,form,measure,role,by:'target',at:'policy:fixture'});
const extra=[...views.map(v=>row('view/'+v,v+'@8','alphabet','id','demands')),...Object.entries({bytes:16777216,files:2048,readings:16,probes:1}).map(([k,n])=>row('reading-identity/'+k,'0..'+n,'interval',k)),row('sample/data','alpha')];
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const snapshot=(at:string):unknown=>readdirSync(at,{withFileTypes:true}).sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name))).map(item=>[item.name,item.isDirectory()?snapshot(join(at,item.name)):digest(readFileSync(join(at,item.name)))]);
for(const name of ['catalog-remarks','weather-series'])test('retained identity checks current bytes without timestamp shortcuts: '+name,()=>{
 const f=actingRootFixture(name,[],{entry,families:'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region|reading-identity',extraBootstrapRows:extra});
 const file=join(f.root,'.bound/ledger/owner.bound'),fixed=new Date('2020-01-01T00:00:00Z'),original=readFileSync(file,'utf8');utimesSync(file,fixed,fixed);
 const query=(expectedIdentities?:Record<string,string>)=>prepareNativeViewIdentities({place:f.root,instrument,views,...expectedIdentities?{expectedIdentities}:{}});
 const fact=()=>{const got=query();assert.equal(got.kind,'fact',JSON.stringify(got));if(got.kind!=='fact')throw Error('no identity');return got};
 try{
  const first=fact(),before=snapshot(f.root);for(let n=0;n<4;n++)assert.deepEqual(fact(),first);assert.deepEqual(snapshot(f.root),before);
  const edited=original.replace('value=alpha','value=omega');assert.notEqual(edited,original);assert.equal(Buffer.byteLength(edited),Buffer.byteLength(original));writeFileSync(file,edited);utimesSync(file,fixed,fixed);assert.equal(statSync(file).mtimeMs,fixed.getTime());
  const altered=query();assert.ok(altered.kind==='refuse'||altered.views.every((v,i)=>v.identity!==first.views[i]!.identity),'a same-size external edit cannot return a retained current identity');
  const stale=query(Object.fromEntries(first.views.map(v=>[v.view,v.identity])));assert.equal(stale.kind,'refuse');assert.equal('views'in stale,false);
  writeFileSync(file,original);utimesSync(file,fixed,fixed);assert.deepEqual(fact(),first);
  const lot=join(f.temp,'new-evidence.bound');writeFileSync(lot,row('sample/new-evidence','fresh')+'\n');const landed=f.run(['land',lot,'--key','owner','--key-file',f.key]);assert.equal(landed.status,0,landed.stderr);
  const next=fact();for(let i=0;i<views.length;i++)assert.notEqual(next.views[i]!.identity,first.views[i]!.identity);
  mkdirSync(join(f.root,'.bound/cas/memo'),{recursive:true});writeFileSync(join(f.root,'.bound/cas/memo','unconsumed'),'derived cache');writeFileSync(join(f.root,'.bound/ledger/fold.bound'),'derived bookkeeping\n');assert.deepEqual(fact(),next);
  const module=new URL('../dist/host/read-only.js',import.meta.url),bytes=readFileSync(module),time=statSync(module).mtime;assert.equal(bytes.at(-1),10);const changed=Buffer.from(bytes);changed[changed.length-1]=32;
  try{writeFileSync(module,changed);utimesSync(module,time,time);const current=fact();for(let i=0;i<views.length;i++)assert.notEqual(current.views[i]!.identity,next.views[i]!.identity)}finally{writeFileSync(module,bytes);utimesSync(module,time,time)}
  assert.deepEqual(fact(),next);
 }finally{writeFileSync(file,original);f.close()}
});
