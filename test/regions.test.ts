import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, parse } from '@lapxo/topos/wire';
import { declarationOf } from '@lapxo/topos/capsule';
import { askingOf, regionNames } from '../src/observe/regions.ts';
import { ownStore } from '../src/observe/runner.ts';

const row = (scope: string, value: string, measure = 'receipts'): string => canonical({ scope, value, measure, role: 'writes', form: 'alphabet', by: 'fixture', at: 'policy:synthetic-routing' });

test('a region selector binds only concretely offered names, including arbitrary domains', () => {
  const descriptions = [row('region/hydrology','water/depth'),row('region/chemistry','assay/ph'),row('region/*','invalid'),row('other/name','outside')];
  assert.deepEqual(regionNames(['region/*'], descriptions), ['hydrology','chemistry']);
  assert.deepEqual(regionNames(['region/hydrology'], descriptions), ['hydrology']);
  assert.deepEqual(regionNames(['region/missing'], descriptions), []);
});

test('the host delivers explicit project observations through a generic region selector with original interval and unit', () => {
  const root = mkdtempSync(join(tmpdir(), 'project-region-'));
  const prior = process.argv[1];
  process.argv[1] = fileURLToPath(new URL('../src/cli/verb.ts', import.meta.url));
  try {
    const observed = (JSON.parse(readFileSync(new URL('./fixtures/project-regions/observed.records.json',import.meta.url),'utf8')) as Readonly<Record<string,string>>[]).map(record=>canonical(record));
    const offered = (JSON.parse(readFileSync(new URL('./fixtures/project-regions/offered.records.json',import.meta.url),'utf8')) as Readonly<Record<string,string>>[]).map(record=>canonical(record));
    const declaration = declarationOf([canonical({ scope:'region/compose',value:'page/**|region/*',role:'render',form:'alphabet',measure:'reads',by:'fixture',at:'policy:synthetic-routing' })]);
    const request = askingOf({ root, store:ownStore(),standing:offered,observed })(declaration,{name:'compose',at:3},'render','carnet/observations.md');
    assert.ok(request);
    assert.ok(request.reads?.includes('region/*'));
    assert.ok(request.regions?.hydrology);
    assert.equal(request.regions?.['*'], undefined);
    const receipt = parse(request.regions!.hydrology!.receipts[0]!);
    assert.equal(receipt.kind, 'fact');
    if (receipt.kind === 'fact') { assert.equal(receipt.value.fields.value,'10..12'); assert.equal(receipt.value.fields.measure,'celsius'); assert.equal(receipt.value.fields.by,'read:fixture-hydrology'); assert.equal(receipt.value.fields.evidence,'place:synthetic-routing-digest'); }
    const missing = askingOf({ root, store:ownStore(),standing:[],observed })(declaration,{name:'compose',at:3},'render','carnet/observations.md');
    assert.equal(missing?.regions?.hydrology,undefined);
  } finally { process.argv[1] = prior; rmSync(root,{recursive:true,force:true}); }
});
