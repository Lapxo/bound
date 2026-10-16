import{hashText}from'./hash.ts';
import {admissionAnchor,admissionHistoryAt} from '../fold/admission-history.ts';
import {authorityFor} from '../fold/signers.ts';
import {eraOf} from '../fold/digests.ts';
import {fieldOf,foldClaims,isConfig} from '../fold/claims.ts';
import {foldedEvidence} from '@lapxo/topos/contract';
import {createHash} from 'node:crypto';

// One bounded historical projection, never a current authority/lease verdict.
// Its complete inputs are reread before lookup, including original signatures.
let historicalProjection:{readonly identity:string;readonly standing:readonly string[]}|undefined;
function historicalIdentity(history:readonly string[],anchor:ReturnType<typeof admissionAnchor>):string{
 const hash=createHash('sha256'),text=hashText.bind(undefined,hash);
 text('authenticated-root-history/1');text(String(history.length));for(const line of history)text(line);text(JSON.stringify(anchor));
 return hash.digest('hex');
}

/** Existing admission-snapshot authentication and folded live projection.
 * Consumer configuration evidence only; never a new authority lock. */
export function authenticatedRootStanding(root:string):readonly string[]{
  const history=admissionHistoryAt(root,Number.MAX_SAFE_INTEGER),anchor=admissionAnchor(root);
  const identity=historicalIdentity(history,anchor);
  if(historicalProjection?.identity===identity)return [...historicalProjection.standing];
  const snapshots=new Map<number,ReturnType<typeof authorityFor>>();
  const admitted=history.filter(line=>{
    const epoch=Number(fieldOf(line,'epoch'))||0;
    let authority=snapshots.get(epoch);
    if(!authority){
      // This invocation has freshly read the complete signed inventory. Derive
      // the same historical cutoff without reopening it for every epoch; the
      // next invocation still rereads every authority input.
      const snapshot=history.filter(record=>!isConfig(record)||Number(fieldOf(record,'epoch'))<=epoch);
      // The signature vocabulary is configuration, not the as-yet
      // unauthenticated evidence whose values are about to be folded.
      const wire=snapshot.filter(record=>{
        const scope=fieldOf(record,'scope');
        return scope.startsWith('wire/')||scope.startsWith('audit/wire/');
      });
      authority=authorityFor(snapshot,anchor,eraOf(foldClaims(wire).standing).admitted);
      snapshots.set(epoch,authority);
    }
    return authority.of(line).kind==='admitted';
  });
  // The host authenticates against historical authority; Topos projects the
  // authenticated history using the instrument's existing fold.
  const {standing}=foldedEvidence(admitted,{
    classification:()=> 'local',
    fold:lines=>foldClaims(lines).standing,
  });
  historicalProjection={identity,standing:Object.freeze([...standing])};
  return [...standing];
}

/** Legacy Root lines remain unchanged; contextual public output has its own carrier. */
export const authenticatedStanding=authenticatedRootStanding;
