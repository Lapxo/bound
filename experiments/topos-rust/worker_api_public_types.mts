import {createBoundWorkerHost,createRustReceiptPersistence,createNativeReceiptStorage,createNativeReadingLease,createMemoryReadingCache,createCapsuleWorkerPort,readRootStandingInProcess,type BoundWorkerHost,type WorkerCapsuleSelection,type WorkerReadingLease} from '@lapxo/bound/host';
async function compose(selection:WorkerCapsuleSelection,lease:WorkerReadingLease,module:Uint8Array,digest:string){
 const capsule=createCapsuleWorkerPort({selection,readArtifact:async()=>new Uint8Array(),assets:{runtime:new Uint8Array(),wasm:new Uint8Array()},bootstrap:'',contract:'',workerFactory:()=>({postMessage(){},terminate(){}})});
 const leases=createNativeReadingLease({...lease,store:'/scratch/locks',regions:['public'],name:'test'}),cache=createMemoryReadingCache({entries:1,payloadBytes:65536}),storage=createNativeReceiptStorage({directory:'/scratch/receipts',maxBytes:65536}),persistence=await createRustReceiptPersistence({module:{bytes:module,digest},storage,maxBytes:65536});
 const host:BoundWorkerHost=createBoundWorkerHost({capsule,leases,cache,limits:{inputBytes:65536,cacheBytes:65536,batch:64},receipt:{contract:digest,numericPolicy:digest,keyId:'fixture',algorithm:'fixture',limits:{timeoutMs:1000,maxBytes:65536}},ports:{sign:async()=>[],verify:async()=>false,assertHistorical:()=>{},persistence}});
 const bytes:Uint8Array=await host.read(new Uint8Array());
 // @ts-expect-error public requests cannot select a signer or supply an authority port
 await host.read(bytes,{keyId:'caller'});
 // @ts-expect-error historical lookup uses a digest, never path/receipt bytes
 await host.recover(bytes);
 return await host.recover(digest);
}
void compose;void readRootStandingInProcess;
