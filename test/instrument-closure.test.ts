import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {canonical} from '@lapxo/topos/wire';
import {instrumentDigest} from '../src/fold/digests.ts';

test('implementation identity follows compiled imports, package exports and declared subprocesses, independently of location', () => {
  const root=mkdtempSync(join(tmpdir(),'bound-implementation-'));
  try {
    const store=join(root,'.bound');
    const wire=canonical({scope:'wire/digest-algorithms',role:'writes',form:'alphabet',measure:'id',value:'sha256',by:'target',at:'policy:wire'});
    writeFileSync(join(root,'TARGET.bound'),wire+'\n');
    mkdirSync(join(root,'node_modules','fixture-provider'),{recursive:true});
    writeFileSync(join(root,'node_modules','fixture-provider','package.json'),'{"type":"module","exports":"./index.js"}');
    const provider=join(root,'node_modules','fixture-provider','index.js');
    writeFileSync(provider,'export const value=1;\n');
    writeFileSync(join(root,'entry.js'),'import "node:fs"; export {value} from "fixture-provider"; import("./helper.js");\n');
    writeFileSync(join(root,'helper.js'),'export const helper=1;\n');
    writeFileSync(join(root,'worker.js'),'export const worker=1;\n');
    const process=canonical({scope:'process/test',kind:'process',role:'writes',form:'alphabet',measure:'id',value:'present',needs:'worker.js',by:'target',at:'policy:process'});
    const digest=()=>instrumentDigest(store,join(root,'entry.js'),[],root,[process]);
    const first=digest();
    writeFileSync(provider,'export const value=200;\n');
    const second=digest(); assert.notEqual(second,first,'bare compiled imports must be measured');
    writeFileSync(join(root,'worker.js'),'export const worker=200;\n');
    const third=digest(); assert.notEqual(third,second,'a declared child process is implementation');
    writeFileSync(join(root,'helper.js'),'export const helper=200;\n');
    assert.notEqual(digest(),third,'a literal dynamic import is implementation');
  } finally {rmSync(root,{recursive:true,force:true});}
});
