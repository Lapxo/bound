import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {canonical} from '@lapxo/topos/wire';

test('a proposed place with an invalid selected pin refuses without inventing a world or a render',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-stranger-'));
 writeFileSync(join(root,'TARGET.bound'),[
  canonical({scope:'publish/bootstrap',role:'writes',form:'alphabet',measure:'id',value:'here',by:'target',at:'place:here'}),
  canonical({scope:'uses/world',role:'writes',form:'alphabet',measure:'id',value:'unlaid',by:'target',at:'place:here'}),
  canonical({scope:'view/readme',role:'demands',form:'alphabet',measure:'id',value:'hero',needs:'README.md',shape:'README.md',by:'target',at:'place:here'}),
 ].join('\n')+'\n');
 writeFileSync(join(root,'README.md'),'here\n');mkdirSync(join(root,'.bound'));
 const run=spawnSync(process.execPath,[join(import.meta.dirname,'../src/cli/verb.ts'),'fold'],{cwd:root,encoding:'utf8'});
 assert.equal(run.status,1);assert.match(run.stderr,/REFUSE·pin unlaid digest is not admitted/);
 assert.doesNotMatch(run.stdout,/FETCHED|RENDERED|PASS closed/);
});
