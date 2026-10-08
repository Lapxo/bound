import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonical} from '@lapxo/topos/wire';
import {foldClaims} from '../src/fold/claims.ts';

for(const scope of ['wire/fields','region/proofs'])test(`file receipts never erase nonregional declarations at ${scope}`,()=>{
 const row=(value:string,by:string)=>canonical({scope,role:'writes',form:'alphabet',measure:'id',value,by,at:'policy:declaration',epoch:'1'});
 const lines=[row('left','one'),row('right','two')];
 for(const receipts of [[],[{scope,moved:['unrelated.txt']}], [{scope,moved:[]}]]){
  const got=foldClaims(lines,receipts);
  assert.deepEqual(new Set(got.standing),new Set(lines));
  assert.deepEqual(got.vacuous,[],'absence of file regions cannot be evidence of payment');
 }
 const single=foldClaims([lines[0]!],[]);assert.deepEqual(single.standing,[lines[0]]);
});
