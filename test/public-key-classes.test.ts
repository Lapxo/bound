import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonical,publicationOf} from '@lapxo/topos/wire';
import {keyOf,releaseOf} from '../src/fold/keys.ts';

const declared=()=>{
 const pair=generateKeyPairSync('ed25519');
 const body={scope:'keys/writer',role:'reads',form:'alphabet',measure:'public-key',value:pair.publicKey.export({type:'spki',format:'der'}).toString('base64'),by:'writer',epoch:'1'};
 const signed=fields=>canonical({...fields,sig:'ed25519:era1:'+sign(null,Buffer.from(canonical(fields)),pair.privateKey).toString('base64')});
 return [signed(body),signed({scope:'keys/writer',role:'reads',form:'alphabet',measure:'class',value:'authorize',by:'writer',epoch:'1'})];
};

test('a public lock retains declared classes while only public keys retain signatures',()=>{
 const root=mkdtempSync(join(tmpdir(),'public-key-classes-'));
 try{
  const lines=publicationOf(declared());
  writeFileSync(join(root,'TARGET.bound'),lines.join('\n')+'\n');
  assert.equal(keyOf(join(root,'.bound'),'authorize'),'writer');
  assert.deepEqual(releaseOf(join(root,'.bound')),lines);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('an unsigned draft does not acquire release authority by declaring a key class',()=>{
 const root=mkdtempSync(join(tmpdir(),'draft-key-classes-'));
 try{
  writeFileSync(join(root,'TARGET.bound'),canonical({scope:'keys/writer',role:'reads',form:'alphabet',measure:'class',value:'authorize',by:'target'})+'\n');
  assert.equal(releaseOf(join(root,'.bound')),undefined);
  assert.equal(keyOf(join(root,'.bound'),'authorize'),undefined);
 }finally{rmSync(root,{recursive:true,force:true});}
});
