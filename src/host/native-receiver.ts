import {readFileSync,realpathSync} from 'node:fs';
import {basename,dirname,extname,isAbsolute,join,relative} from 'node:path';
import {publicLock} from '@lapxo/topos/wire';
import {foldClaims,wireLinesOf} from '../fold/claims.ts';
import {declaredRootClockSource} from './root-clock-source.ts';
import {withHostCall,type HostInstrumentRuntime} from './call-context.ts';
import {BoundRefusal} from './refusals.ts';
import{installedPackageIdentity,type InstalledPackageRequest}from'./native/installed-package.ts';

export interface NativeHostInstrument {readonly name:string;readonly runtime:HostInstrumentRuntime;readonly installed?:{readonly digest:string;readonly request:InstalledPackageRequest}}
// One bounded pure public-configuration parse. The exact file is reread before
// lookup; this neither authenticates a place nor retains its current authority.
let publicInstrument:{readonly root:string;readonly file:string;readonly text:string;readonly value:NativeHostInstrument}|undefined;
/** Explicit installed/source ESM selection, never consumer argv or packet data.
 * Identity and public configuration do not certify implementation correctness. */
export function nativeHostInstrument(root:string,entry:string):NativeHostInstrument {
 const at=realpathSync(root),file=realpathSync(entry),inside=relative(at,file),extension=extname(file);
 if(!isAbsolute(root)||!isAbsolute(entry)||inside.startsWith('..')||isAbsolute(inside)||!['.ts','.js'].includes(extension))throw new BoundRefusal('host/context','REFUSE·host/context');
 const text=readFileSync(join(at,'TARGET.bound'),'utf8'),held=publicInstrument;
 if(held?.root===at&&held.file===file&&held.text===text)return structuredClone(held.value);
 const published=publicLock(wireLinesOf(text));
 if(!published?.length)throw new BoundRefusal('host/context','REFUSE·host requires a public instrument lock');
 const value={name:basename(at),runtime:{root:at,entry:file,directory:dirname(dirname(file)),extension:extension as '.ts'|'.js',lock:foldClaims(published).standing}};
 if(Buffer.byteLength(text)<=2*1024*1024)publicInstrument={root:at,file,text,value:structuredClone(value)};
 return value;
}
/** Bind existing native authority construction to an explicit instrument for
 * every later current/historical observation, not only the constructor call. */
export function nativePlaceActReceiver(root:string,instrument:NativeHostInstrument){
 const call={instrumentName:instrument.name,runtime:structuredClone(instrument.runtime),output:()=>{}};
 const selected=withHostCall(call,()=>declaredRootClockSource(root)),original=selected.trust;
 return {selection:selected.selection,trust:{...original,current:()=>withHostCall(call,()=>original.current()),historical:(encoded:string)=>withHostCall(call,()=>original.historical(encoded))}};
}

/** Receiver-selected complete installed bytes; the physical root never enters this digest. */
export function installedHostInstrument(request:InstalledPackageRequest,entry:string):NativeHostInstrument & {readonly digest:string}{
 const signal=request.limits?.signal,held=structuredClone({...request,limits:{...request.limits,signal:undefined}}),selected:InstalledPackageRequest={...held,limits:{...held.limits,...(signal?{signal}:{})}};const identity=installedPackageIdentity(selected),instrument=nativeHostInstrument(selected.directory,entry);
 return {...instrument,digest:identity.digest,installed:{digest:identity.digest,request:selected}};
}
/** Reuse the public installed-package verifier, rather than introducing another package hash. */
export function verifyHostInstrument(instrument:NativeHostInstrument,expected:string):void{
 try{const selected=instrument.installed;if(!selected||!/^sha256:[a-f0-9]{64}$/.test(expected)||selected.digest!==expected||realpathSync(selected.request.directory)!==realpathSync(instrument.runtime.root)||installedPackageIdentity(selected.request).digest!==expected)throw Error('installed pin differs')}
 catch{throw new BoundRefusal('host/instrument-pin','REFUSE·host/instrument-pin')}
}
