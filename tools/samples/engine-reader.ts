import{objectFold}from'../../dist/engine/object.js';
import{objectHistory,validateObjectContext}from'@lapxo/topos/wire';
import{intervalForm,alphabetOfForm}from'@lapxo/topos/forms';

/** Adapter for the declared formed-place samples; all parsing and projection
 * belong to the same Topos and Bound implementations used by the engine. */
export function observe(bytes:Uint8Array){
 const sample=JSON.parse(new TextDecoder().decode(bytes)),history=objectHistory(sample.history);
 if(history.kind!=='fact')throw Error('REFUSE·'+history.why);
 const granted=(family:string,id:string,by:string,scope:string)=>history.value.configuration.filter(row=>row.scope===`${family}/${id}`&&row.value===id&&row.by===by&&(row.condition??'').split('|').includes(scope)).length===1;
 const context={resolve(cell:any){const form=[intervalForm,alphabetOfForm].find(one=>one.id===cell.fields.form);if(!form)throw Error('REFUSE·codec sample has no selected form');return{digest:sample.pin,form,params:JSON.parse(cell.fields.params)}},origin:(id:string,by:string,scope:string)=>granted('evidence/origin',id,by,scope),witness:(id:string,by:string,scope:string)=>granted('evidence/witness',id,by,scope)};
 const checked=validateObjectContext(history.value.objects,{...context,admit:()=>true});
 if(checked.kind!=='fact')throw Error('REFUSE·'+checked.why);
 const actual=objectFold(checked.value,context);
 if(JSON.stringify(actual)!==JSON.stringify(sample.expected))throw Error('REFUSE·engine projection differs from captured native output');
 return[{scope:'conformance/engine-object/'+sample.name,role:'writes',measure:'count',bound:{kind:'interval',lo:0,hi:0}}];
}
