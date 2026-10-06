import type { PlaceFold } from '../src/cli/place.ts';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { canonical } from '@lapxo/topos/wire';
import { releasePolicy, releaseFaults, releasePolicyLines } from '../src/fold/release-policy.ts';

const wire = (scope: string, role = 'writes', value = 'present', form = 'alphabet', measure = 'id') => canonical({ scope, role, value, form, measure, by: 'fixture', at: 'fixture:here' });
const policy = wire('release/blocks', 'writes', 'quality');
const link = wire('release/category/quality', 'writes', 'actual/**');
const demand = wire('actual/claim', 'demands');
const ceiling = wire('actual/limit', 'reads', '0..1', 'interval', 'count');
const snapshot = { fold: 'fixture-fold', instrument: 'fixture-instrument' };
const input = { standing: [policy, link], demands: [demand], paid: [demand], ceilings: [ceiling], readings: { read: [ceiling], unread: [] as string[], vacuous: [] as string[], over: [] as { ceiling: string; question: string; got: string; side: 'over' | 'short' }[] }, snapshot };

test('declared selection is ready, unrelated red debt stays present', () => {
  const other = wire('other/claim', 'demands');
  const got = releasePolicy({ ...input, demands: [demand, other] });
  assert.equal(got.status, 'ready');
  assert.ok(got.debt.includes(other));
  assert.deepEqual(got.snapshot, snapshot);
});
test('policy alone and empty selectors never become ready', () => {
  assert.equal(releasePolicy({ ...input, standing: [policy] }).status, 'incomplete');
  assert.equal(releasePolicy({ ...input, standing: [policy, wire('release/category/quality', 'writes', 'not-an-obligation')] }).status, 'incomplete');
});
test('missing demand blocks with its exact original line', () => {
  const got = releasePolicy({ ...input, paid: [] });
  assert.equal(got.status, 'blocked');
  assert.equal(got.categories[0]!.failures[0]!.line, demand);
});
for (const state of ['unread', 'vacuous'] as const) test(`${state} is missing evidence, never a zero`, () => {
  const got = releasePolicy({ ...input, readings: { ...input.readings, read: [], [state]: [ceiling] } });
  assert.equal(got.status, 'blocked');
  assert.equal(got.categories[0]!.failures[0]!.reason, state);
});
for (const side of ['short', 'over'] as const) test(`${side} keeps the actual result`, () => {
  const got = releasePolicy({ ...input, readings: { ...input.readings, over: [{ ceiling: 'actual/limit', question: 'actual/limit', got: '7', side }] } });
  assert.equal(got.status, 'blocked');
  assert.deepEqual(got.categories[0]!.failures[0]!.evidence, [`${side} actual/limit 7`]);
});
test('renaming category changes no interpreter and duplicate links pay nothing twice', () => {
  const renamed = wire('release/category/a-name-not-in-code', 'writes', 'actual/**');
  const got = releasePolicy({ ...input, standing: [wire('release/blocks', 'writes', 'a-name-not-in-code'), renamed, renamed], paid: [] });
  assert.equal(got.status, 'blocked');
  assert.equal(got.categories[0]!.failures.length, 1);
});
test('withdrawn and nonwrites links are not policy links', () => {
  for (const rejected of [wire('release/category/quality', 'writes', 'withdraw'), wire('release/category/quality', 'demands', 'actual/**')]) {
    assert.equal(releasePolicy({ ...input, standing: [policy, rejected] }).status, 'incomplete');
  }
});
test('conflicting policy or links and unidentified ceiling evidence are incomplete', () => {
  assert.equal(releasePolicy({ ...input, standing: [...input.standing, wire('release/blocks', 'writes', 'elsewhere')] }).status, 'incomplete');
  assert.equal(releasePolicy({ ...input, standing: [...input.standing, wire('release/category/quality', 'writes', 'actual/claim')] }).status, 'incomplete');
  assert.equal(releasePolicy({ ...input, readings: { ...input.readings, read: [] } }).status, 'incomplete');
  const another = wire('actual/limit', 'reads', '0..9', 'interval', 'ms');
  assert.equal(releasePolicy({ ...input, ceilings: [ceiling, another], readings: { ...input.readings, read: [ceiling, another], over: [{ ceiling: 'actual/limit', question: 'actual/limit', got: '7', side: 'over' }] } }).status, 'incomplete');
});
test('absent policy makes no release assertion', () => assert.equal(releasePolicy({ ...input, standing: [] }).status, 'absent'));

test('alphabet declaration order does not create a policy conflict', () => {
  const links = [wire('release/category/one', 'writes', 'actual/claim|actual/limit'), wire('release/category/one', 'writes', 'actual/limit|actual/claim'), wire('release/category/two', 'writes', 'actual/**')];
  const got = releasePolicy({ ...input, standing: [wire('release/blocks', 'writes', 'one|two'), wire('release/blocks', 'writes', 'two|one'), ...links] });
  assert.equal(got.status, 'ready');
});

test('actual fold fault fields keep paid categories incomplete and shown', () => {
  const fold: Pick<PlaceFold, 'forks' | 'refused' | 'grey' | 'orphans' | 'second'> = { forks: [{ key: 'meeting interval', lines: [demand, wire('actual/claim', 'demands', 'absent')] }], refused: [], grey: [], orphans: [], second: { verdict: 'agrees', external: true, epoch: 1 } };
  const got = releasePolicy({ ...input, faults: releaseFaults(fold) });
  assert.equal(got.status, 'incomplete');
  assert.equal(got.categories[0]!.failures.length, 0);
  assert.ok(got.unresolved[0]!.includes('meeting interval'));
  assert.ok(releasePolicyLines(got).some((line) => line.startsWith('UNRESOLVED release')));
});
test('refused, grey, orphan and conflicting second head do not vanish behind paid gates', () => {
  for (const part of [{ refused: [demand] }, { grey: [demand] }, { orphans: ['an-observed-orphan'] }, { second: { verdict: 'forks' } }]) {
    const fold = { forks: [], refused: [], grey: [], orphans: [], second: { verdict: 'agrees' }, ...part };
    assert.equal(releasePolicy({ ...input, faults: releaseFaults(fold) }).status, 'incomplete');
  }
});
test('fault with explicit obligation identity blocks its declared category', () => {
  assert.equal(releasePolicy({ ...input, faults: [{ kind: 'conflict', obligation: demand, evidence: [demand] }] }).status, 'blocked');
});
test('no policy keeps existing output untouched; snapshot is provenance only', () => {
  assert.deepEqual(releasePolicyLines(undefined), []);
  assert.deepEqual(releasePolicyLines(releasePolicy({ ...input, standing: [] })), []);
  assert.deepEqual(releasePolicy(input).snapshot, snapshot);
});
