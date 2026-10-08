import {test} from 'node:test';
import {runWalkRefinement} from '../tools/samples/run-walk-refinement.mjs';
for(const family of ['measurement','artifact'])test('native CLI refines declared regions: '+family,()=>runWalkRefinement(process.env.BOUND_TEST_READER??new URL('../dist/cli/verb.js',import.meta.url).pathname,process.env.BOUND_TEST_CAPTURE,family));
