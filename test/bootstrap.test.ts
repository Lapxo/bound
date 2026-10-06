import { test } from 'node:test';
import { strictEqual, match, deepStrictEqual } from 'node:assert';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical } from '@lapxo/topos/wire';

const verb = new URL('../src/cli/verb.ts', import.meta.url).pathname;
function sandbox(change: 'valid' | 'wrong-key' | 'no-digest' | 'no-signature' | 'no-coverage' | 'restricted-coverage', receipts = false) {
  const dir = mkdtempSync(join(tmpdir(), 'bootstrap-'));
  mkdirSync(join(dir, '.bound'));
  const pair = generateKeyPairSync('ed25519');
  const signer = change === 'wrong-key' ? generateKeyPairSync('ed25519') : pair;
  writeFileSync(join(dir, 'key.pem'), signer.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const fact = (scope: string, measure: string, value: string): string => canonical({ scope, role: 'writes', form: 'alphabet', measure, value, at: 'policy:fixture', by: 'target' });
  const lines = [
    fact('keys/root', 'class', 'authorize'),
    fact('keys/root', 'signer', 'file'),
    canonical({scope:'signer/timeout',measure:'milliseconds',value:'1000..1000',form:'interval',role:'writes',at:'policy:fixture',by:'target'}),
    canonical({scope:'signer/response-bytes',measure:'bytes',value:'65536..65536',form:'interval',role:'writes',at:'policy:fixture',by:'target'}),
    fact('keys/root', 'public-key', pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')),
    ...(change === 'no-coverage' ? [] : [fact('keys/root', 'coverage', change === 'restricted-coverage' ? 'meeting/**' : '*')]),
    ...(change === 'no-digest' ? [] : [fact('wire/digest-algorithms', 'id', 'sha256')]),
    ...(change === 'no-signature' ? [] : [fact('wire/signature-algorithms', 'id', 'ed25519:fixture')]),
    fact('wire/era', 'id', 'fixture'),
    ...(receipts ? [fact('wire/families', 'id', 'reader|tree|write|leaf|view')] : []),
  ];
  const original = `${lines.join('\n')}\n`;
  writeFileSync(join(dir, 'TARGET.bound'), original);
  return { dir, original };
}
for (const variant of ['wrong-key', 'no-digest', 'no-signature', 'no-coverage', 'restricted-coverage'] as const) {
  test(`first land refuses ${variant} before writing any ledger or changing TARGET`, () => {
    const { dir, original } = sandbox(variant);
    try {
      const run = spawnSync(process.execPath, [verb, 'land', '--key-file', join(dir, 'key.pem')], { cwd: dir, encoding: 'utf8', timeout: 10_000 });
      strictEqual(run.status, 1, run.stderr);
      const expected = { 'wrong-key': /signature does not verify/, 'no-digest': /names no digest algorithm/, 'no-signature': /names no signature algorithm/, 'no-coverage': /must declare one coverage/, 'restricted-coverage': /does not cover/ }[variant];
      match(run.stderr, expected);
      strictEqual(run.stdout, '');
      strictEqual(readFileSync(join(dir, 'TARGET.bound'), 'utf8'), original);
      deepStrictEqual(readdirSync(join(dir, '.bound')), []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
test('first land admits a valid ephemeral root and reports no failed signatures', () => {
  const { dir } = sandbox('valid');
  try {
    const run = spawnSync(process.execPath, [verb, 'land', '--key-file', join(dir, 'key.pem')], { cwd: dir, encoding: 'utf8', timeout: 10_000 });
    strictEqual(run.status, 0, run.stderr);
    match(run.stdout, /FACT     landed 9 unique lines from 9 in TARGET · 0 of 9 signed lines fail admission by declared authority/);
    match(readFileSync(join(dir, '.bound', 'ledger', 'root.bound'), 'utf8'), /sig=/);
    const ledger = readFileSync(join(dir, '.bound', 'ledger', 'root.bound'), 'utf8');
    const blobs = readdirSync(join(dir, '.bound', 'cas', 'blobs')).sort();
    const repeated = spawnSync(process.execPath, [verb, 'land'], { cwd: dir, encoding: 'utf8', timeout: 10_000 });
    strictEqual(repeated.status, 1, repeated.stderr);
    match(repeated.stderr, /explicit signed batch/);
    strictEqual(repeated.stdout, '');
    strictEqual(readFileSync(join(dir, '.bound', 'ledger', 'root.bound'), 'utf8'), ledger);
    deepStrictEqual(readdirSync(join(dir, '.bound', 'cas', 'blobs')).sort(), blobs);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('concurrent first lands commit one bootstrap and retain one signed owner ledger across ten fresh stores', async () => {
  const { spawn } = await import('node:child_process');
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const { dir } = sandbox('valid');
    try {
      const run = (): Promise<{ status: number | null; output: string }> => new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [verb, 'land', '--key-file', join(dir, 'key.pem')], { cwd: dir });
        let output = '';
        child.stdout.on('data', (bytes: Buffer) => { output += bytes.toString(); });
        child.stderr.on('data', (bytes: Buffer) => { output += bytes.toString(); });
        child.once('error', reject);
        child.once('exit', (status) => resolve({ status, output }));
      });
      const result = await Promise.all([run(), run()]);
      deepStrictEqual(result.map((one) => one.status).sort(), [0, 1], JSON.stringify(result));
      strictEqual(result.filter((one) => one.output.includes('FACT     landed')).length, 1);
      const ledger = readFileSync(join(dir, '.bound', 'ledger', 'root.bound'), 'utf8').trim().split('\n');
      strictEqual(ledger.length, 9);
      strictEqual(new Set(ledger).size, 9);
      strictEqual(readFileSync(join(dir, '.bound', 'ledger', 'land.bound'), 'utf8').trim().split('\n').length, 1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});


test('check inspects a proposed clone without granting admission or rewriting evidence', () => {
  const { dir, original } = sandbox('valid');
  try {
    writeFileSync(join(dir, 'receipts.bound'), 'unverified carried evidence\n');
    const run = spawnSync(process.execPath, [verb, 'fold', '--check'], { cwd: dir, encoding: 'utf8', timeout: 10_000 });
    strictEqual(run.status, 1, run.stdout + run.stderr);
    match(run.stderr, /REFUSE·check receipts are open/);
    strictEqual(run.stdout, '');
    strictEqual(readFileSync(join(dir, 'TARGET.bound'), 'utf8'), original);
    strictEqual(readFileSync(join(dir, 'receipts.bound'), 'utf8'), 'unverified carried evidence\n');
    deepStrictEqual(readdirSync(join(dir, '.bound')), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('check cannot refresh a stale native region receipt to manufacture closure', () => {
  const { dir } = sandbox('valid', true);
  try {
    const landed = spawnSync(process.execPath, [verb, 'land', '--key-file', join(dir, 'key.pem')], { cwd: dir, encoding: 'utf8', timeout: 10_000 });
    strictEqual(landed.status, 0, landed.stderr);
    mkdirSync(join(dir, 'child'));
    writeFileSync(join(dir, 'child', 'TARGET.bound'), canonical({ scope: 'name', role: 'writes', form: 'alphabet', measure: 'id', value: 'child', at: 'place:child', by: 'target' }) + '\n');
    const wrong = 'sha256:' + '0'.repeat(64);
    const receipt = canonical({ scope: 'receipts/src', role: 'writes', form: 'alphabet', measure: 'bytes', value: wrong, at: 'place:' + wrong, by: 'bound' }) + '\n';
    writeFileSync(join(dir, 'child', 'receipts.bound'), receipt);
    const receiptDigest = 'sha256:' + createHash('sha256').update(receipt).digest('hex');
    const carriedText = canonical({ scope: 'write/child/receipts.bound', role: 'writes', form: 'alphabet', measure: 'digest', value: receiptDigest, at: 'place:' + receiptDigest, by: 'bound' }) + '\n';
    const carried = createHash('sha256').update(carriedText).digest('hex');
    mkdirSync(join(dir, '.bound', 'cas', 'carried'), { recursive: true });
    writeFileSync(join(dir, '.bound', 'cas', 'carried', carried), carriedText);
    writeFileSync(join(dir, 'receipts.bound'), canonical({ scope: 'receipts', role: 'writes', form: 'alphabet', measure: 'digest', value: wrong, at: 'place:sha256:' + carried, by: 'bound' }) + '\n');
    const code = `process.argv[1] = ${JSON.stringify(verb)}; const { pass } = await import(${JSON.stringify(new URL('../src/cli/pass.ts', import.meta.url).href)}); process.exitCode = await pass(process.cwd(), process.argv[1], undefined, true);`;
    const run = spawnSync(process.execPath, ['--input-type=module', '--eval', code], { cwd: dir, encoding: 'utf8', timeout: 10_000 });
    strictEqual(run.status, 1, run.stdout + run.stderr);
    match(run.stderr, /REFUSE·check receipts are open/);
    strictEqual(readFileSync(join(dir, 'child', 'receipts.bound'), 'utf8'), receipt);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('a public check authenticates carriers without a ledger and never creates one', () => {
  const { dir, original } = sandbox('valid');
  try {
    const child = canonical({scope:'receipts', role:'writes', form:'alphabet', measure:'digest', value:'sha256:'+'c'.repeat(64), at:'place:receipt', by:'bound'})+'\n';
    const childDigest = 'sha256:'+createHash('sha256').update(child).digest('hex');
    const body = canonical({scope:'write/child/receipts.bound', role:'writes', form:'alphabet', measure:'digest', value:childDigest, at:'place:'+childDigest, by:'bound'})+'\n';
    const digest = createHash('sha256').update(body).digest('hex');
    const path = join(dir,'.bound','cas','carried',digest);
    mkdirSync(join(dir,'.bound','cas','carried'),{recursive:true});
    writeFileSync(path,body);
    mkdirSync(join(dir,'child'));
    writeFileSync(join(dir,'child','receipts.bound'),child);
    const header = canonical({scope:'receipts', role:'writes', form:'alphabet', measure:'digest', value:'sha256:'+digest, at:'place:sha256:'+digest, by:'bound'})+'\n';
    writeFileSync(join(dir,'receipts.bound'),header);
    const run = () => spawnSync(process.execPath,[verb,'fold','--check'],{cwd:dir,encoding:'utf8',timeout:10_000});
    const intact=run();strictEqual(intact.status,1,intact.stdout+intact.stderr);
    match(intact.stderr,/REFUSE·check no verified instrument identity/);
    writeFileSync(path,body+'\n');
    const corrupt=run();strictEqual(corrupt.status,1,corrupt.stdout+corrupt.stderr);
    match(corrupt.stderr,/REFUSE·receipt carried bytes mismatch/);
    strictEqual(corrupt.stdout,'');
    strictEqual(readFileSync(path,'utf8'),body+'\n');
    strictEqual(readFileSync(join(dir,'TARGET.bound'),'utf8'),original);
    strictEqual(readFileSync(join(dir,'receipts.bound'),'utf8'),header);
    deepStrictEqual(readdirSync(join(dir,'.bound')),['cas']);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
