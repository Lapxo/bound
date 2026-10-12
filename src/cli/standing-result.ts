import {viewsOf} from '../fold/views.ts';
import {lockStanding} from '../fold/keys.ts';
import {admissionAnchor,admissionHistoryAt} from '../fold/admission-history.ts';
import {authorityFor} from '../fold/signers.ts';
import {eraOf} from '../fold/digests.ts';
import {fieldOf,foldClaims} from '../fold/claims.ts';
import {storeOf} from '../land/ledger.ts';
import {foldedEvidence} from '@lapxo/topos/contract';

/** An evidence projection, never a new authority lock. Authentication uses
 * the admission snapshot at each local epoch; the existing fold applies
 * supersessions and withdrawals across all declared classes. Storage layout
 * and delivery mode do not enter this public boundary. */
export function printStandingResult(root:string):void {
  const store=storeOf(root),view=viewsOf(lockStanding(store)).get('standing');
  if(!view||view.shape||!view.regions.some(region=>region.name==='standing'))
    throw Error('REFUSE·view standing requires a declared standing view');
  const history=admissionHistoryAt(root,Number.MAX_SAFE_INTEGER),anchor=admissionAnchor(root);
  const snapshots=new Map<number,ReturnType<typeof authorityFor>>();
  const admitted=history.filter(line=>{
    const epoch=Number(fieldOf(line,'epoch'))||0;
    let authority=snapshots.get(epoch);
    if(!authority){
      const snapshot=admissionHistoryAt(root,epoch);
      // The signature vocabulary is configuration, not the as-yet
      // unauthenticated evidence whose values are about to be folded.
      const wire=snapshot.filter(record=>fieldOf(record,'scope').startsWith('wire/'));
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
  process.stdout.write(standing.length?standing.join('\n')+'\n':'');
}
