import {test} from 'node:test';
import {runTypedWalkSample} from '../tools/samples/run-typed-walk.mjs';
for(const sample of ['yes.json','artifacts.json'])test(`typed foreign history preserves origin-local withdrawals without taking receiver IDs: ${sample}`,()=>runTypedWalkSample(process.env.BOUND_TEST_READER??new URL('../dist/cli/verb.js',import.meta.url).pathname,process.env.BOUND_TEST_CAPTURE,sample));
