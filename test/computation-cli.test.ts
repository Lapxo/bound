import{test}from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{readFileSync}from'node:fs';
import{canonical}from'@lapxo/topos/wire';import{referenceRootFixture}from'./support/reference-root.ts';import{verifyComputation}from'../src/engine/index.ts';import{verifyBytes}from'../src/host/adapters/keys/ed25519.ts';
const digest=(b:Uint8Array|string)=>'sha256:'+createHash('sha256').update(b).digest('hex'),row=(scope:string,value:string,form='alphabet',measure='id',role='writes')=>canonical({scope,value,form,measure,role,by:'target',at:'policy:fixture'});
for(const place of ['tide-log','library-index'])test('native computation signs a real admitted place with its selected signer: '+place,async()=>{
 const config=[row('view/computation','computation@1','alphabet','id','demands'),row('computation/contract',digest('fixture computation contract')),row('computation/numeric-policy',digest('selected interval numeric policy')),row('computation/bytes','0..262144','interval','bytes'),row('computation/milliseconds','0..5000','interval','milliseconds')];
 const {f,ledger}=referenceRootFixture(place,undefined,config);
 try{const before=ledger(),args=['fold','--as','computation','--key','owner','--key-file',f.key],run=f.run(args);assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout);assert.equal(result.profile,'bound-computation-delivery@1');assert.ok(JSON.parse(result.output).some((r:any)=>r.state==='REQUIRED'));assert.deepEqual(ledger(),before,'computing signs no admission or receipt ledger');assert.equal(run.stdout.includes(f.temp),false);assert.equal(run.stdout.includes('PRIVATE KEY'),false);
 const pub=f.owner.publicKey.export({type:'spki',format:'pem'}).toString();
 const checked=await verifyComputation(result.context,new TextEncoder().encode(result.input),new TextEncoder().encode(result.output),result.statement,{digest,verify:async(bytes,sig,algorithm)=>sig.keyId==='owner'&&verifyBytes(bytes,pub,sig.signature,[algorithm])},{timeoutMs:5000,maxBytes:262144});assert.equal(checked.origin,result.context.reading.implementation);
 const replay=f.run(args);assert.equal(replay.status,0,replay.stderr);assert.equal(replay.stdout,run.stdout,'redelivery retains its identity and deterministic signature');
 const noKey=f.run(['fold','--as','computation']);assert.equal(noKey.status,1);assert.match(noKey.stderr,/computation\/authority/);assert.deepEqual(ledger(),before);
 }finally{f.close()}
});
