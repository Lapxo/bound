import {AsyncLocalStorage} from 'node:async_hooks';

/** Native operational selection from the receiver, never the offered content. */
export interface HostInstrumentRuntime {
 readonly root:string;
 readonly entry:string;
 readonly directory:string;
 readonly extension:'.ts'|'.js';
 readonly lock:readonly string[];
}
interface HostCall {
 readonly instrumentName:string;
 readonly runtime?:HostInstrumentRuntime;
 readonly output?:(stream:'out'|'error',text:string)=>void;
}
const calls=new AsyncLocalStorage<HostCall>();
export const hostInstrumentName=():string|undefined=>calls.getStore()?.instrumentName;
export const hostInstrumentRuntime=():HostInstrumentRuntime|undefined=>calls.getStore()?.runtime;
export const withHostInstrument=<T>(instrumentName:string,run:()=>T):T=>calls.run({...calls.getStore(),instrumentName},run);
export const withHostCall=<T>(call:HostCall,run:()=>T):T=>calls.run(call,run);
/** No stream monkey-patching: diagnostics follow only this asynchronous call. */
export function hostOutput(stream:'out'|'error',text:string):void {
 const output=calls.getStore()?.output;
 if(output)output(stream,text);else (stream==='out'?process.stdout:process.stderr).write(text);
}
