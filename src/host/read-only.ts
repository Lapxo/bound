import {AsyncLocalStorage} from 'node:async_hooks';

/** Prospective evaluation may read existing evidence and calculate values, but cannot acquire evidence or persist caches. */
const mode = new AsyncLocalStorage<boolean>();
export const readOnly = (): boolean => mode.getStore() === true;
export const withoutEffects = <T>(evaluate: () => T): T => mode.run(true, evaluate);
export function requireEffects(operation: string): void {
  if (readOnly()) throw Error(`REFUSE·preview ${operation} requires an act; fold the declared inputs first`);
}
