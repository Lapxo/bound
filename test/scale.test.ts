import { strict as assert } from 'node:assert';
import { canonical, alphabet } from '@lapxo/topos/wire';
import { order, freedom, unit, withdrawsExactly, degenerate } from '@lapxo/obligations';
import { declaredConfig as declared } from '@lapxo/topos/forms';
import { openCells, openCards } from '../src/render/open.ts';
import { withdrawal } from '../src/land/withdraw.ts';
const row = (form: string,value: string,shape = ''): string => canonical({scope:'choice',form,value,shape,measure:'id',role:'writes',by:'fixture',at:'policy:fixture'});

test('symbolic alphabet freedom matches a materialized powerset on a small adversarial corpus', () => {
  for (let n = 0; n <= 5; n += 1) {
    const masks = Array.from({length:2 ** n},(_,i)=>i);
    const L = order(masks.map(String),masks.map(a=>masks.map(b=>(a & b) === a)));
    const line = row('alphabet',n ? Array.from({length:n},(_,i)=>`token${i}`).join('|') : 'none');
    const got = declared(line);
    assert.equal(got.bits,freedom(L,unit('choice',{floor:'0',ceiling:String(2 ** n-1)})));
    assert.equal(got.distributive,withdrawsExactly(L));
    assert.equal(got.degenerate,degenerate(L,level=>level.toString(2).split('').filter(c=>c==='1').length));
  }
});

test('alphabets beyond the old budget stay exact without an exponential order matrix', () => {
  const tokens = Array.from({length:20000},(_,i)=>`t${i}`);
  assert.equal(declared(row('alphabet',tokens.join('|'))).bits,tokens.length);
  assert.equal(declared(row('alphabet',alphabet({polarity:'permit',members:['a|b','c','a|b']}))).bits,2);
});

for (const value of ['0..4096','0..1000000000','0.1..0.2','9007199254740992..9007199254740993','-0.0000000000000000002..-0.0000000000000000001']) test(`continuous ${value} never invents a quantum`, () => {
  const got = declared(row('interval',value));
  assert.equal(got.bits,null); assert.equal(got.kind,'continuous'); assert.equal(got.distributive,false);
});

test('an exactly fixed or empty band leaves no numeric choice, without floating point endpoint aliasing', () => {
  assert.equal(declared(row('interval','1.0..1')).bits,0);
  assert.equal(declared(row('interval','2..1')).bits,0);
  assert.equal(declared(row('interval','9007199254740993..9007199254740993')).bits,0);
});

test('complements, open endpoints and unsupported declarations remain explicitly unquantified', () => {
  assert.equal(declared(row('alphabet','not:a|b')).bits,null);
  assert.equal(declared(row('interval','*..10')).bits,null);
  assert.equal(declared(row('other','value')).kind,'unsupported');
  assert.equal(declared('malformed').kind,'invalid');
  assert.equal(declared(row('alphabet','withdraw')).kind,'inactive');
});

test('withdrawal uses known lattice structure, without pretending an interval is a scalar chain', () => {
  const held = [row('interval','0..10'),row('alphabet','a|b'),row('alphabet','not:a'),row('other','x')];
  const got = withdrawal([canonical({scope:'choice',value:'withdraw',by:'owner'})],held);
  assert.deepEqual(got.exact,[held[1]]); assert.deepEqual(got.inexact,[held[0]]); assert.deepEqual(got.open,[held[2],held[3]]);
});

test('open questions retain unknown freedom instead of vanishing or becoming zero', () => {
  const opened = openCells({store:'unused',standing:[row('interval','0..1000000','decision'),row('alphabet','a|b','decision')],observed:[],grey:[],epoch:1});
  assert.equal(opened.length,2);
  assert.equal(opened.find(one=>one.freedom==='continuous')?.bits,null);
  assert.equal(opened.find(one=>one.freedom==='finite')?.bits,2);
  const text = openCards(opened).join('\n');
  assert.ok(text.includes('unknown freedom (continuous)')); assert.ok(!text.includes('coherence')); assert.ok(!text.includes('bits 0.0'));
});

test('configuration estimates never measure a typed object or introduce its valuation', () => {
  const got=declared(canonical({type:'claim',scope:'C',id:'one',form:'alphabet',value:'a|b'}));
  assert.equal(got.kind,'unsupported');assert.equal(got.bits,null);
});
