import { canonical } from '@lapxo/topos/wire';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wordFrom, wordOf, theWord, wordsOf } from '../src/fold/wire.ts';
import { foldCeilings } from '../src/fold/ceilings.ts';
import { readerReaches } from '../src/fold/observed.ts';
import { lateFacts } from '../src/judge/late.ts';

const wire = (list: string, value: string, era: 'wire' | 'audit/wire' = 'wire'): string =>
  canonical({ scope: `${era}/${list}`, role: 'reads', form: 'alphabet', measure: 'id', value, at: 'policy:test', by: 'target' });

test('wordOf refuses when the lock lists none, and does not guess the asked word', () => {
  let refused = '';
  try {
    wordOf([], 'families', 'view');
  } catch (error) {
    refused = error instanceof Error ? error.message : '';
  }
  compare(refused.includes('REFUSE·wire'), true, 'empty list refuses');
  compare(refused.includes('the lock lists none'), true, 'names the empty lock');
});

test('theWord refuses a list that names more than one word', () => {
  let refused = '';
  try {
    theWord([wire('pin-shape', 'package|lock')], 'pin-shape');
  } catch (error) {
    refused = error instanceof Error ? error.message : '';
  }
  compare(refused.includes('names 2 words, not one'), true, 'two words refuse');
  compare(theWord([wire('pin-shape', 'package')], 'pin-shape'), 'package');
  compare(wordsOf([wire('pin-shape', 'package')], 'pin-shape'), ['package']);
});

test('wordOf on a standing that lists another wire does not read the tree lock', () => {
  let refused = '';
  try {
    wordOf([wire('pin-shape', 'package')], 'families', 'view');
  } catch (error) {
    refused = error instanceof Error ? error.message : '';
  }
  compare(refused.includes('the lock lists none'), true, 'a missing list is a refusal, not another lock');
});

test('audit/wire/ is one era of wire/: a word listed only under the older prefix is the word', () => {
  compare(wordOf([wire('families', 'view', 'audit/wire')], 'families', 'view'), 'view');
  compare(wordsOf([wire('families', 'view', 'audit/wire')], 'families'), ['view']);
  compare(wordOf([wire('families', 'view'), wire('families', 'page', 'audit/wire')], 'families', ['view', 'page']), 'view');
});

test('wordFrom reads the asked word from the fallback lock when the standing lists none', () => {
  compare(wordFrom([], 'families', 'view', [wire('families', 'view|reader')]), 'view');
});

test('foldCeilings of a place with no wire/states does not refuse unread', () => {
  const got = foldCeilings({ standing: [], ceilings: [], observed: [], own: {}, epoch: 1 });
  compare(got.unread.length, 0);
  compare(got.read.length, 0);
});

test('a reader whose module lives elsewhere still reaches a region its needs name', () => {
  compare(readerReaches(['bound'], ['bound/src/', 'obligations/src/']), true, 'needs meet reach');
  compare(readerReaches(['bound'], ['topos-github/src/']), false, 'needs outside reach do not run');
  compare(readerReaches(undefined, ['topos-github/src/']), true, 'no reach is the whole tree');
  compare(readerReaches(['bound'], ['topos-typescript-tree/src/regions/source.ts']), false, 'the module path is not the region it reads');
});

test('an unpaid demand is not answered by a vouched cone it does not have', () => {
  const store = mkdtempSync(join(tmpdir(), 'bound-late-'));
  const standing = [
    wire('families', 'view|audit'),
    canonical({
      scope: 'audit/bound/unpaid', role: 'demands', form: 'alphabet', measure: 'status', value: 'present',
      needs: 'samples/yes/missing.json', at: 'policy:test', by: 'target',
    }),
  ];
  compare(lateFacts(store, standing, new Set()).length, 0);
});
