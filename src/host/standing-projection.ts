import {viewsOf} from '../fold/views.ts';
import {BoundRefusal} from './refusals.ts';
import type {Signer} from '@lapxo/topos/wire';
import {authorityFor} from '../fold/signers.ts';
import {signatureEraOf as eraOf} from './signature-era.ts';
import {fieldOf,foldClaims,isConfig} from '../fold/claims.ts';
import {foldedEvidence} from '@lapxo/topos/contract';

/** Project the supplied signed history against the host's original trust anchor.
 * No current-root selection, storage access, effects or retained authority.
 * The file host and the in-process host use this same admission-snapshot fold. */
export function projectAuthenticatedStanding(history:readonly string[],anchor:Signer):readonly string[]{
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
  return [...standing];
}

/** One check shared by the CLI and the read-only native host. */
export function assertStandingView(lines:readonly string[]):void{
 const view=viewsOf(lines).get('standing');
 if(!view||view.shape||!view.regions.some(region=>region.name==='standing'))
  throw new BoundRefusal('standing/view','REFUSE·view standing requires a declared standing view');
}
export function publicStandingProjection(history:readonly string[],anchor:Signer):readonly string[]{
 return publishedStandingLines(projectAuthenticatedStanding(history,anchor));
}

export function publishedStandingLines(standing:readonly string[]):readonly string[]{
 return standing.filter(line=>!isConfig(line)||fieldOf(line,'value')!=='withdraw');
}
