import {actResultOf,actResultProfile} from '@lapxo/topos/wire';
import {actLines,intactLocalAct,localActResult} from '../host/ports/local-act.ts';
import {storeOf} from '../land/ledger.ts';
import {lockStanding} from '../fold/keys.ts';
import {authorityFor,writerFor} from '../fold/signers.ts';
import {eraOf} from '../fold/digests.ts';
import {fieldOf,isConfig,foldClaims} from '../fold/claims.ts';
import {ownRecordAdmitted} from '../fold/signed.ts';
import {admissionAnchor,admissionHistoryAt} from '../fold/admission-history.ts';
import {fullDigest} from '../host/digest.ts';
import {wordOf,wireLine} from '../fold/wire.ts';
import {viewsOf} from '../fold/views.ts';

/** Public query of a committed identity, using the same admission authority.
 * Native fold evidence has store provenance; it never grants coverage. */
export function printActResult(root:string,identity:string|undefined):void{
  const store=storeOf(root),standing=lockStanding(store);
  const view=viewsOf(standing).get('act');
  if(!view||view.shape||!view.regions.some(region=>region.name==='act'))throw Error('REFUSE·view act requires an admitted result profile and act view');
  if(!identity)throw Error('REFUSE·act name one committed identity');
  const bundle=localActResult(store,identity,intactLocalAct);
  if(!bundle)throw Error('REFUSE·act no committed result '+identity);
  const records=actLines(bundle.records),epoch=Number(fieldOf(bundle.receipt.trim(),'epoch'));
  const history=admissionHistoryAt(root,epoch),before=history.filter(line=>!isConfig(line)||Number(fieldOf(line,'epoch'))<epoch);
  const algorithms=eraOf(foldClaims(before).standing).admitted;
  const authority=authorityFor(history,admissionAnchor(root),algorithms);
  const admittedBefore=foldClaims(before.filter(line=>authority.of(line).kind==='admitted')).standing;
  const profile=actResultProfile(admittedBefore);
  if(!profile)throw Error('REFUSE·act no result profile at admission');
  const family=authority.admitted.some(signer=>!signer.coverage.includes('*'))?wordOf(admittedBefore,'families','region'):'';
  const algorithm=identity.slice(0,identity.indexOf(':'));
  const named=fieldOf(wireLine(admittedBefore,'digest-algorithms')??'','value').split('|').map(value=>value.split(':')[0]);
  if(!named.includes(algorithm))throw Error('REFUSE·act digest algorithm was not admitted at commitment');
  const result=actResultOf(records,bundle.receipt.trim(),{...profile,localEpoch:epoch,
    digest:bytes=>fullDigest(bytes,algorithm),
    placements:bundle.placements!.map(p=>({place:p.place,records:actLines(p.records)})),
    admitsRecord:line=>{
      if(isConfig(line)&&Number(fieldOf(line,'epoch'))!==epoch)return false;
      return bundle.placements!.some(p=>actLines(p.records).includes(line)&&(p.place==='.'?authority.of(line).kind==='admitted':ownRecordAdmitted(line,p.place.slice(0,p.place.lastIndexOf('/')),family,authority.admitted,algorithms)));
    },
    verifiesReceipt:line=>fieldOf(line,'by')===writerFor(admittedBefore,'fold')&&intactLocalAct(identity,bundle),
  });
  process.stdout.write(`ACT ${result.identity} · epoch ${result.epoch} · admitted · conformance not asserted\n`+bundle.records+bundle.receipt);
}
