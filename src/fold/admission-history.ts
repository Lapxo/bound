import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import type {Signer} from '@lapxo/topos/wire';
import {ledgerLines,ledgerWriters,storeOf} from '../land/ledger.ts';
import {fieldOf,isConfig,selfName} from './claims.ts';

/** Local admission history only. Foreign ingress is evidence, never coverage.
 * The clock cutoff is meaningful for configuration; object clocks stay intact. */
export function admissionHistoryAt(root:string,epoch:number):readonly string[]{
  const store=storeOf(root);
  return [...new Set(ledgerWriters(store).flatMap(writer=>ledgerLines(store,writer)))]
    .filter(line=>fieldOf(line,'sig')!==''&&(!isConfig(line)||Number(fieldOf(line,'epoch'))<=epoch));
}

/** The existing bootstrap's public root of trust, not today's key selection. */
export function admissionAnchor(root:string):Signer{
  const at=join(storeOf(root),`${selfName()}.keys`);
  const keys=JSON.parse(readFileSync(at,'utf8')) as Record<string,{id:string;publicKey:string;coverage:readonly string[]}>;
  const anchors=Object.values(keys);
  if(anchors.length!==1||!anchors[0]?.publicKey||!anchors[0].coverage.length)throw Error('REFUSE·act historical admission requires one bootstrap anchor');
  const anchor=anchors[0];
  return {id:anchor.id,keyClass:'authorize',publicKey:anchor.publicKey,coverage:anchor.coverage,
    depth:{lo:1,hi:16},admittedBy:[]};
}
