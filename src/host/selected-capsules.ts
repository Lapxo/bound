import { capsuleAt } from './capsule.ts';
import type { Capsule } from './capsule.ts';
import {capsuleOffers,providerInputs,providerInputRegions,capsuleDescriptor,assertCapsuleDescriptor} from '@lapxo/topos/standing';
import {fullDigest} from './digest.ts';
import {wireAt,parse} from '@lapxo/topos/wire';
import {selectedTopoi,toposAt} from './selected-topos.ts';
import type {ToposResolver} from './selected-topos.ts';
import {canonical} from '@lapxo/topos/wire';
import {ownLock} from '../observe/runner.ts';
import {capsuleEntry} from './capsule-selection.ts';

/** Only explicit capsule offers request execution. Forms/classes/views do not need an executable alias. */
export function selectedCapsules(pins: readonly string[], resolve: typeof capsuleAt = capsuleAt, select:ToposResolver=toposAt, host:readonly string[]=ownLock()): readonly { readonly capsule: Capsule; readonly offer: string }[] {
  return selectedTopoi(pins,select).flatMap(({digest,topos})=>capsuleOffers(topos).map(offer=>{
    const load=()=>{
      const entry=capsuleEntry(host,digest,offer.value!);
      const loaded=resolve(offer.value!,entry);
      if(loaded===undefined)throw Error(`REFUSE·pin ${digest} · ${offer.scope} · offered capsule ${offer.value} unavailable`);
      return {capsule:loaded,offer:canonical({...offer,shape:entry})};
    };
    const descriptor=capsuleDescriptor(topos,offer.scope??'');
    const loaded=descriptor===undefined?load():undefined;
    const supplied:Capsule=loaded===undefined?{
      digest:offer.value!,selection:`${digest} ${offer.scope}`, ...descriptor!,ask:(requests,reader)=>{
        if(!requests.length)return [];
        const actual=load();assertCapsuleDescriptor(descriptor!.lines,actual.capsule.lines);
        return actual.capsule.ask(requests,reader);
      },
    }:{...loaded.capsule,selection:`${digest} ${offer.scope}`};
    const capsule:Capsule={...supplied,selectedWorld:{standing:topos,offer:offer.scope??''}};
    const projected=loaded?.offer??canonical(offer);
    if(!providerInputRegions(topos,offer.scope??'').length)return {capsule,offer:projected};
    const fields=ownLock().flatMap(line=>{const p=parse(line);return p.kind==='fact'?[p.value.fields]:[];});
    const wire=wireAt(fields,Number.MAX_SAFE_INTEGER),algorithm=wire&&[...wire.digests][0];
    if(!algorithm)throw Error('REFUSE·input instrument has no admitted digest algorithm');
    const selected:Capsule={...capsule,selection:`${digest} ${offer.scope}`,ask:(requests,reader)=>capsule.ask(requests.map(request=>{
      const provider=providerInputs(topos,digest,offer.scope??'',offer.value!,request.region??'',bytes=>fullDigest(bytes,algorithm));
      return provider===undefined?request:{...request,provider};
    }),reader)};
    return {capsule:selected,offer:projected};
  }));
}
