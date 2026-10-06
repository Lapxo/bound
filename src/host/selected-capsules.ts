import { capsuleAt } from './capsule.ts';
import type { Capsule } from './capsule.ts';
import {capsuleOffers} from '@lapxo/topos/standing';
import {selectedTopoi,toposAt} from './selected-topos.ts';
import type {ToposResolver} from './selected-topos.ts';
import {canonical} from '@lapxo/topos/wire';
import {fieldOf} from '../fold/claims.ts';
import {ownLock} from '../observe/runner.ts';
import {archiveCoordinate} from './archive.ts';

/** Only explicit capsule offers request execution. Forms/classes/views do not need an executable alias. */
export function selectedCapsules(pins: readonly string[], resolve: typeof capsuleAt = capsuleAt, select:ToposResolver=toposAt, host:readonly string[]=ownLock()): readonly { readonly capsule: Capsule; readonly offer: string }[] {
  return selectedTopoi(pins,select).flatMap(({digest,topos})=>capsuleOffers(topos).map(offer=>{
    const projections=host.filter(line=>fieldOf(line,'scope').startsWith('dep/')&&fieldOf(line,'role')==='writes'&&fieldOf(line,'value')===offer.value);
    if(!projections.length||projections.some(line=>!fieldOf(line,'shape')))throw Error(`REFUSE·pin ${digest} capsule ${offer.value} needs one host projection`);
    const entries=[...new Set(projections.map(line=>archiveCoordinate(fieldOf(line,'shape'))))];
    if(entries.length!==1)throw Error(`REFUSE·pin ${digest} capsule ${offer.value} has conflicting host projections`);
    const projected={...offer,shape:entries[0]!};
    const capsule=resolve(offer.value!,projected.shape);
    if(capsule===undefined)throw Error(`REFUSE·pin ${digest} · ${offer.scope} · offered capsule ${offer.value} unavailable`);
    return {capsule,offer:canonical(projected)};
  }));
}
