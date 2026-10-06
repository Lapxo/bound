import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {compareEvidence, verdictDemand} from '@lapxo/topos/authority';
const require = createRequire(import.meta.url);
const corpus = JSON.parse(readFileSync(require.resolve('@lapxo/topos/vectors/evidence.json'), 'utf8'));
for (const c of corpus.cases) test('evidence relation: ' + c.name, () => assert.deepEqual(compareEvidence(c.input), c.expected));
for (const c of corpus.gates) test('declared demand: ' + c.name, () => assert.equal(verdictDemand(c.fields, c.evidence).status, c.status));
test('relation is independent of names and accepted alphabets are caller-defined', () => {
  for (const [reference, value] of [['sample/α', 'domain/β'], ['digest:x', 'opaque:y']]) {
    assert.deepEqual(compareEvidence({expected: {reference, value}, statement: {admitted: true, reference, value}}), {relation: 'equal', source: 'statement'});
    assert.equal(verdictDemand({scope: 'arbitrary/rule', value, needs: reference}, [{coordinate: reference, value}]).status, 'met');
  }
});
