import { generateKeyPairSync } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical } from '@lapxo/topos/wire';
import { fieldOf, foldClaims } from '../src/fold/claims.ts';
import { signConsentLine, verifiesOwnerLine } from '../src/land/sign.ts';

const claim = (by: string, value: string, epoch = '1'): string =>
  canonical({ scope: 'meeting/when', role: 'reads', form: 'interval', measure: 'hour', value, by, at: `origin:${by}`, epoch });

const digest = (lines: readonly string[]): string =>
  foldClaims(lines).standing.map((line) => `${fieldOf(line, 'by')}=${fieldOf(line, 'value')}`).sort().join(' ')
  + '|' + foldClaims(lines).forks.map((fork) => `${fork.key}:${fork.state ?? ''}:${fork.lines.length}`).sort().join(' ');

test('union of lines is commutative, associative and idempotent', () => {
  const a = [claim('ana', '10..14')];
  const b = [claim('luis', '12..16')];
  const c = [claim('room', '10..13')];
  compare(digest([...a, ...b]), digest([...b, ...a]), 'commutative');
  compare(digest([...a, ...a]), digest(a), 'idempotent');
  compare(digest([...a, ...b, ...c]), digest([...a, ...[...b, ...c]]), 'associative left');
  compare(digest([...[...a, ...b], ...c]), digest([...a, ...b, ...c]), 'associative right');
});

test('order of lines does not change the fold', () => {
  const lines = [claim('ana', '10..14'), claim('luis', '12..16'), claim('room', '10..13')];
  compare(digest(lines), digest([...lines].reverse()), 'reverse');
  compare(digest(lines), digest([lines[1]!, lines[2]!, lines[0]!]), 'rotate');
});

test('different origins remain live host inscriptions without an algebraic verdict', () => {
  const ana = claim('ana', '10..12');
  const luis = claim('luis', '14..16');
  const left = foldClaims([ana, luis]);
  const right = foldClaims([luis, ana]);
  compare(left.forks.length, 0, 'host history supplies no lattice verdict');
  compare(left.standing.length, 2, 'both origins remain live');
  compare(digest([ana, luis]), digest([luis, ana]), 'order does not pick a winner');
  compare(left.forks[0]?.lines.length, right.forks[0]?.lines.length, 'both sides stand');
});

test('a changed byte of a signed line does not verify', () => {
  const pair = generateKeyPairSync('ed25519');
  const pem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pub = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const drafted = canonical({
    scope: 'meeting/when', role: 'reads', form: 'interval', measure: 'hour', value: '10..14',
    by: 'target', at: 'origin:ana',
  });
  const era = 'ed25519:era1';
  const got = signConsentLine(drafted, pem, { epoch: 1, by: 'ana', algorithm: era });
  compare(got.kind, 'fact', 'signs');
  if (got.kind !== 'fact') return;
  compare(verifiesOwnerLine(got.line, pub, [era]), true, 'holds');
  const tampered = got.line.replace('10..14', '10..15');
  compare(verifiesOwnerLine(tampered, pub, [era]), false, 'a changed byte fails');
});

test('foldClaims is a function of its lines: a second fold of the same lines is the same fold', () => {
  const lines = [claim('ana', '10..14'), claim('luis', '12..16')];
  compare(digest(lines), digest(lines), 'pure');
  compare(foldClaims(lines).standing.length, foldClaims([...lines, ...lines]).standing.length, 'duplicates do not grow standing');
});

test('the kernel names no world', () => {
  const walk = (dir: string): readonly string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const at = join(dir, entry.name);
    return entry.isDirectory() ? walk(at) : entry.name.endsWith('.ts') ? [at] : [];
  });
  const banned = /npm|node_modules|package\.json|github|tsconfig|eslint/;
  const hits = walk(join(import.meta.dirname, '..', 'src')).filter((at) => banned.test(readFileSync(at, 'utf8')));
  compare(hits, [], hits.join('\n'));
});


test('two distinct live inscriptions by one signer refuse; explicit epoch revisions remain history', () => {
  const a = claim('ana', '10..12');
  const b = claim('ana', '14..16');
  for (const lines of [[a,b],[b,a]]) {
    let why = '';
    try { foldClaims(lines); } catch (error) { why = String(error); }
    compare(why.includes('REFUSE·document'), true, 'same-signer malformed history refuses');
  }
  const newer = claim('ana', '14..16', '2');
  compare(foldClaims([a,newer]).standing, [newer], 'epoch supersedes without another algebra');
  compare(foldClaims([a,newer]).superseded, [a], 'spent revision remains accounted');
});


test('distinct host observation coordinates do not become revisions of one inscription', () => {
  const a = claim('reader', '1..2');
  const b = a.replace('at=origin:reader','at=origin:another').replace('value=1..2','value=3..4');
  compare(foldClaims([a,b]).standing.length, 2, 'both at coordinates stand');
  compare(foldClaims([a,b]).forks.length, 0, 'no object verdict');
});
