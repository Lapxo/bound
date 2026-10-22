import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,cpSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import {sha256} from '../src/host/hash.ts';
import {installedPackageIdentity} from '../src/host/native/installed-package.ts';

const caseYes=JSON.parse(readFileSync(new URL('../samples/installed-package/yes.json',import.meta.url),'utf8'));
const caseNo=JSON.parse(readFileSync(new URL('../samples/installed-package/no.json',import.meta.url),'utf8'));
const limits={members:40,bytes:200000,responseBytes:400000};
const failure=(code:string)=>(error:any)=>error.code===code;
const manifest=JSON.stringify({name:'fixture-installed',version:'1.0.0',type:'module',exports:{'.':'./index.js'}});
const content=new Map<string,string>(caseYes.files.map((file:{coordinate:string;source:string})=>[file.coordinate,file.source]));
const members=caseYes.files.map(({coordinate,digest}:{coordinate:string;digest:string})=>({coordinate,digest}));
const librarySource=caseYes.library.source;
const library={identity:sha256('authenticated-library-snapshot'),entry:'lib.js',members:new Map([['lib.js',{source:librarySource,digest:sha256(librarySource)}],['unreachable.js',{source:'export const privateValue=3;',digest:sha256('export const privateValue=3;')}]])};
const pins=[{parent:'self',specifier:'fixture-math',snapshot:library.identity,source:'fixture-math',version:'2.0.0',module:library}];

test('installed package identity is portable across two copies and keeps file, module and symbol units distinct',()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-installed-'));try{
  const first=join(temp,'one'),second=join(temp,'two');mkdirSync(first);for(const [name,source] of content)writeFileSync(join(first,name),source);cpSync(first,second,{recursive:true});
  const request={shape:'package',members,exports:[['exports','.']],pins,limits};
  const a=installedPackageIdentity({...request,directory:first}),b=installedPackageIdentity({...request,directory:second});
  assert.equal(a.digest,b.digest);assert.equal(a.lines,b.lines);assert.equal(a.members,5);assert.equal(a.manifest,sha256(manifest));
  assert.equal(a.consumedPins.length,1);assert.equal(a.modules.modules.length,3);
  assert.ok(!a.modules.modules.some(row=>row.module==='unreachable.js'));
  const kept=a.delivery.files.find(row=>row.source.includes('unusedSymbol'));assert.ok(kept,'complete reached module remains, including unused symbols');
  assert.ok(a.delivery.files.some(row=>row.source.includes('unusedLibrarySymbol')));
  assert.ok(a.lines.includes('file/unreachable.js'),'complete installed bytes include unreachable module file');
  assert.ok(a.lines.includes('file/NOTICE'));assert.ok(!('archiveDigest' in a));
  const tar=spawnSync('tar',['-cf','-','-C',first,'.']);assert.equal(tar.status,0,String(tar.stderr));
  const gzip=gzipSync(tar.stdout),repacked=Buffer.from(gzip);repacked[9]=gzip[9]===3?0:3;
  assert.deepEqual(gunzipSync(gzip),tar.stdout);assert.deepEqual(gunzipSync(repacked),tar.stdout);assert.notEqual(sha256(gzip),sha256(repacked));assert.notEqual(sha256(gzip),sha256(tar.stdout));assert.notEqual(a.digest,sha256(gzip));assert.notEqual(a.digest,sha256(tar.stdout));
  assert.equal(installedPackageIdentity({...request,directory:first}).digest,a.digest,'compression metadata cannot change installed-byte identity');
  assert.equal(a.snapshot,b.snapshot);assert.notEqual(a.digest,a.delivery.digest);assert.notEqual(a.digest,a.snapshot);
  const unused={...pins[0]!,specifier:'never-imported',snapshot:sha256('unused-pin'),module:{...library,identity:sha256('unused-pin')}};
  assert.equal(installedPackageIdentity({...request,directory:first,pins:[...pins,unused]}).digest,a.digest,'unconsumed pin is not a consumed dependency');
  writeFileSync(join(second,'unreachable.js'),'export const unreachable=42;\n');
  assert.throws(()=>installedPackageIdentity({...request,directory:second}),failure('installed/member-integrity'));
  const revised=members.map(m=>m.coordinate==='unreachable.js'?{...m,digest:sha256('export const unreachable=42;\n')}:m);
  const updated=installedPackageIdentity({...request,directory:second,members:revised});assert.notEqual(updated.digest,a.digest);assert.equal(updated.modules.modules.length,3);
 }finally{rmSync(temp,{recursive:true,force:true})}
});

