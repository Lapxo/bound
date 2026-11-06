import {archiveCoordinate} from './archive.ts';
import {fieldOf} from '../fold/claims.ts';

export function capsuleEntry(host:readonly string[],standing:string,archive:string):string {
 const projections=host.filter(line=>fieldOf(line,'scope').startsWith('dep/')&&fieldOf(line,'role')==='writes'&&fieldOf(line,'value')===archive);
 if(!projections.length||projections.some(line=>!fieldOf(line,'shape')))throw Error(`REFUSE·pin ${standing} capsule ${archive} needs one host projection`);
 const entries=[...new Set(projections.map(line=>archiveCoordinate(fieldOf(line,'shape'))))];
 if(entries.length!==1)throw Error(`REFUSE·pin ${standing} capsule ${archive} has conflicting host projections`);
 return entries[0]!;
}
