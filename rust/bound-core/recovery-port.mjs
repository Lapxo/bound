// No target, lock, grant or authentication may be selected by carrier data.
import{preparePersistence,instantiatePersistence}from'./persistence-port.mjs';
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
export function prepareRecovery(input){
 if(!(input instanceof Uint8Array)||input.length>65536)throw Object.assign(Error('fold/input-budget'),{code:'fold/input-budget'});
 if(typeof SharedArrayBuffer!=='undefined'&&input.buffer instanceof SharedArrayBuffer)throw Object.assign(Error('persistence/input'),{code:'persistence/input'});
 let r;try{r=JSON.parse(dec.decode(input));if(r.profile!=='bound-persistence-recovery-request@1')throw Error();}catch{throw Object.assign(Error('persistence/input'),{code:'persistence/input'});}
 const prepared=JSON.parse(dec.decode(preparePersistence(enc.encode(JSON.stringify({...r,profile:'bound-persistence-request@1'})))));prepared.profile='bound-persistence-recovery-prepared@1';const out=enc.encode(JSON.stringify(prepared));if(out.length>65536)throw Object.assign(Error('fold/input-budget'),{code:'fold/input-budget'});return out;
}
export const instantiateRecovery=module=>instantiatePersistence(module,{prepare:prepareRecovery,entry:'persistence_recover'});
