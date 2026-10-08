import {test} from 'node:test';
import {runTypedSample} from '../tools/samples/run-typed.mjs';

test('typed sample lands from a new standing closure and prints object states through the installed-compatible CLI',()=>{
  runTypedSample(process.env.BOUND_TEST_READER ?? new URL('../dist/cli/verb.js',import.meta.url).pathname,process.env.BOUND_TEST_CAPTURE);
});

test('a repository-artifact place uses the same object contract with a different selected codec',()=>{
  const capture=process.env.BOUND_TEST_CAPTURE?.replace(/\.json$/,'.artifacts.json');
  runTypedSample(process.env.BOUND_TEST_READER ?? new URL('../dist/cli/verb.js',import.meta.url).pathname,capture,'artifacts.json');
});
