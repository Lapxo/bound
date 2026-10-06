import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonical, LOCK } from '@lapxo/topos/wire';
import { kindsOf } from '../src/fold/places.ts';
test('layout does not imply a package class; the place declares its kind', () => {
  const root = mkdtempSync(join(tmpdir(), 'declared-kind-'));
  try {
    const row = (scope: string, value: string) => canonical({ scope, value, by: 'fixture', at: 'policy:fixture', role: 'writes', form: 'alphabet', measure: 'id' });
    const put = (name: string, lines: string[]) => { mkdirSync(join(root, name)); writeFileSync(join(root, name, LOCK), lines.join('\n')); };
    put('corpus', [row('files', 'samples/**'), row('publish/bootstrap', 'corpus')]);
    put('archive', [row('files', 'samples/**'), row('place/kind', 'corpus')]);
    put('package', [row('place/kind', 'package')]);
    compare(kindsOf(root, 'corpus'), [], 'layout does not invent package');
    compare(kindsOf(root, 'archive'), ['corpus'], 'explicit domain kind holds');
    compare(kindsOf(root, 'package'), ['package'], 'explicit package kind holds');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
