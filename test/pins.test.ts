import { strict as assert } from 'node:assert';
import { mkdtempSync,mkdirSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical } from '@lapxo/topos/wire';
import { capsulesOf } from '../src/observe/regions.ts';

const line=(scope:string,value:string,extra:Record<string,string>={})=>canonical({scope,value,role:'writes',form:'alphabet',measure:'id',by:'fixture',at:'policy:pin-fixture',...extra});

test('every explicit uses pin requires authentic standing, including unknown names',()=>{
 const root=mkdtempSync(join(tmpdir(),'pin-gate-'));
 try {
  const pin=line('uses/unregistered','sha256:'+'f'.repeat(64));
  assert.throws(()=>capsulesOf({root,store:join(root,'.bound'),standing:[pin],observed:[]}),/REFUSE·pin .*content unavailable · not laid/);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('an alias with a different digest cannot satisfy a selected pin by name',()=>{
 const root=mkdtempSync(join(tmpdir(),'pin-version-'));
 try {
  assert.throws(()=>capsulesOf({root,store:join(root,'.bound'),standing:[line('uses/doc','sha256:'+'e'.repeat(64)),line('dep/doc','sha256:'+'d'.repeat(64))],observed:[]}),/content unavailable · not laid/);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('a local development capsule never substitutes for selected bytes absent from the store',()=>{
 const root=mkdtempSync(join(tmpdir(),'pin-no-local-'));
 const prior=process.argv[1];process.argv[1]=new URL('../src/cli/verb.ts',import.meta.url).pathname;
 try {
  mkdirSync(join(root,'doc/src/regions'),{recursive:true});
  writeFileSync(join(root,'doc/capsule.bound'),line('region/illustration','page/**',{role:'render',measure:'reads'})+'\n');
  writeFileSync(join(root,'doc/src/regions/illustration.ts'),'export const render = () => ["local substitute"];\n');
  const digest='sha256:'+'c'.repeat(64);
  assert.throws(()=>capsulesOf({root,store:join(root,'.bound'),standing:[line('uses/doc',digest),line('dep/doc',digest,{shape:'dist/index.js'})],observed:[]}),/content unavailable · not laid/);
 } finally {process.argv[1]=prior;rmSync(root,{recursive:true,force:true});}
});
