import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {canonical} from '@lapxo/topos/wire';
import {standingBytes} from '@lapxo/topos/standing';
import {admitStandingPins} from '../src/land/standing-pin.ts';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

for(const place of ['orchard','catalog'])test(`${place}: world admission distinguishes standing from archive without effects`,()=>{
  const digest='sha256:'+'a'.repeat(64);
  const pin=canonical({scope:`${place}/uses/world`,value:digest});
  const standing=Buffer.from(standingBytes([canonical({scope:'about',value:'a world'})]));
  let reads=0;
  admitStandingPins('.', [pin],()=>{reads++;return standing;});
  assert.equal(reads,1);
  for(const bytes of [gzipSync(standing),Buffer.from('not canonical standing'),Buffer.from([0xff])]){
    assert.throws(()=>admitStandingPins('.', [pin],()=>bytes),new RegExp(`REFUSE·pin ${place}/uses/world ${digest} .*nothing landed`));
  }
  admitStandingPins('.', [canonical({scope:`${place}/uses/world`,value:'withdraw'}),canonical({scope:'dep/world',value:digest})],()=>{throw Error('must not read');});
  assert.throws(()=>admitStandingPins('.', [pin],()=>{throw Error('content unavailable · not laid');}),/REFUSE·pin .*content unavailable.*nothing landed/);
});

test('admission inspects declared local standing bytes without writes or corruption fallback',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-held-standing-'));
 try{
  const bytes=standingBytes([canonical({scope:'name',value:'independent held content'})]);
  const digest='sha256:'+createHash('sha256').update(bytes).digest('hex');
  const pin=canonical({scope:'uses/world',value:digest,needs:'world.standing'});
  writeFileSync(join(root,'world.standing'),bytes);
  admitStandingPins(root,[pin]);assert.deepEqual(readdirSync(root),['world.standing']);
  writeFileSync(join(root,'world.standing'),bytes+'changed');
  assert.throws(()=>admitStandingPins(root,[pin]),/content hash mismatch.*nothing landed/);
  assert.deepEqual(readdirSync(root),['world.standing']);
  assert.throws(()=>admitStandingPins(root,[canonical({scope:'uses/world',value:digest,needs:'../outside'})]),/outside the place.*nothing landed/);
  writeFileSync(join(root,'world.standing'),bytes);
  mkdirSync(join(root,'.bound','cas','blobs'),{recursive:true});
  writeFileSync(join(root,'.bound','cas','blobs',digest.slice(7)),'corrupt');
  assert.throws(()=>admitStandingPins(root,[pin]),/content hash mismatch.*nothing landed/,'local corruption is never hidden by a second source');
 }finally{rmSync(root,{recursive:true,force:true});}
});
