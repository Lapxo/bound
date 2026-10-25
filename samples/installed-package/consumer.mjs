import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,cpSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const {installedPackageIdentity}=await import(process.env.BOUND_PACKAGE_API??'@lapxo/bound/package/native');
const fixture=JSON.parse(readFileSync(new URL('./fixture.json',import.meta.url),'utf8'));
const temporary=mkdtempSync(join(tmpdir(),'bound-installed-consumer-'));
const limits={members:40,bytes:200000,responseBytes:400000};
const library=fixture.library;
const pin={parent:'self',specifier:'fixture-math',snapshot:library.identity,source:library.sourceName,version:library.version,module:{identity:library.identity,entry:library.entry,members:new Map([[library.entry,{source:library.source,digest:library.digest}]])}};
const request={shape:'package',members:fixture.files.map(({coordinate,digest})=>({coordinate,digest})),exports:fixture.exports,pins:[pin],limits};
const refuses=code=>error=>error.code===code;
try{
 const first=join(temporary,'garden'),second=join(temporary,'harbor');mkdirSync(first);for(const file of fixture.files)writeFileSync(join(first,file.coordinate),file.source);cpSync(first,second,{recursive:true});
 const left=installedPackageIdentity({...request,directory:first}),right=installedPackageIdentity({...request,directory:second});
 assert.equal(left.digest,right.digest);assert.equal(left.lines,right.lines);assert.equal(left.modules.modules.length,3);assert.equal(left.consumedPins.length,1);
 assert.ok(left.lines.includes('file/unreachable.js'));assert.ok(!left.modules.modules.some(row=>row.module==='unreachable.js'));
 assert.ok(left.delivery.files.some(row=>row.source.includes('unusedSymbol')));assert.ok(left.delivery.files.some(row=>row.source.includes('unusedLibrarySymbol')));assert.ok(!('archiveDigest' in left));
 for(const directory of [first,second]){
  const reset=()=>{rmSync(directory,{recursive:true,force:true});mkdirSync(directory);for(const file of fixture.files)writeFileSync(join(directory,file.coordinate),file.source)};
  const mutation=fixture.mutation;writeFileSync(join(directory,mutation.coordinate),mutation.source);assert.throws(()=>installedPackageIdentity({...request,directory}),refuses('installed/member-integrity'));
  const changed=installedPackageIdentity({...request,directory,members:request.members.map(row=>row.coordinate===mutation.coordinate?{...row,digest:mutation.digest}:row)});assert.notEqual(changed.digest,left.digest);assert.equal(changed.modules.modules.length,3);reset();
  rmSync(join(directory,'leaf.js'));assert.throws(()=>installedPackageIdentity({...request,directory}),refuses('installed/missing-member'));reset();
  writeFileSync(join(directory,'extra.js'),'export const extra=1;');assert.throws(()=>installedPackageIdentity({...request,directory}),refuses('installed/uninventoried-member'));reset();
  const outside=join(temporary,'outside.js');writeFileSync(outside,'export const leaf=2;');rmSync(join(directory,'leaf.js'));symlinkSync(outside,join(directory,'leaf.js'));assert.throws(()=>installedPackageIdentity({...request,directory}),refuses('installed/external-member'));reset();
  assert.throws(()=>installedPackageIdentity({...request,directory,pins:[]}),/unpinned library fixture-math/);
 }
 console.log('INSTALLED PACKAGE · two copies agree · exact members manifest and consumed pins · changed missing extra external and unpinned refused · modules retain unused symbols');
}finally{rmSync(temporary,{recursive:true,force:true})}
