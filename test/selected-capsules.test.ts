import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { canonical } from '@lapxo/topos/wire';
import { readStanding, standingBytes } from '@lapxo/topos/standing';
import { selectedCapsules } from '../src/host/selected-capsules.ts';
import { ownLock } from '../src/observe/runner.ts';
import { fieldOf } from '../src/fold/claims.ts';
import type { Capsule } from '../src/host/capsule.ts';
const pin = (name: string, value: string) => canonical({scope:`consumer/uses/${name}`,value,by:'fixture'});
const standing = (fields: Record<string,string>) => readStanding(standingBytes([canonical(fields)]));

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
