import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {observeFile,observeText} from '../src/observe/files.ts';

test('a coordinate removed between its stamp and read is absent; other read failures propagate',()=>{
  const root=fs.mkdtempSync(join(tmpdir(),'bound-observation-race-'));
  const read=fs.readFileSync;
  try{
    for(const observe of [observeText,observeFile]){
      const file=join(root,observe===observeText?'text':'bytes');
      fs.writeFileSync(file,'holder');
      fs.readFileSync=((at,...args)=>{
        if(at===file)fs.rmSync(file);
        return Reflect.apply(read,fs,[at,...args]);
      }) as typeof fs.readFileSync;
      syncBuiltinESMExports();
      assert.equal(observe(file),undefined);
    }
    const denied=join(root,'denied');fs.writeFileSync(denied,'holder');
    const error=Object.assign(new Error('permission denied'),{code:'EACCES'});
    fs.readFileSync=((at,...args)=>{
      if(at===denied)throw error;
      return Reflect.apply(read,fs,[at,...args]);
    }) as typeof fs.readFileSync;
    syncBuiltinESMExports();
    assert.throws(()=>observeText(denied),candidate=>candidate===error);
  }finally{
    fs.readFileSync=read;syncBuiltinESMExports();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
