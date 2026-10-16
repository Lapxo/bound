import {readFileSync} from 'node:fs';
import {sha256} from './hash.ts';
/** Exact shipped interpretation contracts; this helper grants no authority. */
export function installedReferenceContracts(){
 return{refusals:sha256(readFileSync(new URL('../../docs/contracts/refusals.bound',import.meta.url))),standing:sha256(readFileSync(new URL('../../docs/contracts/standing.bound',import.meta.url)))};
}
