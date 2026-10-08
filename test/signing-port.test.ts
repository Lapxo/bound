import {test} from 'node:test';
import {runSigningSample} from '../tools/samples/run-signing.mjs';
test('declared signing ports are equivalent and CLI refusals are atomic',()=>{runSigningSample(process.env.BOUND_TEST_READER??new URL('../src/cli/verb.ts',import.meta.url).pathname,{rows:[{scope:'sample/a',measure:'id',value:'yes'},{scope:'sample/b',measure:'id',value:'yes'}]},{unknownVersion:'bound-lock/0'});});
