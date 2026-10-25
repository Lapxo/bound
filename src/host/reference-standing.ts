import {parse} from '@lapxo/topos/wire';
import type {ObjectRecord} from '@lapxo/topos/wire';
import {cellInputs} from '@lapxo/topos/cell-inputs';
import {semanticStandingBytes} from '@lapxo/topos/standing';

/** Shared projection after admission; transport order never replaces effective order. */
export function referenceStanding(originals:readonly string[],records:readonly ObjectRecord[]):string {
  const membership=new Set([...cellInputs(records,'semantic-live@2').values()].flat().map(line=>semanticStandingBytes([line])));
  const fields=(line:string)=>{const p=parse(line);if(p.kind!=='fact')throw Error('REFUSE·authenticated-reference original parse');return p.value.fields;};
  const effective=[...originals].sort((a,b)=>Number(fields(a).epoch)-Number(fields(b).epoch));
  return semanticStandingBytes(effective.filter(line=>fields(line).type===undefined||membership.has(semanticStandingBytes([line]))));
}

export function referenceContracts(value:{readonly refusals:string;readonly standing:string}):boolean {
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2&&/^sha256:[a-f0-9]{64}$/.test(value.refusals)&&/^sha256:[a-f0-9]{64}$/.test(value.standing);
}

export interface ReferenceContext {
  readonly semanticIdentity:string; readonly epoch:number; readonly proofScope:string;
  readonly policy:string; readonly formImplementation:string; readonly signers:unknown;
  readonly algorithms:readonly string[]; readonly contracts:{readonly refusals:string;readonly standing:string};
  readonly maxBytes:number; readonly maxRecords:number;
}

/** This versioned context frame binds interpretation contracts without changing wire fields. */
export function referenceContextBytes(context:ReferenceContext):Uint8Array {
  return new TextEncoder().encode(JSON.stringify(['reference-export-context@1',context.semanticIdentity,context.epoch,context.proofScope,context.policy,context.formImplementation,context.signers,context.algorithms,context.contracts.refusals,context.contracts.standing,context.maxBytes,context.maxRecords])+'\n');
}
