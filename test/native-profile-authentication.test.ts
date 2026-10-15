import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {canonical,signedBytes,formatSignature} from '@lapxo/topos/wire';
import {authenticateNativeProfile,validateSignedNativeProfile,loadSignedNativeReading,canonicalJson,type PortProfile,type RootStanding} from '../src/host/native/reading.ts';
function fixture(name:string){
 const pair=generateKeyPairSync('ed25519'),profile:PortProfile={profile:'host-native-reading@1',port:{coordinate:'port/'+name,implementation:'sha256:'+'1'.repeat(64),closure:[],timeoutMs:100,responseBytes:1024,environment:[],stderr:'reject'},selection:{archive:'sha256:'+'2'.repeat(64),entry:'entry.js',reader:'reader.js',loaderConfig:'config.json',runtime:'runtime',preload:null,nativePreloadMembers:[],condition:'fixture',budget:{bytes:1024,files:8,depth:8} as PortProfile['selection']['budget'],members:[{coordinate:'entry.js',digest:'sha256:'+'1'.repeat(64)}],bindings:[],loads:[]}};
 const record=(p:PortProfile)=>{const fields={scope:p.port.coordinate,role:'writes',form:'alphabet',measure:'text',value:'lock',about:canonicalJson(p),epoch:'2',by:name,at:'policy:fixture'};return canonical({...fields,sig:formatSignature('ed25519:fixture',sign(null,Buffer.from(signedBytes(fields)),pair.privateKey).toString('base64'))})},line=record(profile);
 const root:RootStanding={history:[line],live:[line],signer:{id:name,keyClass:'authorize',publicKey:pair.publicKey.export({type:'spki',format:'der'}).toString('base64'),coverage:['port/**'],depth:{lo:1,hi:16},admittedBy:[]},eras:['ed25519:fixture'],epoch:2,budget:{lines:8,bytes:16384}};
 return{root,profile,record};
}
test('single authenticated native selection exposes immutable signed data and keeps expected comparison',()=>{
 for(const name of ['alpha','unrelated']){
  const f=fixture(name),got=authenticateNativeProfile(f.root,f.profile.port.coordinate);
  assert.deepEqual(got.profile,f.profile);assert.equal(got.selection.identity,validateSignedNativeProfile(f.root,f.profile.port.coordinate,f.profile).identity);
  assert.ok(Object.isFrozen(got)&&Object.isFrozen(got.profile.selection.members[0])&&Object.isFrozen(got.profile.selection.bindings));
  assert.throws(()=>{got.profile.selection.members[0]!.digest='sha256:'+'3'.repeat(64)},TypeError);
  assert.throws(()=>validateSignedNativeProfile(f.root,f.profile.port.coordinate,{...f.profile,port:{...f.profile.port,timeoutMs:101}}),/expected profile differs/);
  assert.throws(()=>authenticateNativeProfile({...f.root,signer:{...f.root.signer,coverage:[]}},f.profile.port.coordinate),/authority|coverage/);
 }
});
test('opaque selection cannot bypass fresh Root and current grant checks at load',async()=>{
 const f=fixture('fresh'),got=authenticateNativeProfile(f.root,f.profile.port.coordinate),unresolved={} as Parameters<typeof loadSignedNativeReading>[1];
 await assert.rejects(loadSignedNativeReading(got.selection,unresolved,{withCurrent:async body=>body({...f.root,epoch:3})}),/authority changed before load/);
 await assert.rejects(loadSignedNativeReading(got.selection,unresolved,{withCurrent:async body=>body({...f.root,signer:{...f.root.signer,coverage:[]}})}),/authority|coverage/);
 const changed=f.record({...f.profile,port:{...f.profile.port,timeoutMs:101}});
 await assert.rejects(loadSignedNativeReading(got.selection,unresolved,{withCurrent:async body=>body({...f.root,history:[changed],live:[changed]})}),/authority changed before load/);
});
