import { test } from 'node:test';
import { deepStrictEqual, equal, ok, throws } from 'node:assert/strict';
import { PROTOCOL } from '@lapxo/topos/wire';
import type { Request } from '@lapxo/topos/contract';
import { CapsuleProcessError, executeCapsule } from '../src/host/capsule-process.ts';

const requests: readonly Request[] = [{ protocol: PROTOCOL, verb: 'render', rootScope: 'fixture', region: 'one', files: [] }];
const fact = { protocol: PROTOCOL, kind: 'fact', lines: ['actual fixture output'] };
const printed = JSON.stringify([fact]);
const run = (source: string, count: readonly Request[] = requests): ReturnType<typeof executeCapsule> => executeCapsule(process.execPath, ['-e', source], count);
const failure = (source: string, check: (error: CapsuleProcessError) => void, count: readonly Request[] = requests): void => {
  throws(() => run(source, count), (error: unknown) => {
    ok(error instanceof CapsuleProcessError);
    check(error);
    return true;
  });
};

test('capsule accepts complete last-line framing and preserves valid refusal and abstention', () => {
  deepStrictEqual(run(`console.log('module diagnostic'); console.log(${JSON.stringify(printed)})`), [fact]);
  for (const kind of ['refuse', 'abstain']) {
    const response = { protocol: PROTOCOL, kind, why: 'fixture explicitly declined' };
    deepStrictEqual(run(`console.log(${JSON.stringify(JSON.stringify([response]))})`), [response]);
  }
});

test('valid-looking stdout from a failed process is never returned, with both streams intact', () => {
  failure(`process.stdout.write(${JSON.stringify(printed)}); process.stderr.write('precise child cause'); process.exit(23)`, (error) => {
    equal(error.status, 23);
    equal(error.stdout, printed);
    equal(error.stderr, 'precise child cause');
    ok(error.message.includes('precise child cause'));
  });
});

test('termination signal is an operational failure even when a complete response preceded it', () => {
  failure(`process.stdout.write(${JSON.stringify(printed)}); process.kill(process.pid, 'SIGTERM')`, (error) => {
    equal(error.status, null);
    equal(error.signal, 'SIGTERM');
    equal(error.stdout, printed);
  });
});

test('a partial batch cannot leak its successful prefix to the caller', () => {
  failure(`console.log(${JSON.stringify(printed)})`, (error) => {
    equal(error.status, 0);
    ok(error.message.includes('expected 2 responses'));
  }, [...requests, { ...requests[0]!, region: 'two' }]);
});

test('missing, malformed, excess, wrong protocol and wrong payload responses are refused', () => {
  for (const output of ['', '[broken', JSON.stringify([fact, fact]), JSON.stringify([{ ...fact, protocol: 'wrong' }]), JSON.stringify([{ ...fact, lines: [4] }]), '{}']) {
    failure(`process.stdout.write(${JSON.stringify(output)})`, (error) => equal(error.status, 0));
  }
});

test('host supplied deadline and output limit report execution failure without a response', () => {
  throws(() => executeCapsule(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], requests, { timeout: 300 }), (error: unknown) => {
    ok(error instanceof CapsuleProcessError);
    equal((error.cause as NodeJS.ErrnoException).code, 'ETIMEDOUT');
    return true;
  });
  throws(() => executeCapsule(process.execPath, ['-e', "process.stdout.write('x'.repeat(4096))"], requests, { maxBuffer: 1024 }), (error: unknown) => {
    ok(error instanceof CapsuleProcessError);
    equal((error.cause as NodeJS.ErrnoException).code, 'ENOBUFS');
    return true;
  });
});

test('spawn errors carry the original system cause', () => {
  throws(() => executeCapsule('/nonexistent-bound-test-executable', [], requests), (error: unknown) => {
    ok(error instanceof CapsuleProcessError);
    equal((error.cause as NodeJS.ErrnoException).code, 'ENOENT');
    return true;
  });
});

test('a failed actual capsule ask leaves its answer cache slot absent', async () => {
  const { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { createHash } = await import('node:crypto');
  const { canonical, CAPSULE } = await import('@lapxo/topos/wire');
  const { locatedAt } = await import('../src/host/capsule.ts');
  const { processOf } = await import('../src/observe/runner.ts');
  const root = mkdtempSync(join(tmpdir(), 'capsule-failure-cache-'));
  const prior = process.argv[1];
  process.argv[1] = fileURLToPath(new URL('../src/cli/verb.ts', import.meta.url));
  try {
    writeFileSync(join(root, CAPSULE), canonical({ scope: 'region/one', value: '**', role: 'render', form: 'alphabet', measure: 'reads', by: 'fixture', at: 'policy:test' }) + '\n');
    writeFileSync(join(root, 'failure.js'), "process.stderr.write('fixture capsule refused operationally'); process.exit(23); export const render = () => ['never reached'];");
    const cacheStore = join(root, '.bound');
    const capsule = locatedAt(root, '', cacheStore);
    ok(capsule);
    const sha = (text: string | Uint8Array): string => createHash('sha256').update(text).digest('hex');
    const loader = sha(readFileSync(processOf('located', 'host')));
    const request = { ...requests[0]!, rootScope: root };
    const slot = sha(`${capsule.digest}\n${loader}\n${request.verb}\n${request.rootScope}\n${request.region ?? ''}`);
    const cache = join(cacheStore, 'cas', 'answers', slot);
    equal(existsSync(cache), false);
    throws(() => capsule.ask([request]), CapsuleProcessError);
    equal(existsSync(cache), false);
    const legacy = JSON.stringify({ hit: sha(`${capsule.digest}\n${loader}\n${JSON.stringify(request)}`), said: fact });
    mkdirSync(dirname(cache), { recursive: true });
    writeFileSync(cache, legacy);
    try {
      throws(() => capsule.ask([request]), CapsuleProcessError);
      equal(readFileSync(cache, 'utf8'), legacy, 'a legacy unverified fact cannot conceal a failed process');
    } finally { rmSync(cache, { force: true }); }
  } finally {
    process.argv[1] = prior;
    rmSync(root, { recursive: true, force: true });
  }
});
