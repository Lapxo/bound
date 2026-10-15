import {AsyncLocalStorage} from 'node:async_hooks';
import type {NativeRoute} from './native/route.ts';

// An opaque instrument selection travels with one observation. A request or a
// world's response cannot select its executor or replace another reader's port.
const active=new AsyncLocalStorage<NativeRoute>();
export const nativeReaderRoute=active.getStore.bind(active);
export function withNativeReaderRoute<T>(route:NativeRoute|undefined,run:()=>T):T{
 return route===undefined?run():active.run(route,run);
}
