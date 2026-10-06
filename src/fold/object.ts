import {cell,sign,join,require as requireFloor,observe,mark,parts,state,live,restOf} from '@lapxo/obligations/views/field';
import type {World,Mark,Cell} from '@lapxo/obligations/views/field';
import type {ObjectRecord,ObjectContext} from '@lapxo/topos/wire';
import {restCoordinates} from '@lapxo/topos/wire';
/** Projection dispatches admitted acts into Obligatory; it defines no meet or propagation. */
export interface ObjectReading{cell:string;state:string;parts:Cell<unknown>;rest:readonly string[];ownMarks:readonly (string|undefined)[];ownClaims:readonly {id:string|undefined;origin:string}[];marks:readonly Mark<unknown>[];claims:readonly unknown[]}
export function objectFold(records:readonly ObjectRecord[],context:ObjectContext):readonly ObjectReading[]{
 let world:World<unknown>=new Map();const definitions=new Map(records.filter(r=>r.record==='cell').map(r=>[r.fields.scope!,r]));
 const codecs=new Map([...definitions].map(([name,c])=>[name,context.resolve(c)]));
 const ids=new Map(records.map(r=>[r.fields.id!,r]));
 for(const record of [...records].sort((a,b)=>Number(a.fields.epoch)-Number(b.fields.epoch))){
  const f=record.fields,name=f.scope!,at=Number(f.epoch);
  if(record.record==='cell'){world=new Map([...world,[name,cell(name,at,[],restCoordinates(f.restsOn!)!)]]);continue;}
  const codec=codecs.get(name)!,L=codec.form.lattice(codec.params),held=world.get(name)!;
  if(record.record==='claim'){
   const target=f.sign==='-1'?ids.get(f.takes!)!.fields:f;
   const changed=observe(held,{id:f.id!,at,origin:target.origin!,span:codec.form.parse(codec.params,target.value!),...(f.takes?{takes:f.takes}:{})},f.sign==='-1'?-1:1);
   const seen=[...changed.seen];seen[seen.length-1]={...seen.at(-1)!,id:f.id!};world=new Map([...world,[name,{...changed,seen}]]);
  }else if(f.sign==='-1'){
   const target=ids.get(f.takes!)!.fields;
   world=new Map([...world,[name,{...held,marks:[...(held.marks??[]),mark({id:f.id!,at,takes:f.takes!,pole:target.pole as Mark<unknown>['pole'],reach:'local',span:codec.form.parse(codec.params,target.value!)})]}]]);
  }else if(f.widens!==undefined){
   const changed=join(L,held,codec.form.parse(codec.params,f.value!),f.widens,at);
   const marks=[...(changed.marks??[])];marks[marks.length-1]={...marks.at(-1)!,id:f.id!};world=new Map([...world,[name,{...changed,marks}]]);
  }else{
   const span=codec.form.parse(codec.params,f.value!);
   world=f.pole==='floor'?requireFloor(L,world,name,span,{id:f.id!,at}):sign(L,world,name,span,{id:f.id!,at});
  }
 }
 return [...world].map(([name,c])=>{const codec=codecs.get(name)!,L=codec.form.lattice(codec.params);return {cell:name,state:state(L,c,world),parts:parts(L,c,world),rest:restOf(c,world),ownMarks:live(c.marks??[]).map(m=>m.id),ownClaims:live(c.seen).map(s=>({id:s.id,origin:s.origin})),marks:live(c.marks??[]),claims:live(c.seen)};});
}
