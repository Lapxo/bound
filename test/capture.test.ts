import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { canonical } from '@lapxo/topos/wire';

// Scenario capture is test tooling. Product measurements need a selected, admitted provider.
function capture(bytes: Uint8Array, name: string): string {
  const root=mkdtempSync(join(tmpdir(),'bound-cli-capture-'));
  try {
    writeFileSync(join(root,name),bytes);
    const run=spawnSync(process.execPath,[new URL('../src/cli/verb.ts',import.meta.url).pathname,'fold',name],{cwd:root,encoding:'utf8'});
    if(run.error)throw run.error;
    assert.equal(run.status,0,run.stderr+run.stdout);
    assert.equal(run.stderr,'');
    return run.stdout;
  } finally {rmSync(root,{recursive:true,force:true});}
}

test('scenario tooling captures supplied bytes and only actual CLI output', () => {
  const output=capture(new TextEncoder().encode((JSON.parse(readFileSync(new URL('./fixtures/meeting.records.json',import.meta.url),'utf8')) as Readonly<Record<string,string>>[]).map(record=>canonical(record)).join('\n')+'\n'),'meeting.bound');
  assert.match(output,/FACT\s+4 standing · 0 forks · meeting\.bound/);
  assert.ok(!output.includes('capture/refused'));assert.ok(!output.includes('capture/usage'));
});
test('host capture retains readings without interpreting their domain', () => {
  const bytes=(second:string)=>new TextEncoder().encode(['1.3..1.5',second].map((value,i)=>canonical({scope:'water/depth',value,by:`source${i}`,at:`origin:${i}`,role:'reads',form:'interval',measure:'metre'})).join('\n'));
  const agreed=capture(bytes('1.2..1.6'),'water.bound');
  const forked=capture(bytes('5..6'),'water.bound');
  assert.match(agreed,/FACT\s+2 standing · 0 forks · water\.bound/);
  assert.match(forked,/FACT\s+2 standing · 0 forks · water\.bound/);
  for (const output of [agreed, forked]) {
    assert.match(output, /readings · no encounters computed/);
    assert.doesNotMatch(output, /^CELL /m);
  }
  assert.ok(!agreed.includes('meeting'));
});


test('scenario tooling retains the same-signer malformed-history negative control', () => {
  const root=mkdtempSync(join(tmpdir(),'bound-malformed-capture-'));
  try {
    const lines=['1..2','3..4'].map(value=>canonical({scope:'coordinate',value,by:'source',at:'origin:source',role:'reads',form:'interval',measure:'unit'}));
    writeFileSync(join(root,'malformed.bound'),lines.join('\n'));
    const run=spawnSync(process.execPath,[new URL('../src/cli/verb.ts',import.meta.url).pathname,'fold','malformed.bound'],{cwd:root,encoding:'utf8'});
    assert.equal(run.status,1);assert.match(run.stderr,/REFUSE·document/);assert.ok(!run.stdout.includes('CONFLICT'));
  } finally {rmSync(root,{recursive:true,force:true});}
});

// A host summary cannot imply object freedom from a missing configuration reading.
test('file field labels its computation without object states', async () => {
  const {field}=await import('../src/render/field.ts');
  const root=mkdtempSync(join(tmpdir(),'bound-field-output-'));
  try {
    const missing=canonical({scope:'requirement/input',role:'demands',form:'alphabet',measure:'status',value:'present',by:'target',at:'policy:sample'});
    const output=field({root,regions:{named:[],bounds:[],summaries:[]},own:{},ceilings:{unread:[],vacuous:[]},missing:[missing],forks:[]} as unknown as import('../src/cli/place.ts').PlaceFold,3).join('\n');
    assert.match(output,/readings · no encounters computed/);
    assert.match(output,/requirement\/input · unanswered/);
    assert.doesNotMatch(output,/\b(?:REQUIRED|FREE|CONFLICT|FORBIDDEN)\b/);
    assert.doesNotMatch(output,/\d+ cells/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
