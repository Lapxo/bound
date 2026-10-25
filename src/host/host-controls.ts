import {LOCK} from '@lapxo/topos/wire';
import {BoundRefusal} from './refusals.ts';

/** Shared host refusals preserve the public code and diagnostic at every port. */
export function refuseHost(code:string):never {
 throw new BoundRefusal('host/'+code,'REFUSE·host/'+code);
}
export function assertHostNotCancelled(signal?:AbortSignal):void {
 if(signal?.aborted)refuseHost('cancelled');
}
/** Clock validation is shared; each boundary keeps its own refusal producer. */
export function receiverClock(text:string,refuse:(why:string)=>never):number {
 if(!/^(0|[1-9][0-9]*)$/.test(text)||!Number.isSafeInteger(Number(text)))refuse('unknown receiver clock');
 return Number(text);
}
/** Coordinates use the wire's lock name, never a second spelling in a host. */
export const isPlaceLockCoordinate=(coordinate:string):boolean=>typeof coordinate==='string'&&coordinate.endsWith('/'+LOCK)&&!coordinate.startsWith('/')&&!coordinate.split('/').some(part=>!part||part==='.'||part==='..');
export const placeRegionOf=(coordinate:string):string=>coordinate==='.'?'':coordinate.slice(0,-(LOCK.length+1));
