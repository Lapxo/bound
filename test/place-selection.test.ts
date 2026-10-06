import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { canonical } from '@lapxo/topos/wire';
import { selectionLines } from '../src/observe/regions.ts';

test('each place selects its own standing without adopting unqualified selections from another place', () => {
  const root = mkdtempSync(join(tmpdir(), 'bound-place-selection-'));
  const pin = (scope: string, value: string) => canonical({ scope, role: 'writes', form: 'alphabet', measure: 'digest', value, by: 'target', at: 'policy:selection' });
  try {
    const a = pin('uses/domain', 'sha256:'+'a'.repeat(64));
    const b = pin('uses/domain', 'sha256:'+'b'.repeat(64));
    const explicit = pin('north/uses/other', 'sha256:'+'c'.repeat(64));
    for (const [name, line] of [['north', a], ['south', b]]) {
      mkdirSync(join(root, name!));
      writeFileSync(join(root, name!, 'TARGET.bound'), line+'\n');
    }
    const standing = [a, b, explicit];
    assert.deepEqual(selectionLines({root, standing, under:'north/'}), [a, explicit]);
    assert.deepEqual(selectionLines({root, standing, under:'south/'}), [b]);
    assert.deepEqual(selectionLines({root, standing:[a], under:undefined}), [a]);
    rmSync(join(root, 'north', 'TARGET.bound'));
    assert.deepEqual(selectionLines({root, standing, under:'north/'}), [explicit], 'a removed own lock cannot retain a selection through the shared standing');
  } finally { rmSync(root, {recursive:true, force:true}); }
});
