import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,symlinkSync,renameSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {observeText,observeFile,stampOf,coordinatesUnder} from '../src/observe/files.ts';

test('file reads use the link target identity without traversing directory links',()=>{
 const root=mkdtempSync(join(tmpdir(),'bound-file-read-'));
 try {
  const target=join(root,'target'),link=join(root,'link');
  writeFileSync(target,'first');symlinkSync(target,link);
  assert.equal(observeText(link),'first');
  writeFileSync(join(root,'replacement'),'other');renameSync(join(root,'replacement'),target);
  assert.equal(observeText(link),'other','same-size atomic target replacement invalidates the reading');
  mkdirSync(join(root,'directory'));writeFileSync(join(root,'directory','leaf'),'held');
  symlinkSync(join(root,'directory'),join(root,'directory-link'));
  assert.equal(observeFile(join(root,'directory-link')),undefined);
  assert.equal(stampOf(join(root,'directory-link'))?.kind,'link');
  assert.ok(!coordinatesUnder(root,root).some(name=>name.startsWith('directory-link/')));
  symlinkSync(join(root,'absent'),join(root,'dangling'));
  assert.equal(observeFile(join(root,'dangling')),undefined);
 } finally {rmSync(root,{recursive:true,force:true});}
});
