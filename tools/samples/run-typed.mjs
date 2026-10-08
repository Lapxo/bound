import {strict as assert} from 'node:assert';
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {canonical, signedBytes, formatSignature} from '@lapxo/topos/wire';
import {standingBytes} from '@lapxo/topos/standing';
import {moduleClosure} from './module-closure.mjs';
import {intervalForm, alphabetOfForm} from '@lapxo/topos/forms';
import {cell, parts, state, live, sign as ceiling, join as opening, require as floor, observe} from '@lapxo/obligations/views/field';

export function runTypedSample(reader, capture, sample='yes.json', continuation, inputs={}) {
  const root = mkdtempSync(join(tmpdir(), 'bound-typed-sample-'));
  const pair = generateKeyPairSync('ed25519');
  const key = join(root, 'device.pem');
  writeFileSync(key, pair.privateKey.export({type:'pkcs8', format:'pem'}), {mode:0o600});
  const place = join(root, 'place'); mkdirSync(place);
  const events = [];
  const run = args => {
    const started=performance.now();
    const p = spawnSync(process.execPath, [reader, ...args], {cwd:place, encoding:'utf8', timeout:30000});
    events.push({args:args.map(a=>a===key?'<ephemeral-key>':a.startsWith(root)?'<sample>/'+a.slice(root.length+1):a), status:p.status, runtimeMs:performance.now()-started, stdout:p.stdout, stderr:p.stderr});
    return p;
  };
  const ok = p => assert.equal(p.status, 0, p.stderr || p.stdout);
  const row = (scope, measure, value, more={}) => canonical({scope, measure, value, role:'writes', form:'alphabet', at:'policy:sample', by:'target', ...more});
  const yes=JSON.parse(readFileSync(inputs.yes ?? new URL('../../samples/typed/'+sample,import.meta.url),'utf8'));
  const closure = moduleClosure(new URL('./typed-provider.mjs', import.meta.url));
  const toposLines = [
    row('region/context', 'reads', 'offers/**|wire/**'),
    row('wire/forms','id',yes.form),
    row('offers/form','digest',closure.digest,{kind:'form',restsOn:closure.digest}),
    row('wire/topos/context-view', 'id', 'sample-context'),
    row('offers/context', 'digest', closure.digest, {kind:'check',view:'sample-context', restsOn:[...closure.blobs.keys()].sort().join('|')}),
  ];
  const standing = standingBytes(toposLines);
  const pin = 'sha256:'+createHash('sha256').update(standing).digest('hex');
  const seed = [
    ['keys/device','class','authorize'], ['keys/device','coverage','*'],
    ['keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')],
    ['keys/device','signer','file'], ['keys/reader','class','read'], ['keys/folder','class','fold'],
    ['signer/timeout','milliseconds','5000..5000'], ['signer/response-bytes','bytes','65536..65536'],
    ['wire/digest-algorithms','id','sha256'], ['wire/signature-algorithms','id','ed25519:sample'],
    ['wire/era','id','sample'], ['wire/families','id','B|C|D|G|keys|signer|wire|tree|write|leaf|reader|read|fold|receipts|rendered|resolved|beat|view|region|evidence|uses'],
    ['wire/forms','id','alphabet|interval'], ['wire/roles','id','reads|writes|demands'],
    ['wire/at-classes','id','origin|place|receipt|witness|policy'],
    ['wire/receipt-inputs','id','semantic-live@1'],
    ['wire/region-measures','id','coordinates|leaves'],
    ['view/cells','id','cells@1'], ['uses/sample','digest',pin],
  ].map(([scope,measure,value])=>row(scope,measure,value,{
    form:measure==='milliseconds'||measure==='bytes'?'interval':'alphabet',
    role:scope.startsWith('view/')?'demands':'writes',
  }));
  const grammar = JSON.parse(readFileSync(new URL('../../samples/typed/wire.json',import.meta.url),'utf8'));
  seed.push(...grammar);
  for (const [family,id,condition] of [['origin','ana','C'],['origin','luis','C'],['witness','local-opening','B']])
    seed.push(row(`evidence/${family}/${id}`,'id',id,{condition}));
  const directory = join(place, '.bound/cas/blobs');
  mkdirSync(directory,{recursive:true});
  for (const [digest,bytes] of [...closure.blobs, [pin,standing]]) {
    assert.equal('sha256:'+createHash('sha256').update(bytes).digest('hex'),digest);
    writeFileSync(join(directory,digest.split(':')[1]),bytes);
  }
  writeFileSync(join(place,'TARGET.bound'),seed.join('\n')+'\n');
  let epoch=2;
  let world = new Map();
  const params=yes.params, form=[intervalForm,alphabetOfForm].find(f=>f.id===yes.form), lattice=form.lattice(params);
  const oracle = (f, at) => {
    if(f.type==='cell') {world.set(f.scope,cell(f.scope,at,[],f.restsOn==='none'?[]:f.restsOn.split('|')));return;}
    const c=world.get(f.scope), line={id:f.id,at};
    if(f.sign==='-1') {
      if(f.type==='claim') world.set(f.scope,observe(c,{...line,origin:'',span:lattice.bottom,sign:-1,takes:f.takes},-1));
      else world.set(f.scope,{...c,marks:[...(c.marks??[]),{...line,sign:-1,takes:f.takes,pole:'ceiling',reach:'local',span:lattice.top}]});
      return;
    }
    const span=form.parse(params,f.value);
    if(f.type==='claim')world.set(f.scope,observe(c,{...line,origin:f.origin,span}));
    else if(f.pole==='floor')world=new Map(floor(lattice,world,f.scope,span,line));
    else if(f.reach==='travels')world=new Map(ceiling(lattice,world,f.scope,span,line));
    else {const next=opening(lattice,c,span,f.widens,at);world.set(f.scope,{...next,marks:next.marks.map((m,i)=>i===next.marks.length-1?{...m,id:f.id}:m)});}
  };
  const land = fields => {
    const records = fields.map(f=>{const stamped={...f, by:'device',epoch:String(epoch)};return canonical({...stamped,sig:formatSignature('ed25519:sample',sign(null,Buffer.from(signedBytes(stamped)),pair.privateKey).toString('base64'))});});
    const at=epoch;
    const path=join(root,'lot.txt');writeFileSync(path,records.join('\n')+'\n');const result=run(['land',path]);if(result.status===0){epoch++;for(const f of fields)oracle(f,at);}return result;
  };
  try {
    const worldLock=join(root,'topos.bound');writeFileSync(worldLock,toposLines.join('\n')+'\n');
    const foldedTopos=run(['fold',worldLock]);ok(foldedTopos);
    assert.ok(foldedTopos.stdout.includes('PIN '+pin),foldedTopos.stdout);
    assert.match(foldedTopos.stdout,/TOPOS/);
    ok(run(['land','--key','device','--key-file',key]));
    ok(land(yes.cells.map(c=>({...c,type:'cell',id:'def-'+c.scope,form:yes.form,measure:yes.measure,params:JSON.stringify(params),topos:pin}))));
    for(const act of yes.acts) ok(land([act]));
    const snapshots=[];
    const read = label => {
      const folded=run(['fold','--as','cells']);ok(folded);
      const cells=folded.stdout.split('\n').filter(line=>line.startsWith('CELL ')).map(line=>JSON.parse(line.slice(5)));
      assert.equal(cells.length,4,folded.stdout);
      for(const reading of cells) {
        const c=world.get(reading.cell);
        assert.equal(reading.state,state(lattice,c,world),label+' '+reading.cell);
        assert.deepEqual(reading.parts,JSON.parse(JSON.stringify(parts(lattice,c,world))),label+' '+reading.cell);
        assert.deepEqual(reading.ownMarks,live(c.marks??[]).map(m=>m.id));
      }
      snapshots.push({label,cells});return cells;
    };
    const cells=read('compatible independent observations');
    assert.equal(cells.find(c=>c.cell==='C').state,'FREE');
    assert.deepEqual(cells.find(c=>c.cell==='B').ownMarks,['s-B','j-B','r-B']);
    const idle=run(['fold','--as','cells']);ok(idle);assert.match(idle.stdout,/0 opened.*idle.*provider 0/);
    ok(land([{type:'claim',scope:'C',id:'disagreement',sign:'+1',origin:'ana',value:yes.scenarios.conflicting}]));
    assert.equal(read('conflicting observations').find(c=>c.cell==='C').state,'CONFLICT');
    for(const id of ['disagreement','c-C','c-L'])ok(land([{type:'claim',scope:'C',id:'withdraw-'+id,sign:'-1',takes:id}]));
    assert.equal(read('exact claim withdrawals').find(c=>c.cell==='C').state,'REQUIRED');
    for(const [id,origin] of [['outside-a','ana'],['outside-b','luis']])ok(land([{type:'claim',scope:'C',id,sign:'+1',origin,value:yes.scenarios.outside}]));
    assert.equal(read('outside travelling ceiling').find(c=>c.cell==='C').state,'FORBIDDEN');
    ok(land([{type:'mark',scope:'G',id:'incompatible-floor',sign:'+1',pole:'floor',reach:'travels',value:yes.scenarios.floorConflict}]));
    assert.equal(read('bounds conflict before origins').find(c=>c.cell==='G').state,'CONFLICT');
    ok(land([{type:'mark',scope:'B',id:'withdraw-j',sign:'-1',takes:'j-B'}]));
    assert.deepEqual(read('local opening withdrawn').find(c=>c.cell==='B').parts.signed,JSON.parse(JSON.stringify(form.parse(params,yes.acts[0].value))));
    const invalid=JSON.parse(readFileSync(inputs.no ?? new URL('../../samples/typed/no.json',import.meta.url),'utf8'));
    for(const example of invalid) {
      const record={...example.record};
      if(yes.form==='alphabet'&&record.value)record.value=({'44..47':'lock','0..100':'lock|readme|source','0..49':'readme','40..*':'lock'})[record.value]??record.value;
      const ledger=join(place,'.bound/ledger/device.bound');
      const before=createHash('sha256').update(readFileSync(ledger)).digest('hex');
      const refused=land([record]);assert.notEqual(refused.status,0,example.name);assert.match(refused.stderr,new RegExp(example.refusal),example.name);
      const after=createHash('sha256').update(readFileSync(ledger)).digest('hex');
      assert.equal(after,before,example.name+' must not append refused bytes');
      Object.assign(events.at(-1),{case:example.name,ledgerSHA256Before:before,ledgerSHA256After:after});
    }
    if(continuation)continuation({root,place,pair,key,seed,pin,standing,closure,yes,run,epoch,events});
    return {pin, artifact:closure.digest, artifacts:closure.blobs.size, cells, snapshots, events};
  } finally {
    if(capture)writeFileSync(capture,JSON.stringify({pin,artifact:closure.digest,place:yes.place,events},null,2)+'\n');
    rmSync(root,{recursive:true,force:true});
  }
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const require=createRequire(import.meta.url);
  const reader=process.argv[2]??join(dirname(require.resolve('@lapxo/bound/package.json')),'dist/cli/verb.js');
  const result=runTypedSample(reader,process.env.BOUND_TEST_CAPTURE);
  console.log('SAMPLE '+result.pin);
  for(const snapshot of result.snapshots) {
    console.log('SCENE '+snapshot.label);
    for(const reading of snapshot.cells)console.log('CELL '+JSON.stringify(reading));
  }
}
