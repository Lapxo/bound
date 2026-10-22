import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {signBytes} from '../dist/host/adapters/keys/ed25519.js';
import {verifiesFields} from '../dist/land/sign.js';
import {captureViewInputs,viewInput} from '../dist/host/reading-context.js';
import {foldClaims,parsedLine} from '../dist/fold/claims.js';
import {canonical,signedBytes} from '@lapxo/topos/wire';

const fields={scope:'sample/read',role:'writes',form:'alphabet',measure:'id',value:'first',by:'lane',at:'witness:test'};
test('signature reuse remains bound to exact fields, key and current algorithm vocabulary',()=>{
 const key=generateKeyPairSync('ed25519'),other=generateKeyPairSync('ed25519');const pem=key.privateKey.export({format:'pem',type:'pkcs8'}).toString(),pub=key.publicKey.export({format:'der',type:'spki'}).toString('base64'),otherPub=other.publicKey.export({format:'der',type:'spki'}).toString('base64');
 const sig=signBytes(signedBytes(fields),pem,'ed25519:test'),line=canonical({...fields,sig}),parsed=parsedLine(line);assert.equal(parsed.kind,'fact');if(parsed.kind!=='fact')return;
 const algorithms=['ed25519:test'];assert.equal(verifiesFields(parsed.value.fields,pub,algorithms),true);assert.equal(verifiesFields(parsed.value.fields,pub,algorithms),true);
 algorithms[0]='ed25519:other';assert.equal(verifiesFields(parsed.value.fields,pub,algorithms),false);algorithms[0]='ed25519:test';assert.equal(verifiesFields(parsed.value.fields,otherPub,algorithms),false);assert.equal(verifiesFields(parsed.value.fields,pub,algorithms),true);
 const altered=parsedLine(canonical({...fields,value:'other',sig}));assert.equal(altered.kind,'fact');if(altered.kind==='fact')assert.equal(verifiesFields(altered.value.fields,pub,algorithms),false);
 let changing='first';const accessor=Object.freeze({...fields,get value(){return changing},sig});assert.equal(verifiesFields(accessor,pub,algorithms),true);changing='other';assert.equal(verifiesFields(accessor,pub,algorithms),false);
 const mutable={...fields,sig};assert.equal(verifiesFields(mutable,pub,algorithms),true);mutable.value='other';assert.equal(verifiesFields(mutable,pub,algorithms),false);
});
test('pure fold reuse observes changed array bytes and does not expose its retained result',()=>{
 const rows=[canonical(fields)],first=foldClaims(rows);assert.deepEqual(foldClaims(rows),first);
 (first.standing as string[]).length=0;assert.equal(foldClaims(rows).standing.length,1);
 rows[0]=canonical({...fields,value:'other'});assert.equal(foldClaims(rows).standing[0],rows[0]);
 rows.push(canonical({...fields,value:'withdraw'}));assert.equal(foldClaims(rows).standing.some(line=>line.includes('value=other')),false);
});
test('pure fold reuse distinguishes current witness receipts',()=>{
 const a=canonical({...fields,value:'first',needs:'data/a'}),b=canonical({...fields,by:'other',value:'second',needs:'data/b'}),receipts=[{scope:'sample/read',moved:['data/a']}];
 const before=foldClaims([a,b],receipts);receipts[0].moved[0]='elsewhere';const after=foldClaims([a,b],receipts);
 assert.deepEqual(before.standing,[a]);assert.deepEqual(before.vacuous,[b]);assert.deepEqual(after.standing,[]);assert.deepEqual(after.vacuous,[a,b]);
});

test('frozen arrays with dynamic accessors or serialization are freshly encoded',()=>{
 let value='first';
 const accessor=Object.freeze(Object.defineProperty([],'0',{get:()=>value,enumerable:true}));
 const serializer=['fixed'];Object.defineProperty(serializer,'toJSON',{value:()=>[value],enumerable:false});Object.freeze(serializer);
 const inherited=['fixed'];Object.setPrototypeOf(inherited,{toJSON:()=>[value]});Object.freeze(inherited);
 for(const values of [accessor,serializer,inherited]){
  value='first';const first=captureViewInputs({bytes:65536,files:8},()=>viewInput('source',()=>values));
  value='other';const second=captureViewInputs({bytes:65536,files:8},()=>viewInput('source',()=>values));
  assert.notDeepEqual(first.inputs,second.inputs);
 }
});
