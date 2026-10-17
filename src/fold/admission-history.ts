import{bootstrapAnchor}from'./bootstrap-anchor.ts';
import type {Signer} from '@lapxo/topos/wire';
import {rootLedgerLines,storeOf} from '../land/ledger.ts';
import {fieldOf,isConfig} from './claims.ts';

/** Local admission history only. Foreign ingress is evidence, never coverage.
 * The clock cutoff is meaningful for configuration; object clocks stay intact. */
export function admissionHistoryAt(root:string,epoch:number):readonly string[]{
  const store=storeOf(root);
  return [...new Set(rootLedgerLines(store))]
    .filter(line=>fieldOf(line,'sig')!==''&&(!isConfig(line)||Number(fieldOf(line,'epoch'))<=epoch));
}

/** The original local bootstrap, never today's key selection. */
export function admissionAnchor(root:string):Signer{
  const anchor=bootstrapAnchor(root);
  if(!anchor)throw Error('REFUSE·act historical admission requires one bootstrap anchor');
  return {id:anchor.id,keyClass:'authorize',publicKey:anchor.publicKey,coverage:anchor.coverage,depth:{lo:1,hi:16},admittedBy:[]};
}
