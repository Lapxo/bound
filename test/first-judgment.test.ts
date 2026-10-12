import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical } from '@lapxo/topos/wire';
import { judgeTake } from '../src/judge/take.ts';

test('vouched bytes do not substitute for a missing judgment, with all validation retained', () => {
  const root = mkdtempSync(join(tmpdir(), 'bound-first-judgment-'));
  try {
    writeFileSync(join(root, 'TARGET.bound'), canonical({scope:'wire/digest-algorithms', role:'writes', form:'alphabet', measure:'id', value:'sha256', by:'target', at:'policy:test'})+'\n');
    mkdirSync(join(root, 'samples/yes'), { recursive: true });
    writeFileSync(join(root, 'samples/yes/case.json'), '{}\n');
    const path = 'samples/yes/case.json';
    const held = new Map([[path, 'same-byte-identity']]);
    const input = {root, scope:'law/example', value:'present', locations:[path], before:held, after:held, template:'{roots}'};
    const first = judgeTake({...input, unpaid:true});
    compare(first.kind, 'fact');
    compare(first.changed, [], 'first judgment invents no movement');
    compare(first.envelope.cone, [path], 'judgment still binds its actual cone');
    compare(judgeTake(input).kind, 'refuse', 'no missing judgment and no change refuses');
    compare(judgeTake({...input, unpaid:true, locations:['samples/yes/missing.json']}).kind, 'refuse', 'missing input stays red');
    compare(judgeTake({...input, unpaid:true, shape:'lock'}).kind, 'refuse', 'non-wire data cannot satisfy a lock');
    compare(judgeTake({...input, unpaid:true, shape:'render', restsOn:'sha256:wrong'}).kind, 'refuse', 'digest mismatch stays red');
    compare(judgeTake({...input, unpaid:true, locations:['data.json'], before:new Map(), after:new Map()}).kind, 'refuse', 'no vector stays red');
    compare(judgeTake({...input, unpaid:true, locations:['samples/yes/other.json'], after:new Map([[path,'changed']])}).kind, 'refuse', 'outside-cone movement stays red');
  } finally { rmSync(root, {recursive:true, force:true}); }
});
