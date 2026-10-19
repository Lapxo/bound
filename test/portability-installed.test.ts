import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,lstatSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical} from '@lapxo/topos/wire';
import {referenceRootFixture} from './support/reference-root.ts';
import {pathToFileURL} from 'node:url';
import {runEvidenceSample} from '../tools/samples/run-evidence.mjs';

const digest=(bytes:Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const archive=process.env.BOUND_PORTABILITY_ARCHIVE;
const expected=process.env.BOUND_PORTABILITY_DIGEST;
const enabled=Boolean(archive||expected);
const run=(command:string,args:string[],cwd:string)=>{
 const got=spawnSync(command,args,{cwd,encoding:'utf8',timeout:30000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''},maxBuffer:4<<20});
 assert.equal(got.status,0,`${command} failed: ${got.error?.message??got.stderr}`);
 return got.stdout;
};
const members=(root:string):string[]=>readdirSync(root,{withFileTypes:true}).flatMap(entry=>{
 const path=join(root,entry.name);assert.equal(lstatSync(path).isSymbolicLink(),false,'delivered members are regular files');
 return entry.isDirectory()?members(path):[path];
});

test('portability exact installed archive and independently admitted attest evidence',{skip:!enabled},async()=>{
 assert.ok(archive&&expected,'archive and registered sha256 are both required');
 assert.match(expected,/^sha256:[0-9a-f]{64}$/);
 const exact=resolve(archive),bytes=readFileSync(exact);assert.equal(digest(bytes),expected,'registered archive digest');
 const root=mkdtempSync(join(tmpdir(),'bound-portability-'));
 const transcripts:unknown[]=[];
 try{
  const extracted=join(root,'extracted'),consumer=join(root,'consumer');mkdirSync(extracted);mkdirSync(consumer);
  run('tar',['-xzf',exact,'-C',extracted],root);
  writeFileSync(join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
  run(process.platform==='win32'?'npm.cmd':'npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--cache',join(root,'npm-cache'),'--package-lock=false',exact],consumer);
  const packed=join(extracted,'package'),installed=join(consumer,'node_modules/@lapxo/bound');
  const entries=members(packed),installedEntries=members(installed);
  assert.deepEqual(entries.map(p=>relative(packed,p)).sort(),installedEntries.map(p=>relative(installed,p)).sort());
  for(const item of entries)assert.deepEqual(readFileSync(join(installed,relative(packed,item))),readFileSync(item),relative(packed,item));
  assert.equal(existsSync(join(consumer,'node_modules/@lapxo/bound/node_modules')),false,'no runtime dependency tree');
  const manifest=JSON.parse(readFileSync(join(installed,'package.json'),'utf8'));assert.deepEqual(Object.keys(manifest.dependencies??{}),[]);
  const check=run(process.execPath,[join(installed,'dist/cli/verb.js'),'fold','--check'],installed);
  assert.match(check,/PASS\s+closed/,'the exact public Root must close with no private store');
  const reference=await import(pathToFileURL(join(installed,'dist/host/reference-authenticated.js')).href);
  for(const name of ['catalog-observations','water-measurements']){
   const formed=referenceRootFixture(name);try{const opened=await reference.inspectAuthenticatedReference(formed.bundle.reference,formed.trust);assert.equal(opened.semanticIdentity,formed.bundle.context.semanticIdentity);const changed=Buffer.from(formed.bundle.carrier+' ');await assert.rejects(()=>reference.inspectAuthenticatedReference(formed.bundle.reference,{...formed.trust,fetchBytes:async()=>changed}),error=>error.code==='authenticated-reference/integrity')}finally{formed.f.close()}
   const captures=runEvidenceSample(join(installed,'dist/cli/verb.js'),'attest',{uncovered:{scope:'sample/north',value:'not-covered'},tamperedValue:'tampered-attestation'},undefined,{lines:[canonical({scope:'sample/archive',form:'alphabet',measure:'id',value:expected,role:'writes',by:'target',at:'policy:portability'}),canonical({scope:'sample/root-check',form:'alphabet',measure:'id',value:digest(Buffer.from(check)),role:'writes',by:'target',at:'policy:portability'})]});
   transcripts.push({place:name,independentFixture:true,privateFixtureAuthority:true,productionAuthority:false,captures});
  }
  const report={profile:'installed-attest-portability@1',archive:expected,members:entries.length,rootCheck:digest(Buffer.from(check)),referenceOpened:true,alteredReferenceRefused:true,platform:process.platform,architecture:process.arch,node:process.version,productionRootAuthority:false,otherMachineProof:false,transcripts};
  if(process.env.BOUND_PORTABILITY_CAPTURE)writeFileSync(process.env.BOUND_PORTABILITY_CAPTURE,JSON.stringify(report,null,2)+'\n');
 }finally{rmSync(root,{recursive:true,force:true})}
});
