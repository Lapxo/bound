// Host-selected read transaction: bytes/authority freshness is never a cache hit.
import{readingIdentityBytes}from'@lapxo/topos/contract';
import{validResponse}from'./capsule_response.ts';
const enc=new TextEncoder(),dec=new TextDecoder('utf8',{fatal:true}),fail=code=>{throw Object.assign(Error(code),{code})};
const fields=(o,n)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...n].sort().join(',');
export function createWorkerReadingHost({capsule,leases,cache,limits,mode='act',deliver,subtle=globalThis.crypto?.subtle}){
 const b=structuredClone(limits);if(!fields(b,['inputBytes','cacheBytes','batch'])||Object.values(b).some(n=>!Number.isSafeInteger(n)||n<1)||b.inputBytes>65536||b.cacheBytes>65536||b.batch>64||!['act','preview'].includes(mode)||['run','descriptor','assertCurrent'].some(k=>typeof capsule?.[k]!=='function')||typeof leases?.withLease!=='function'||['read','verify','commit'].some(k=>typeof cache?.[k]!=='function')||typeof subtle?.digest!=='function')fail('worker-reading/selection');
 if(deliver!==undefined&&typeof deliver!=='function')fail('worker-reading/selection');const descriptor=structuredClone(capsule.descriptor());let busy=false;
 const hash=async bytes=>'sha256:'+Array.from(new Uint8Array(await subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 const owned=(v,n)=>{if(!(v instanceof Uint8Array)||v.length>n||typeof SharedArrayBuffer!=='undefined'&&v.buffer instanceof SharedArrayBuffer)fail('worker-reading/bytes');return new Uint8Array(v)};
 const call=async(fn,...args)=>{if(await fn(...args)!==undefined)fail('worker-reading/port-response')};
 return Object.freeze({async run(input,{signal}={}){if(busy)fail('worker-reading/busy');if(signal?.aborted)fail('worker-reading/cancelled');const bytes=owned(input,b.inputBytes);let requests;try{requests=JSON.parse(dec.decode(bytes))}catch{fail('worker-reading/input')}
  if(!Array.isArray(requests)||requests.length>b.batch||requests.some(r=>!r||typeof r!=='object'||Array.isArray(r)||!['read','render'].includes(r.verb)))fail('worker-reading/input');
  busy=true;let open=true,entered=0,finished=false,answer;
  const check=()=>{if(!open)fail('worker-reading/lease-ended');if(signal?.aborted)fail('worker-reading/cancelled')};
  try{const execution=await hash(enc.encode(JSON.stringify(['bound-worker-execution@1',descriptor]))),batch=await hash(bytes);check();
   const outcome=await leases.withLease(async lease=>{if(++entered!==1)fail('worker-reading/lease-reentry');check();if(['readContext','assertExecution','authorize','assertCurrent'].some(k=>typeof lease?.[k]!=='function'))fail('worker-reading/lease-shape');
    let initial;try{initial=structuredClone(await lease.readContext(signal))}catch(e){if(e?.code)throw e;fail('worker-reading/context')};check();
    if(!Array.isArray(initial?.inputs)||initial.inputs.some(r=>r[0]==='bound/worker/request-batch'))fail('worker-reading/context');
    let baseBytes;try{baseBytes=readingIdentityBytes(initial)}catch{fail('worker-reading/context')}
    const context={...initial,inputs:[...initial.inputs,['bound/worker/request-batch',batch]]};let identityBytes;try{identityBytes=readingIdentityBytes(context)}catch{fail('worker-reading/context')}
    const reading=await hash(identityBytes);check();const key=await hash(enc.encode(JSON.stringify(['capsule-worker-answer@1',reading,execution,batch])));check();
    const current=async()=>{check();await call(lease.assertCurrent,signal);check();let fresh;try{fresh=structuredClone(await lease.readContext(signal));readingIdentityBytes(fresh)}catch(e){if(e?.code)throw e;fail('worker-reading/context')};check();const freshBytes=readingIdentityBytes(fresh);if(freshBytes.length!==baseBytes.length||freshBytes.some((v,i)=>v!==baseBytes[i]))fail('worker-reading/context-moved');await call(lease.assertExecution,context,descriptor,signal);check();await call(lease.authorize,context,structuredClone(requests),signal);check();await capsule.assertCurrent(signal);check()};
    await current();let stored=await cache.read(key,signal);check();let responses;
    if(stored!==undefined){stored=owned(stored,b.cacheBytes);await call(cache.verify,key,stored.slice(),{reading,execution,batch},signal);check();let row;try{row=JSON.parse(dec.decode(stored))}catch{fail('worker-reading/cache-input')}
     if(!fields(row,['format','key','reading','execution','batch','responses'])||row.format!=='capsule-worker-answer@1'||row.key!==key||row.reading!==reading||row.execution!==execution||row.batch!==batch||!Array.isArray(row.responses)||row.responses.length!==requests.length||!row.responses.every((r,i)=>r?.kind==='fact'&&validResponse(r,requests[i])))fail('worker-reading/cache-response');responses=row.responses;
    }else{if(mode==='preview')fail('worker-reading/preview-miss');responses=await capsule.run(bytes.slice(),{signal});check();if(!Array.isArray(responses)||responses.length!==requests.length||!responses.every((r,i)=>validResponse(r,requests[i])))fail('worker-reading/response');await current();
     // One batch commitment preserves positional/stateful responses. Mixed
     // refusals/abstentions are returned but never retained as reusable facts.
     if(responses.every(r=>r.kind==='fact')){const entry=enc.encode(JSON.stringify({format:'capsule-worker-answer@1',key,reading,execution,batch,responses}));if(entry.length>b.cacheBytes)fail('worker-reading/cache-budget');check();await call(cache.commit,key,entry.slice(),{reading,execution,batch},lease,signal);check()}
    }
    await current();if(deliver){answer=owned(await deliver(Object.freeze({context:structuredClone(context),input:bytes.slice(),output:enc.encode(JSON.stringify(responses)+'\n'),reading,execution,batch,current,lease}),signal),b.cacheBytes);await current()}else answer=Object.freeze(structuredClone(responses));finished=true;
   },signal);open=false;if(outcome!==undefined||entered!==1||!finished)fail('worker-reading/lease-response');return answer;
  }catch(e){if(typeof e?.code==='string'&&/^(worker-reading|capsule-worker|reading-lease|reading-cache|worker-api|computation|host-port|persistence)\/[a-z0-9-]+$/.test(e.code))throw e;fail('worker-reading/host-failed')}finally{open=false;busy=false}
 }});
}
