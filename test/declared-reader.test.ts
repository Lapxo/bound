import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonical} from '@lapxo/topos/wire';
import {capsuleReadersOf} from '../src/fold/readers.ts';
import {selectionLines, type capsulesFor} from '../src/fold/reach.ts';

const wire=[canonical({scope:'wire/region-measures',value:'coordinates'}),canonical({scope:'wire/region-coordinate',value:'coordinates'})];
const offer=canonical({scope:'dep/reader-world',value:'sha256:provider',shape:'run.mjs'});
const selected=(() => [{offer,capsule:{digest:'sha256:provider',lines:[canonical({scope:'region/surface',measure:'writes',value:'readings/**'})],declaration:{regions:{surface:['*.input']}}}}]) as unknown as typeof capsulesFor;
function fixture(run:(root:string,store:string)=>void){
 const root=mkdtempSync(join(tmpdir(),'bound-declared-region-')),store=join(root,'.bound');
 try{mkdirSync(store);mkdirSync(join(root,'place'));writeFileSync(join(root,'place','TARGET.bound'),canonical({scope:'region/surface',form:'alphabet',measure:'coordinates',value:'*.input',role:'reads',at:'policy:region',by:'target'})+'\n');run(root,store);}finally{rmSync(root,{recursive:true,force:true});}
}

test('a declared region gets its provider without retired readers or a private ledger',()=>fixture((root,store)=>{
 const got=capsuleReadersOf(root,store,wire,[],selected);
 assert.equal(got.length,1);assert.equal(got[0]!.capsule!.digest,'sha256:provider');
 assert.deepEqual(got[0]!.where,['place/']);assert.deepEqual(got[0]!.capsule!.reads,['*.input']);
 assert.deepEqual([...got[0]!.capsule!.globs],[['place/',['*.input']]]);
 assert.deepEqual(readdirSync(store),[]);
}));
test('an active reader retains ownership; no second reader is scheduled',()=>fixture((root,store)=>{
 const existing={id:'declared',module:'reader-world/surface',where:['place/'],shape:['run'],kind:'process' as const};
 assert.deepEqual(capsuleReadersOf(root,store,wire,[existing],selected),[]);
}));
test('a declared region without a matching provider stays unobserved',()=>fixture((root,store)=>{
 assert.deepEqual(capsuleReadersOf(root,store,wire,[],()=>[]),[]);
 const unrelated=(() => [{offer,capsule:{digest:'sha256:provider',lines:[canonical({scope:'region/other',measure:'writes',value:'readings/**'})],declaration:{regions:{other:['*.input']}}}}]) as unknown as typeof capsulesFor;
 assert.deepEqual(capsuleReadersOf(root,store,wire,[],unrelated),[]);
}));


test('a repository root is a place; declared input globs are not limited to sibling directories',()=>fixture((root,store)=>{
 writeFileSync(join(root,'TARGET.bound'),canonical({scope:'region/surface',form:'alphabet',measure:'coordinates',value:'src/*.input',role:'reads',at:'policy:region',by:'target'})+'\n');
 const got=capsuleReadersOf(root,store,wire,[],selected);assert.equal(got.length,1);
 assert.deepEqual(got[0]!.where,['','place/']);
 assert.deepEqual([...got[0]!.capsule!.globs],[['',['src/*.input']],['place/',['*.input']]]);
 const existing={id:'root-reader',module:'reader-world/surface',where:[''],shape:['run'],kind:'process' as const};
 const childOnly=capsuleReadersOf(root,store,wire,[existing],selected);assert.deepEqual(childOnly[0]!.where,['place/']);
}));


test('declared readers use the place own selection without adopting another place selection',()=>fixture((root,store)=>{
 const pin=canonical({scope:'uses/domain',form:'alphabet',measure:'digest',value:'sha256:local',role:'writes',at:'policy:selection',by:'target'});
 writeFileSync(join(root,'place','TARGET.bound'),readOwn()+pin+'\n');
 const foreign=canonical({scope:'uses/domain',value:'sha256:foreign'});
 const resolver:typeof capsulesFor=(standing,place,selectedRoot)=>{
  assert.equal(selectedRoot,root);
  const pins=selectionLines({root:selectedRoot!,standing,under:place ? place+'/' : undefined});
  return pins.includes(pin) ? selected(standing,place,selectedRoot) : [];
 };
 assert.deepEqual(capsuleReadersOf(root,store,[...wire,foreign],[],resolver)[0]!.where,['place/']);
 writeFileSync(join(root,'place','TARGET.bound'),readOwn());
 assert.deepEqual(capsuleReadersOf(root,store,[...wire,foreign],[],resolver),[]);
 function readOwn(){return canonical({scope:'region/surface',form:'alphabet',measure:'coordinates',value:'*.input',role:'reads',at:'policy:region',by:'target'})+'\n';}
}));
