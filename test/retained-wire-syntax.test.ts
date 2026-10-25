import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonical,parse,recordKind} from '@lapxo/topos/wire';
import {parsedLine,isConfig,fieldsOf} from '../src/fold/claims.ts';

test('retained syntax preserves the public parser on exact bytes and cannot be mutated',()=>{
 const rows=[canonical({scope:'port/one',role:'writes',form:'alphabet',measure:'text',value:'lock',about:JSON.stringify({payload:'quotes " and slash \\ and Unicode é'.repeat(1000)})}),canonical({scope:'sample',type:'claim',role:'reads',form:'interval',measure:'count',value:'2..3'}),'bound-lock/1 scope=x scope=y','not wire'];
 for(const line of rows){assert.deepEqual(parsedLine(line),parse(line));const kind=recordKind(line);assert.equal(isConfig(line),kind.kind==='fact'&&kind.value==='config');}
 const held=parsedLine(rows[0]!);assert.equal(held.kind,'fact');if(held.kind!=='fact')return;
 assert.throws(()=>{(held.value.fields as Record<string,string>).scope='changed'},TypeError);
 const copy=fieldsOf(rows[0]!);copy.scope='changed';assert.equal(parsedLine(rows[0]!).kind==='fact'&&fieldsOf(rows[0]!).scope,'port/one');
 const changed=canonical({...held.value.fields,scope:'port/two'});assert.deepEqual(parsedLine(changed),parse(changed));assert.notDeepEqual(parsedLine(changed),held);
});
