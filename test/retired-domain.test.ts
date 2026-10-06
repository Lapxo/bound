import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runReader } from '../src/observe/run.ts';
import { configurationValues } from '@lapxo/topos/forms';
import { canonical } from '@lapxo/topos/wire';
import { foldCeilings } from '../src/fold/ceilings.ts';

test('an unavailable declared reader refuses before running, rather than producing a zero or empty measurement', () => {
  const root=mkdtempSync(join(tmpdir(),'missing-reader-'));
  try {
    assert.throws(()=>runReader(join(root,'absent.ts'),root,[{place:'input',text:'actual bytes'}]),/REFUSE·reader .* unavailable; its declared capability needs an admitted provider/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('a configuration form with no adapter is not coerced to an alphabet', () => {
  assert.equal(configurationValues([{form:'unknown',value:'a|b'}]),undefined);
});

test('a retired measurement remains unread rather than paying its zero ceiling', () => {
  const ceiling=canonical({scope:'request',role:'reads',form:'interval',measure:'prose-marks',value:'0..0',by:'fixture',at:'policy:test',epoch:'2'});
  const got=foldCeilings({standing:[ceiling],ceilings:[ceiling],observed:[],own:{},epoch:2});
  assert.deepEqual(got.read,[]);assert.deepEqual(got.unread,[ceiling]);
});
