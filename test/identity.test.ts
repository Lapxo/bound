import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, LOCK } from '@lapxo/topos/wire';
import { identityOf } from '../src/observe/identity.ts';
import { runReader } from '../src/observe/run.ts';

test('equal vector results do not merge distinct executable identities or reserved answers', () => {
  const root = mkdtempSync(join(tmpdir(), 'reader-identity-'));
  const prior = process.argv[1];
  process.argv[1] = fileURLToPath(new URL('../src/cli/verb.ts', import.meta.url));
  try {
    const store = join(root, '.bound');
    mkdirSync(join(store, 'ledger'), { recursive: true });
    const row = (scope: string, value: string): string => canonical({ scope, value, by: 'target', at: 'policy:fixture', role: 'writes', form: 'alphabet', measure: 'id' });
    writeFileSync(join(root, LOCK), [row('publish/bootstrap', 'fixture'), row('wire/families', 'vector'), row('wire/digest-algorithms', 'sha256:era1')].join('\n'));
    mkdirSync(join(root, 'world', 'vectors'), { recursive: true });
    mkdirSync(join(root, 'world', 'src'), { recursive: true });
    const module = 'world/src/read.ts';
    const source = (reserved: number): string => `export const observe = (bytes) => { const n = new TextDecoder().decode(bytes) === 'known' ? 1 : ${reserved}; return [{ scope: 'answer', measure: 'n', role: 'reads', bound: { kind: 'interval', lo: n, hi: n } }]; };`;
    writeFileSync(join(root, 'world', 'vectors', 'read.json'), JSON.stringify({ cases: [{ place: 'input', text: 'known' }] }));
    writeFileSync(join(root, module), source(1));
    const first = identityOf({ root, store, module, kind: 'js', speaker: 'fixture', code: 'a'.repeat(12), lineage: [], kept: [] });
    writeFileSync(join(root, module), source(2));
    const second = identityOf({ root, store, module, kind: 'js', speaker: 'fixture', code: 'b'.repeat(12), lineage: [first.by], kept: first.lines });
    compare(first.by, 'a'.repeat(12), 'the first executable retains its own identity');
    compare(second.by, 'b'.repeat(12), 'matching corpus output grants no executable alias');
    compare(first.by === second.by, false, 'observation keys remain distinct');
    const answer = runReader(join(root, module), root, [{ place: 'input', text: 'reserved' }]);
    compare(answer[0]?.[0]?.bound.lo, 2, 'the reserved input reaches the second implementation');
  } finally {
    process.argv[1] = prior;
    rmSync(root, { recursive: true, force: true });
  }
});

test('reader process failure preserves the module and actual diagnostic', () => {
  const root = mkdtempSync(join(tmpdir(), 'reader-failure-'));
  const prior = process.argv[1];
  process.argv[1] = fileURLToPath(new URL('../src/cli/verb.ts', import.meta.url));
  try {
    const module = join(root, 'read.ts');
    writeFileSync(module, "throw new Error('fixture failure');");
    let said = '';
    try { runReader(module, root, [{ place: 'input', text: '' }]); }
    catch (error) { said = error instanceof Error ? error.message : String(error); }
    compare(said.includes(module), true, 'the failed module remains attributable');
    compare(said.includes('fixture failure'), true, 'the actual cause remains visible');
  } finally {
    process.argv[1] = prior;
    rmSync(root, { recursive: true, force: true });
  }
});
