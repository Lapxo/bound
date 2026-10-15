import type {ReadingReference} from '../reading-context.ts';
/** Existing leaf folds wrap parent names in the context namespace. Resolve that
 * namespace without dropping any inherited identity, and never pick a duplicate.
 */
export function nativeReferenceInputs(inputs:readonly ReadingReference[],required:readonly ReadingReference[]):void{
 const names=new Map(required);const found=new Map<string,string>();
 for(const [encoded,digest]of inputs){let name=encoded;for(;;){let value:unknown;try{value=JSON.parse(name)}catch{break}if(!Array.isArray(value)||value.length!==2||value[0]!=='context'||typeof value[1]!=='string')break;name=value[1];}
  if(!names.has(name))continue;if(found.has(name))throw Error('REFUSE·native reading duplicate context input '+name);found.set(name,digest);
 }
 for(const[name,digest]of required)if(found.get(name)!==digest)throw Error('REFUSE·native reading context omits or changes '+name);
}
