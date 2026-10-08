import {test} from 'node:test';
import {runWalkSample} from '../tools/samples/run-walk.mjs';
for (const family of ['measurement','artifact']) test(`native CLI imports an authenticated regional prefix atomically: ${family}`,()=>runWalkSample(process.env.BOUND_TEST_READER??new URL('../dist/cli/verb.js',import.meta.url).pathname,process.env.BOUND_TEST_CAPTURE,family));
