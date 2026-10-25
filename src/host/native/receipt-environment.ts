/** Reconstruct the current execution boundary from authenticated selections.
 * A retained receipt never selects its own cwd or execution flags. Historical
 * inspection does not call this resolver and does not authorize a current act.
 */
import {join} from 'node:path';
import type {ReadingIdentityContext} from '@lapxo/topos/contract';
import {readingEnvironment,type ReadingReference} from '../reading-context.ts';
import {currentNativeReaderSelections,nativeMountIdentity} from './route.ts';

export function currentReadingEnvironment(store:string,root:string,hash:(text:string)=>string,flags:readonly string[]):(context:ReadingIdentityContext)=>readonly ReadingReference[]|undefined{
 const selections=currentNativeReaderSelections(store);
 const ordinary=readingEnvironment(hash,process.env,root,flags);
 return context=>{
  const mounts: string[]=[];
  for(const[encoded,digest]of context.inputs){let name=encoded;
   for(;;){let value:unknown;try{value=JSON.parse(name)}catch{break}
    if(!Array.isArray(value)||value.length!==2||value[0]!=='context'||typeof value[1]!=='string')break;name=value[1];}
   if(name==='native/mount')mounts.push(digest);
  }
  if(!mounts.length)return selections.some(one=>one.profile.selection.archive===context.implementation)?undefined:ordinary;
  if(mounts.length!==1)return undefined;
  const selected=selections.filter(one=>one.profile.selection.archive===context.implementation&&nativeMountIdentity(one.profile,one.binaries,one.control)===mounts[0]);
  if(!selected.length)return undefined;
  // Several readers may share this exact image. They have the same execution
  // boundary; their policy and transitive inputs remain separate in the receipt.
  return readingEnvironment(hash,process.env,join(store,'cas','laid',mounts[0]!.slice(7)),[]);
 };
}
