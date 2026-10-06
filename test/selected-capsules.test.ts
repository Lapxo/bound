import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { canonical, fromLine } from '@lapxo/topos/wire';
import { readStanding, standingBytes } from '@lapxo/topos/standing';
import { selectedCapsules } from '../src/host/selected-capsules.ts';
import { ownLock } from '../src/observe/runner.ts';
import { fieldOf } from '../src/fold/claims.ts';
import type { Capsule } from '../src/host/capsule.ts';
import {selectedWireList,selectedWireAt} from '../src/host/selected-topos.ts';
const pin = (name: string, value: string) => canonical({scope:`consumer/uses/${name}`,value,by:'fixture'});
const standing = (fields: Record<string,string>) => readStanding(standingBytes([canonical(fields)]));

test('selected wire contracts resolve without executable offers or copied foreign claims', () => {
  const local:readonly string[]=[];
  const world=standing({scope:'audit/wire/receipt-fields',value:'scope|value|at'});
  let reads=0;
  const result=selectedWireList(local,4,[pin('wire','sha256:held'),pin('same','sha256:held')],'receipt-fields',()=>{reads++;return world;});
  assert.deepEqual(result,['scope','value','at']);
  assert.equal(reads,1);
  assert.deepEqual(local,[]);
});
test('selected wire contracts cannot resolve disagreement by selection order', () => {
  const local=[canonical({scope:'wire/receipt-fields',epoch:'4',value:'scope|value'})];
  const resolve=()=>standing({scope:'wire/receipt-fields',value:'scope|at'});
  assert.throws(()=>selectedWireList(local,4,[pin('wire','sha256:held')],'receipt-fields',resolve),/REFUSE·wire .*conflicting contracts/);
  const agreeing=()=>standing({scope:'wire/receipt-fields',value:'value|scope'});
  assert.deepEqual(selectedWireList(local,4,[pin('wire','sha256:held')],'receipt-fields',agreeing),['scope','value']);
});
test('missing or unavailable wire contracts refuse without SDK defaults', () => {
  assert.throws(()=>selectedWireList([],4,[],'receipt-fields'),/REFUSE·wire .*no declared contract/);
  assert.throws(()=>selectedWireList([],4,[pin('wire','sha256:missing')],'receipt-fields',()=>{throw Error('REFUSE·pin not laid');}),/REFUSE·pin not laid/);
  const future=[canonical({scope:'wire/receipt-fields',epoch:'5',value:'scope|value'})];
  assert.throws(()=>selectedWireList(future,4,[],'receipt-fields'),/no declared contract/);
});

test('missing selected standing refuses before any unrelated executable can resolve', () => {
  let calls=0;
  assert.throws(() => selectedCapsules([pin('domain','sha256:missing')],() => {calls++;return {} as Capsule;},() => {throw Error('REFUSE·pin sha256:missing content unavailable · not laid');}), /REFUSE·pin sha256:missing.*not laid/);
  assert.equal(calls,0);
});
test('forms and views need no capsule; duplicate selections resolve standing once', () => {
  let reads=0, executions=0;
  const topos=standing({scope:'view/cells',kind:'view',value:'cells'});
  const got=selectedCapsules([pin('one','sha256:held'),pin('two','sha256:held')],() => {executions++;return undefined;},() => {reads++;return topos;});
  assert.deepEqual(got,[]);assert.equal(reads,1);assert.equal(executions,0);
});
test('an explicit capsule offer requires an admitted host projection, not a guessed entry', () => {
  let executions=0;
  const digest='sha256:'+'f'.repeat(64);
  const topos=standing({scope:'offers/capsule',kind:'capsule',value:digest,measure:'digest',restsOn:digest});
  assert.throws(()=>selectedCapsules([pin('domain','sha256:held')],()=>{executions++;return undefined;},()=>topos),/needs one host projection/);
  assert.equal(executions,0);
});
test('an explicitly projected capsule that lacks authentic bytes cannot silently disappear', () => {
  const aliases=ownLock().filter(line=>fieldOf(line,'scope').startsWith('dep/')&&fieldOf(line,'role')!=='reads'&&fieldOf(line,'shape'));
  const alias=aliases.find(line=>aliases.filter(one=>fieldOf(one,'value')===fieldOf(line,'value')).length===1);
  assert.ok(alias,'the test instrument must admit one unique capsule projection');
  const digest=fieldOf(alias,'value');
  const topos=standing({scope:'offers/capsule',kind:'capsule',value:digest,measure:'digest',restsOn:digest});
  const calls:string[][]=[];
  assert.throws(()=>selectedCapsules([pin('domain','sha256:held')],(name,shape)=>{calls.push([name,shape]);return undefined;},()=>topos),/offered capsule .* unavailable/);
  assert.deepEqual(calls,[[digest,fieldOf(alias,'shape')]]);
});

test('admission reads selected wire fields alongside the place cryptographic era',()=>{
 const rows=[['fields','scope|role|form|measure|value|by|at|epoch'],['required','scope|role|form|measure|value|by|at'],['roles','reads|writes'],['forms','alphabet'],['at-classes','policy']].map(([name,value])=>canonical({scope:`audit/wire/${name}`,value}));
 const world=readStanding(standingBytes(rows));
 const local=[{scope:'wire/era',epoch:'2',value:'fixture'}];
 const snapshot=selectedWireAt(local,3,[pin('wire','sha256:held')],()=>world);
 const line=canonical({scope:'name',role:'writes',form:'alphabet',measure:'id',value:'project',by:'target',at:'policy:fixture',epoch:'3'});
 assert.equal(fromLine(line,snapshot).kind,'fact');
 assert.deepEqual(local,[{scope:'wire/era',epoch:'2',value:'fixture'}],'reading must not copy selected claims into the place');
 assert.equal(fromLine(canonical({scope:'name',role:'writes',form:'alphabet',measure:'id',value:'project',by:'target',at:'policy:fixture',unknown:'extra'}),snapshot).kind,'refuse');
});
test('selected admission cannot choose a foreign alphabet by order or a future local declaration',()=>{
 const resolve=(digest:string)=>standing({scope:'wire/fields',value:digest==='sha256:one'?'scope|value':'scope|value|extra'});
 const pins=[pin('one','sha256:one'),pin('two','sha256:two')];
 assert.throws(()=>selectedWireAt([],4,pins,resolve),/conflicting selected contracts/);
 assert.throws(()=>selectedWireAt([],4,[...pins].reverse(),resolve),/conflicting selected contracts/);
 const future=[{scope:'wire/fields',value:'scope|value|future',epoch:'5'}];
 assert.deepEqual([...selectedWireAt(future,4,[pins[0]!],resolve)!.fields],['scope','value']);
});
