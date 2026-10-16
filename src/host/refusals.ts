import {parse,canonical} from '@lapxo/topos/wire';

export interface RefusalEntry {readonly code:string;readonly category:string;readonly meaning:string;readonly next:string}
/** Stable code assigned at the cause. Details are diagnostic, never parsed as policy. */
export class BoundRefusal extends Error {
 readonly code:string;
 constructor(code:string,diagnostic:string){super(diagnostic);this.name='BoundRefusal';this.code=code;}
}
/** Pure machine contract reader. A catalog is data, never an authority grant. */
export function readRefusalCatalog(text:string):readonly RefusalEntry[] {
 const groups=new Map<string,Map<string,Readonly<Record<string,string>>>>();let profile=false;
 for(const line of text.trimEnd().split('\n')){
  const parsed=parse(line);if(parsed.kind!=='fact'||canonical(parsed.value.fields)!==line)throw new BoundRefusal('catalog/invalid','REFUSE·invalid refusal catalog line');
  const f=parsed.value.fields;
  if(f.scope==='refusal/catalog'&&f.measure==='id'&&f.value==='bound-refusals@1'&&f.role==='writes'&&f.form==='alphabet'&&!profile){profile=true;continue;}
  if(f.role!=='writes'||f.form!=='alphabet'||!f.scope?.startsWith('refusal/')||!['code','class','next'].includes(f.measure??''))throw new BoundRefusal('catalog/invalid','REFUSE·invalid refusal catalog record');
  const group=groups.get(f.scope)??new Map();if(group.has(f.measure!))throw new BoundRefusal('catalog/invalid','REFUSE·duplicate refusal catalog field');group.set(f.measure!,f);groups.set(f.scope,group);
 }
 const entries:RefusalEntry[]=[];
 for(const [scope,group] of groups){
  const code=group.get('code')?.value,category=group.get('class')?.value,meaning=group.get('class')?.about,next=group.get('next')?.value;
  if(group.size!==3||!code||scope!=='refusal/'+code||!category||!meaning||!next)throw new BoundRefusal('catalog/invalid','REFUSE·incomplete refusal catalog entry');
  entries.push(Object.freeze({code,category,meaning,next}));
 }
 if(!profile||!entries.length)throw new BoundRefusal('catalog/invalid','REFUSE·missing refusal catalog profile');
 return Object.freeze(entries);
}
export function describeRefusal(error:BoundRefusal,catalog:readonly RefusalEntry[]):RefusalEntry {
 const entry=catalog.find(row=>row.code===error.code);
 if(!entry)throw new BoundRefusal('catalog/invalid','REFUSE·undeclared refusal code');return entry;
}
