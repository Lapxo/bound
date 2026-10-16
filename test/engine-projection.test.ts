import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {objectFold} from '../src/engine/index.ts';
import {objectFold as compatibilityFold} from '../src/fold/object.ts';
import {validateObjectContext} from '@lapxo/topos/wire';
import type {ObjectContext,ObjectRecord} from '@lapxo/topos/wire';
import {intervalForm,alphabetOfForm} from '@lapxo/topos/forms';

// Exact JSON projections reproduced from installed published Bound 0.1.9.
// These fixed assertions retain every cell, bound, origin and withdrawal without
// importing a neighbouring checkout or shipping a second implementation.
const baseline:Record<string,string>={
  "yes:compatible": "079cadc915c4936f96e3540de0df3138ae36d9c95b15ae3c2838bf3bd767512e",
  "yes:incompatible-origins": "52642ec621d06d2178e4e737465b1fd685cc67e7a8e1a00c66e8a7c712079e23",
  "yes:withdrawn-claims": "5264ba66adc15c6c80c7314a5e351b2be9e3b33c5d951ad99864a94bd3ff153e",
  "yes:outside-ceiling": "2a063a37a0f1ff3ad52bee9abac8ebcda839f79a7c0a5eff4d7ba68909c52d9a",
  "yes:incompatible-bounds": "b77ec4df967a8601dba47d59c51fe7cf88fafebe2ac3c388d922090041bf5491",
  "yes:withdrawn-opening": "edb70ca519fbcdb31b23dd417bc27d51aa9ca5b1c667aeb2133a5210cb37f996",
  "artifacts:compatible": "2a5e7394cd71c9c731bf3dddef9894ce391889311861445489bb0b6f9876d7c3",
  "artifacts:incompatible-origins": "7696368d9d29b8ee47da55f127d511f0959c928a145169efa29a06e94a7e4e8c",
  "artifacts:withdrawn-claims": "9bd717ec34a1d92578c870322e44a4014d4253658b350f51ecc9260fd9f9f573",
  "artifacts:outside-ceiling": "24b6a96a656541276bf8a09e88d69d3cb782077e1861ad8f22113b9103822629",
  "artifacts:incompatible-bounds": "6ff287ee53c8b55bcd5935bc20c981ab9349c519f595908cfe775f3a4f3cfb0b",
  "artifacts:withdrawn-opening": "dd3957b2c65bac1fc2b0e79ddeae9549854e125c5fb0a31e08a2e7b881445589"
};
for(const sample of ['yes','artifacts'])test(`engine preserves admitted ${sample} sample through conflicts and withdrawals`,()=>{
 const fixture=JSON.parse(readFileSync(new URL(`../samples/typed/${sample}.json`,import.meta.url),'utf8'));
 const digest='sha256:'+'0'.repeat(64);
 const form=fixture.form==='interval'?intervalForm:alphabetOfForm;
 // Synthetic test authority only: this checks projection after structural admission,
 // not cryptographic admission or execution of an untrusted form provider.
 const context:ObjectContext={admit:()=>true,resolve:()=>({digest,form,params:fixture.params}),origin:()=>true,witness:()=>true};
 const records:ObjectRecord[]=[];let epoch=1;
 const append=(fields:Record<string,string>)=>records.push({record:fields.type as ObjectRecord['record'],fields:{...fields,by:'test',epoch:String(epoch++)}});
 for(const cell of fixture.cells)append({...cell,type:'cell',id:'def-'+cell.scope,form:fixture.form,measure:fixture.measure,params:JSON.stringify(fixture.params),topos:digest});
 for(const act of fixture.acts)append(act);
 const read=(scene:string,scope:string,expected:string)=>{
  const admitted=validateObjectContext(records,context);assert.equal(admitted.kind,'fact',JSON.stringify(admitted));
  if(admitted.kind!=='fact')throw Error('fixture not admitted');
  const got=objectFold(admitted.value,context);
  assert.equal(createHash('sha256').update(JSON.stringify(got)).digest('hex'),baseline[sample+':'+scene]);
  assert.deepEqual(got,compatibilityFold(admitted.value,context));
  assert.equal(got.find(row=>row.cell===scope)?.state,expected);
  return got;
 };
 read('compatible','C','FREE');
 append({type:'claim',scope:'C',id:'disagreement',sign:'+1',origin:'ana',value:fixture.scenarios.conflicting});
 read('incompatible-origins','C','CONFLICT');
 for(const id of ['disagreement','c-C','c-L'])append({type:'claim',scope:'C',id:'withdraw-'+id,sign:'-1',takes:id});
 const withdrawn=read('withdrawn-claims','C','REQUIRED');
 assert.deepEqual(withdrawn.find(row=>row.cell==='C')?.ownClaims,[]);
 for(const [id,origin] of [['outside-a','ana'],['outside-b','luis']])append({type:'claim',scope:'C',id,sign:'+1',origin,value:fixture.scenarios.outside});
 read('outside-ceiling','C','FORBIDDEN');
 append({type:'mark',scope:'G',id:'incompatible-floor',sign:'+1',pole:'floor',reach:'travels',value:fixture.scenarios.floorConflict});
 read('incompatible-bounds','G','CONFLICT');
 append({type:'mark',scope:'B',id:'withdraw-j',sign:'-1',takes:'j-B'});
 const last=read('withdrawn-opening','G','CONFLICT');
 assert.deepEqual(last.find(row=>row.cell==='B')?.ownMarks,['s-B','r-B']);
 const invalid: ObjectRecord={record:'claim',fields:{type:'claim',scope:'C',id:'bad-withdraw',sign:'-1',takes:'not-present',by:'test',epoch:String(epoch)}};
 const refused=validateObjectContext([...records,invalid],context);
 assert.equal(refused.kind,'refuse');if(refused.kind==='refuse')assert.match(refused.why,/withdrawal target/);
});

test('engine entry does not duplicate the projection function',()=>{
 assert.equal(objectFold,compatibilityFold);
});

