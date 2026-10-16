import{join}from'node:path';
import{existsSync,readFileSync,readdirSync}from'node:fs';
import{storeOf}from'../land/ledger.ts';
export type BootstrapAnchor={readonly id:string;readonly publicKey:string;readonly coverage:readonly string[]};
/** Read the existing place-local root of trust. Names and current claims select no authority. */
export function bootstrapAnchor(root:string):BootstrapAnchor|undefined{
  const store=storeOf(root);
  const files=existsSync(store)?readdirSync(store).filter(name=>name.endsWith('.keys')).sort():[];
  if(!files.length)return undefined;
  const candidates=files.map(name=>{
    let keys:Record<string,{id:string;publicKey:string;coverage:readonly string[]}>;
    try{keys=JSON.parse(readFileSync(join(store,name),'utf8'));}
    catch{throw Error('REFUSE·act bootstrap anchor is unreadable');}
    const anchors=Object.values(keys??{}),anchor=anchors[0];
    if(anchors.length!==1||!anchor||typeof anchor.id!=='string'||!anchor.id||typeof anchor.publicKey!=='string'||!anchor.publicKey||!Array.isArray(anchor.coverage)||!anchor.coverage.length||anchor.coverage.some(scope=>typeof scope!=='string'||!scope))
      throw Error('REFUSE·act historical admission requires one bootstrap anchor');
    return anchor;
  });
  const identities=new Set(candidates.map(anchor=>JSON.stringify([anchor.id,anchor.publicKey,[...new Set(anchor.coverage)].sort()])));
  if(identities.size!==1)throw Error('REFUSE·act conflicting bootstrap anchors');
  const anchor=candidates[0]!;
  return {id:anchor.id,publicKey:anchor.publicKey,coverage:anchor.coverage};
}
