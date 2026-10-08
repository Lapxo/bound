import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ActCosts} from '../src/host/act-cost.ts';

test('separate declared readings do not turn their sum into an indivisible act',()=>{
 let now=0;const cost=new ActCosts(()=>now);
 cost.measure(()=>{now+=35000;});cost.measure(()=>{now+=38000;});
 assert.equal(now,73000);assert.equal(cost.seconds(),38);
});
test('one slow reading, failed readings and unpartitioned host work keep their cost',()=>{
 let now=0;const cost=new ActCosts(()=>now);assert.throws(()=>cost.measure(()=>{now+=73000;throw Error('refused');}),/refused/);assert.equal(cost.seconds(),73);
 now+=75000;assert.equal(cost.seconds(),75);
});
test('nested host execution is charged once without hiding the enclosing reading',()=>{
 let now=0;const cost=new ActCosts(()=>now);
 cost.measure(()=>{now+=10000;cost.measure(()=>{now+=20000;});now+=5000;});
 assert.equal(cost.seconds(),35);now+=9000;assert.equal(cost.seconds(),35);
});
test('an unfinished indivisible act remains measurable',()=>{
 let now=0;const cost=new ActCosts(()=>now),end=cost.begin();now=73000;assert.equal(cost.seconds(),73);end();assert.equal(cost.seconds(),73);assert.throws(end,/closed twice/);
});
