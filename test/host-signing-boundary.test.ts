import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{canonical}from'@lapxo/topos/wire';import{startNativeHost}from'@lapxo/bound/host';import{actingRootFixture}from'./support/acting-root.ts';import{pinnedHostInstrument}from'./support/pinned-host-instrument.ts';
const pinned=pinnedHostInstrument(new URL('../',import.meta.url).pathname);process.once('exit',pinned.close);
for(const domain of['archive-records','water-quality'])test(`an empty host signer registry never falls back to a packet key file: ${domain}`,async()=>{
 const f=actingRootFixture(domain,[],{entry:pinned.entry}),before=readFileSync(f.root+'/TARGET.bound');
 const host=await startNativeHost({place:f.root,instrument:pinned.instrument,expectedInstrument:pinned.instrument.digest,limits:{requestBytes:1048576,responseBytes:1048576,timeoutMs:15000,heapMiB:128,queuedRequests:4},environment:process.env});
 try{for(const verb of['sign','land']as const){const result=await host.request({verb,args:['@input/lot','--key','owner','--key-file',f.key],inputs:[{name:'lot',text:canonical({scope:'sample/unauthorized-'+verb,role:'writes',form:'alphabet',measure:'id',value:'present',by:'target',at:'policy:fixture'})+'\n'}]});assert.notEqual(result.status,0);assert.equal(JSON.parse(result.stderr.trim().split('\n').at(-1)!).code,'host/unbound-signer');assert.deepEqual(readFileSync(f.root+'/TARGET.bound'),before)}
 console.log(JSON.stringify({domain,node:process.version,packetKeyFileRefused:true,registry:'empty',signed:false,landed:false}));
 }finally{await host.close();f.close()}
});