test('installed package refuses changed missing extra external and unpinned executable members in two copies',()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-installed-no-'));try{for(const name of caseYes.places as string[]){
  const root=join(temp,name);mkdirSync(root);const reset=()=>{rmSync(root,{recursive:true,force:true});mkdirSync(root);for(const [file,source] of content)writeFileSync(join(root,file),source)};reset();
  const request={directory:root,shape:'package',members,exports:[['exports','.']],pins,limits};
  assert.throws(()=>installedPackageIdentity({...request,limits:{...limits,members:0}}),failure('installed/resources'));
  const cancelled=new AbortController();cancelled.abort();assert.throws(()=>installedPackageIdentity({...request,limits:{...limits,signal:cancelled.signal}}),failure('installed/cancelled'));
  assert.throws(()=>installedPackageIdentity({...request,members:[...members,members[0]!]}),failure('installed/inventory'));
  assert.throws(()=>installedPackageIdentity({...request,pins:[pins[0]!,pins[0]!]}),failure('installed/pin'));
  const invalid=Buffer.from(caseNo.invalidUtf8Bytes);writeFileSync(join(root,'unreachable.js'),invalid);
  assert.throws(()=>installedPackageIdentity({...request,members:members.map(row=>row.coordinate==='unreachable.js'?{...row,digest:sha256(invalid)}:row)}),failure('installed/text-member'));reset();

  writeFileSync(join(root,'leaf.js'),caseNo.alteredLeaf);assert.throws(()=>installedPackageIdentity(request),failure('installed/member-integrity'));reset();
  rmSync(join(root,'leaf.js'));assert.throws(()=>installedPackageIdentity(request),failure('installed/missing-member'));reset();
  writeFileSync(join(root,'extra.js'),caseNo.extraSource);assert.throws(()=>installedPackageIdentity(request),failure('installed/uninventoried-member'));reset();
  const outside=join(temp,name+'-outside.js');writeFileSync(outside,content.get('leaf.js')!);rmSync(join(root,'leaf.js'));symlinkSync(outside,join(root,'leaf.js'));assert.throws(()=>installedPackageIdentity(request),failure('installed/external-member'));reset();
  assert.throws(()=>installedPackageIdentity({...request,pins:[]}),/unpinned library fixture-math/);
  const changedLibrary={...library,members:new Map(library.members)};changedLibrary.members.set('lib.js',{source:caseNo.changedLibrary,digest:sha256(librarySource)});
  assert.throws(()=>installedPackageIdentity({...request,pins:[{...pins[0]!,module:changedLibrary}]}),/module closure bytes differ/);
  assert.throws(()=>installedPackageIdentity({...request,exports:[['exports',caseNo.badExport]]}),failure('installed/export'));
  assert.throws(()=>installedPackageIdentity({...request,shape:caseNo.wrongShape}),failure('installed/manifest'));
  writeFileSync(join(root,'package.json'),manifest+' ');assert.throws(()=>installedPackageIdentity(request),failure('installed/member-integrity'));reset();
  const manifest2=manifest.replace('1.0.0','1.0.1');writeFileSync(join(root,'package.json'),manifest2);const revised=members.map(m=>m.coordinate==='package.json'?{...m,digest:sha256(manifest2)}:m);assert.notEqual(installedPackageIdentity({...request,members:revised}).digest,installedPackageIdentity({...request,directory:(()=>{reset();return root})()}).digest);
 }}finally{rmSync(temp,{recursive:true,force:true})}
});
