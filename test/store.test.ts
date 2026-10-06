import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXTENSION, LOCK } from '@lapxo/topos/wire';
import { storeRoot } from '../src/host/ports/store.ts';

test('storeRoot is the nearest tree, so a sandbox under another tree does not take that tree', () => {
  const outer = mkdtempSync(join(tmpdir(), 'bound-outer-'));
  mkdirSync(join(outer, EXTENSION));
  writeFileSync(join(outer, LOCK), '');
  const inner = mkdtempSync(join(outer, 'bound-inner-'));
  mkdirSync(join(inner, EXTENSION));
  writeFileSync(join(inner, LOCK), '');
  compare(storeRoot(inner), inner);
  compare(storeRoot(join(inner, 'src')), inner);
});
