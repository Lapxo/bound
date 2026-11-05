// Optional receiver-owned RAM cache. Provenance is private ownership of exact
// committed bytes, not a signature, Root permission or persistent authority.
const fail=code=>{throw Object.assign(Error(code),{code})},equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export function createMemoryReadingCache({entries,payloadBytes}){
 if(!Number.isSafeInteger(entries)||entries<1||!Number.isSafeInteger(payloadBytes)||payloadBytes<1)fail('reading-cache/selection');const rows=new Map();let used=0;
 const copy=bytes=>{if(!(bytes instanceof Uint8Array)||typeof SharedArrayBuffer!=='undefined'&&bytes.buffer instanceof SharedArrayBuffer)fail('reading-cache/bytes');return new Uint8Array(bytes)};
 const stamp=v=>{if(!v||Object.keys(v).sort().join(',')!=='batch,execution,reading'||Object.values(v).some(x=>typeof x!=='string'||!x))fail('reading-cache/context');return JSON.stringify([v.reading,v.execution,v.batch])};
 const cancelled=signal=>{if(signal?.aborted)fail('reading-cache/cancelled')};
 return Object.freeze({async read(key,signal){cancelled(signal);return rows.get(key)?.bytes.slice()},async verify(key,bytes,expected,signal){cancelled(signal);const own=copy(bytes),row=rows.get(key);if(!row||row.stamp!==stamp(expected)||!equal(row.bytes,own))fail('reading-cache/unverified')},async commit(key,bytes,expected,lease,signal){cancelled(signal);if(typeof key!=='string'||!key||typeof lease?.assertCurrent!=='function')fail('reading-cache/commit-context');const owned=copy(bytes),context=stamp(expected);if(await lease.assertCurrent(signal)!==undefined)fail('reading-cache/lease-response');cancelled(signal);
  // No await between the final lease check and replacement. No eviction or
  // authority retention is inferred from elapsed time or a cached fact.
  const old=rows.get(key),next=used-(old?.bytes.length??0)+owned.length;if(next>payloadBytes||!old&&rows.size>=entries)fail('reading-cache/budget');rows.set(key,{bytes:owned,stamp:context});used=next;
 }});
}
