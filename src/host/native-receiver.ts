import {readFileSync,realpathSync} from 'node:fs';
import {basename,dirname,extname,isAbsolute,join,relative} from 'node:path';
import {publicLock} from '@lapxo/topos/wire';
import {foldClaims,wireLinesOf} from '../fold/claims.ts';
import {declaredRootClockSource} from './root-clock-source.ts';
import {withHostCall,type HostInstrumentRuntime} from './call-context.ts';
import {BoundRefusal} from './refusals.ts';

export interface NativeHostInstrument {readonly name:string;readonly runtime:HostInstrumentRuntime}
/** Explicit installed/source ESM selection, never consumer argv or packet data.
 * Identity and public configuration do not certify implementation correctness. */
export function nativeHostInstrument(root:string,entry:string):NativeHostInstrument {
 const at=realpathSync(root),file=realpathSync(entry),inside=relative(at,file),extension=extname(file);
 if(!isAbsolute(root)||!isAbsolute(entry)||inside.startsWith('..')||isAbsolute(inside)||!['.ts','.js'].includes(extension))throw new BoundRefusal('host/context','REFUSE·host/context');
 const published=publicLock(wireLinesOf(readFileSync(join(at,'TARGET.bound'),'utf8')));
 if(!published)throw new BoundRefusal('host/context','REFUSE·host requires a public instrument lock');
 return {name:basename(at),runtime:{root:at,entry:file,directory:dirname(dirname(file)),extension:extension as '.ts'|'.js',lock:foldClaims(published).standing}};
}
/** Bind existing native authority construction to an explicit instrument for
 * every later current/historical observation, not only the constructor call. */
export function nativePlaceActReceiver(root:string,instrument:NativeHostInstrument){
 const call={instrumentName:instrument.name,runtime:structuredClone(instrument.runtime),output:()=>{}};
 const selected=withHostCall(call,()=>declaredRootClockSource(root)),original=selected.trust;
 return {selection:selected.selection,trust:{...original,current:()=>withHostCall(call,()=>original.current()),historical:(encoded:string)=>withHostCall(call,()=>original.historical(encoded))}};
}
