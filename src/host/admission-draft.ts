import {canonical,parse} from '@lapxo/topos/wire';
import {isConfig} from '../fold/claims.ts';
import {refuseHost as fail} from './host-controls.ts';

export function rootDraftRecords(bytes:Uint8Array,limit:number):readonly string[]{
 let text:string;
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return fail('snapshot-format')}
 const records=text.endsWith('\n')?text.slice(0,-1).split('\n'):[];
 if(!records.length||records.length>limit)fail('budget');
 for(const line of records){
  const parsed=parse(line);
  if(parsed.kind!=='fact'||canonical(parsed.value.fields,parsed.value.version)!==line||!isConfig(line)||
   parsed.value.fields.by!=='target'||parsed.value.fields.epoch!==undefined||parsed.value.fields.sig!==undefined)fail('root-lot-format');
 }
 return records;
}
