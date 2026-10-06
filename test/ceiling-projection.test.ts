import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { canonical } from '@lapxo/topos/wire';
import { foldCeilings } from '../src/fold/ceilings.ts';

const ceiling = (scope: string) => canonical({ scope, role: 'reads', form: 'interval', measure: 'count', value: '0..0', by: 'fixture', at: 'policy:test', epoch: '2' });
const observed = (scope: string, n: number) => [
  canonical({ scope: 'project/', role: 'writes', form: 'alphabet', measure: 'observed', value: 'input', by: 'reader', at: 'place:input' }),
  canonical({ scope, role: 'reads', form: 'interval', measure: 'count', value: `${n}..${n}`, by: 'reader', at: 'place:input' }),
];

test('projecting a ceiling into its own place preserves its failing reading', () => {
  const local = ceiling('limit/items');
  const projected = ceiling('project/limit/items');
  const got = foldCeilings({ standing: [], ceilings: [local, projected], observed: observed('limit/items', 3), own: {}, epoch: 9, under: 'project/' });
  assert.deepEqual(got.read, [local, projected]);
  assert.deepEqual(got.vacuous, []);
  assert.deepEqual(got.over.map(x => [x.ceiling, x.got]), [['limit/items', '3'], ['project/limit/items', '3']]);
});

test('a genuinely narrower question still owns its reading under projection', () => {
  const broad = ceiling('limit/**');
  const narrow = ceiling('project/limit/items');
  const got = foldCeilings({ standing: [], ceilings: [broad, narrow], observed: observed('limit/items', 3), own: {}, epoch: 9, under: 'project/' });
  assert.deepEqual(got.read, [narrow]);
  assert.deepEqual(got.over.map(x => x.ceiling), ['project/limit/items']);
});
