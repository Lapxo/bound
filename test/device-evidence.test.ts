import {test} from 'node:test';
import {runEvidenceSample} from '../tools/samples/run-evidence.mjs';

for(const keyClass of ['authorize','read','access','attest'])test(`native views preserve admitted ${keyClass} evidence, exact withdrawals and signature refusals`,()=>{
 runEvidenceSample(process.env.BOUND_TEST_READER??new URL('../src/cli/verb.ts',import.meta.url).pathname,keyClass,{uncovered:{scope:'sample/north',value:'uncovered'},tamperedValue:'altered'},process.env.BOUND_TEST_CAPTURE?process.env.BOUND_TEST_CAPTURE+'.'+keyClass+'.json':undefined);
});
