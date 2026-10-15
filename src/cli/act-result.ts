import{hashText}from'../host/hash.ts';
import {hasContextualPlace,contextualAct} from '../host/contextual-place.ts';
import {createHash} from 'node:crypto';
import {actResultOf,actResultProfile,type ActResult} from '@lapxo/topos/wire';
import {actLines,intactLocalAct,localActResult,type LocalActBundle} from '../host/ports/local-act.ts';
import {storeOf} from '../land/ledger.ts';
import {lockStanding} from '../fold/keys.ts';
import {authorityFor,writerFor} from '../fold/signers.ts';
import {eraOf} from '../fold/digests.ts';
import {fieldOf,isConfig,foldClaims,parsedLine} from '../fold/claims.ts';
import {ownRecordAdmitted} from '../fold/signed.ts';
import {admissionAnchor,admissionHistoryAt} from '../fold/admission-history.ts';
import {fullDigest} from '../host/digest.ts';
import {wordOf,wireLine} from '../fold/wire.ts';
import {viewsOf} from '../fold/views.ts';

/** Historical proof only. Exact current bodies, admission history and bootstrap
 * anchor are reread before lookup; this never retains a current command grant. */
const historicalProofs=new WeakMap<object,{readonly fingerprint:string;readonly result:ActResult}>();
function proofFingerprint(identity:string,bundle:LocalActBundle,history:readonly string[],anchor:ReturnType<typeof admissionAnchor>,algorithms:readonly string[]):string{
  const hash=createHash('sha256'),text=hashText.bind(undefined,hash);
  text('legacy-act-historical-proof/1');text(identity);text(bundle.records);text(bundle.receipt);
  text(bundle.placements===undefined?'absent':'present');text(String(bundle.placements?.length??0));
  for(const placement of bundle.placements??[]){text(placement.place);text(placement.records)}
  text(String(history.length));for(const line of history)text(line);
  text(JSON.stringify(anchor));text(String(algorithms.length));for(const algorithm of algorithms)text(algorithm);
  return hash.digest('hex');
}
const freshResult=(result:ActResult):ActResult=>({...result,records:[...result.records]});

/** Public query of a committed identity, using the same admission authority.
 * Native fold evidence has store provenance; it never grants coverage. */
export function verifiedLegacyActResult(root:string,identity:string){
  const store=storeOf(root);
  let observation:{epoch:number;history:readonly string[];before:readonly string[];algorithms:readonly string[];anchor:ReturnType<typeof admissionAnchor>;key:object;fingerprint:string;retained?:ActResult}|undefined;
  const bundle=localActResult(store,identity,(id,current)=>{
    const receipt=parsedLine(current.receipt.trim());
    if(receipt.kind!=='fact')return intactLocalAct(id,current);
    const epoch=Number(fieldOf(current.receipt.trim(),'epoch'));
    const history=admissionHistoryAt(root,epoch),before=history.filter(line=>!isConfig(line)||Number(fieldOf(line,'epoch'))<epoch);
    const algorithms=eraOf(foldClaims(before).standing).admitted,anchor=admissionAnchor(root);
    const fingerprint=proofFingerprint(id,current,history,anchor,algorithms),cached=historicalProofs.get(receipt.value);
    const retained=cached?.fingerprint===fingerprint?cached.result:undefined;
    observation={epoch,history,before,algorithms,anchor,key:receipt.value,fingerprint,...(retained?{retained}:{})};
    return retained!==undefined||intactLocalAct(id,current);
  });
  if(!bundle)throw Error('REFUSE·act no committed result '+identity);
  if(!observation)throw Error('REFUSE·act historical proof observation absent');
  const records=actLines(bundle.records),{epoch,history,before,algorithms,anchor,retained}=observation;
  if(retained)return {result:freshResult(retained),bundle,records,epoch,history};
  const authority=authorityFor(history,anchor,algorithms);
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
  const kept=Object.freeze({...result,records:Object.freeze([...result.records])});
  historicalProofs.set(observation.key,{fingerprint:observation.fingerprint,result:kept});
  return {result:freshResult(kept),bundle,records,epoch,history};
}

export function printActResult(root:string,identity:string|undefined):void {
  const store=storeOf(root),standing=lockStanding(store),view=viewsOf(standing).get('act');
  if(!view||view.shape||!view.regions.some(region=>region.name==='act'))throw Error('REFUSE·view act requires an admitted result profile and act view');
  if(!identity)throw Error('REFUSE·act name one committed identity');
  if(hasContextualPlace(root)){const contextual=contextualAct(root,identity);if(contextual){process.stdout.write(JSON.stringify(contextual)+'\n');return}}
  const {result,bundle}=verifiedLegacyActResult(root,identity);
  process.stdout.write(`ACT ${result.identity} · epoch ${result.epoch} · admitted · conformance not asserted\n`+bundle.records+bundle.receipt);
}
