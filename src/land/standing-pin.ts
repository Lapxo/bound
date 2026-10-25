import {topos_standing_readStanding as readStanding} from "../../vendor/library.js";
import {fieldOf} from '../fold/claims.ts';
import {contentAt} from '../host/selected-topos.ts';
import {storeOf} from './ledger.ts';
import {ContentNeeded} from '../host/content-needed.ts';
import {observeFile} from '../observe/files.ts';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';

/** A declared local file is already held content. Check its bytes before
 * admission; neither fetch it nor write a CAS entry during this inspection. */
function heldStanding(root:string,line:string):Uint8Array {
  const digest=fieldOf(line,'value');
  try{return contentAt(digest,storeOf(root));}
  catch(error){if(!(error instanceof ContentNeeded))throw error;}
  const name=fieldOf(line,'needs');
  if(!name || name.includes('|') || name.includes('*'))throw new ContentNeeded(digest);
  const path=resolve(root,name),local=relative(resolve(root),path);
  if(!local || local==='..' || local.startsWith('../'))throw Error('standing coordinate is outside the place');
  const bytes=observeFile(path);
  if(bytes===undefined)throw new ContentNeeded(digest);
  const split=digest.indexOf(':'),algorithm=digest.slice(0,split),hex=digest.slice(split+1);
  if(createHash(algorithm).update(bytes).digest('hex')!==hex)throw Error('standing coordinate content hash mismatch');
  return bytes;
}

/** A new world selection names standing bytes. Artifact aliases remain separate.
 * Admission reads laid content only; it never fetches or executes a provider. */
export function admitStandingPins(root:string, lines:readonly string[], read?: (digest:string)=>Uint8Array):void {
  for(const line of lines){
    const scope=fieldOf(line,'scope'), value=fieldOf(line,'value');
    const parts=scope.split('/');
    if(!(scope==='uses'||parts.slice(0,-1).includes('uses')) || value==='withdraw')continue;
    try{readStanding(new TextDecoder('utf-8',{fatal:true}).decode(read ? read(value) : heldStanding(root,line)));}
    catch(error){throw Error(`REFUSE·pin ${scope} ${value} · ${error instanceof Error?error.message:String(error)} · nothing landed`);}
  }
}
