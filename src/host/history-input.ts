import {readFileSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {parse,wireAt} from '@lapxo/topos/wire';
import {bytesDigest} from './digest.ts';
import {ownLock} from '../observe/runner.ts';
import {fieldOf,isWire} from '../fold/claims.ts';

/** A native view can ask for an immutable signed history coordinate.
 * The wire decodes it; delivery epochs and signatures are never reconstructed.
 */
export function historyInput(root:string,standing:readonly string[],view:string,local:readonly string[]):readonly string[]{
 const declarations=standing.filter(line=>fieldOf(line,'scope')===`view/${view}`&&fieldOf(line,'value')!=='withdraw');
 const inputs=[...new Set(declarations.flatMap(line=>fieldOf(line,'needs').split('|').filter(Boolean)))];
 if(!inputs.length)return local;
 const wire=wireAt(ownLock().flatMap(line=>{const p=parse(line);return p.kind==='fact'?[p.value.fields]:[];}),Number.MAX_SAFE_INTEGER);
 const algorithm=wire?.digests.values().next().value;
 if(!algorithm)throw Error('REFUSE·history no admitted input digest algorithm');
 const pins=new Set(declarations.flatMap(line=>fieldOf(line,'restsOn').split('|').filter(Boolean)));
 const history:string[]=[];
 for(const input of inputs){
  if(isAbsolute(input)||input.split('/').includes('..'))throw Error(`REFUSE·history ${input} escapes the place`);
  const path=resolve(root,input);
  let actual:string;
  try{actual=realpathSync(path);}catch{throw Error(`REFUSE·history ${input} input is unavailable`);}
  const escaped=relative(realpathSync(root),actual);
  if(escaped==='..'||escaped.startsWith('../')||isAbsolute(escaped))throw Error(`REFUSE·history ${input} escapes the place`);
  const bytes=readFileSync(path),digest=bytesDigest(bytes,algorithm);
  if(!pins.has(digest))throw Error(`REFUSE·history ${input} input digest ${digest} is not named by view/${view}`);
  for(const line of bytes.toString('utf8').split('\n').filter(Boolean)){
   if(!isWire(line)||parse(line).kind!=='fact')throw Error(`REFUSE·wire ${input} contains a non-wire history line`);
   history.push(line);
  }
 }
 return [...new Set([...local,...history])];
}
