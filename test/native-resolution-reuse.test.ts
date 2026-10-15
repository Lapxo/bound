import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const loader=fileURLToPath(new URL('../src/host/native/loader.ts',import.meta.url));
const provider=fileURLToPath(new URL('../src/host/provide.ts',import.meta.url));
const program=String.raw`
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import * as nodeModule from 'node:module';
import {pathToFileURL} from 'node:url';
import {canonical} from '@lapxo/topos/wire';
const {installNativeResolutionReuse,protectNativeLoaderRegistration,loadBoundary}=await import(LOADER);
const key=Symbol.for('bound.native.resolution@1'),sha=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
if(SCENARIO==='collision'){
 Object.defineProperty(globalThis,key,{value:Object.freeze({profile:'fixed-native-resolution@1',assertPins(){}}),writable:false,configurable:false});
 assert.throws(()=>installNativeResolutionReuse({members:[],libraries:[],builtins:[],entry:'',platform:sha('platform')}),/capability collision/);
}else{
 const temp=mkdtempSync(join(tmpdir(),'bound-fixed-resolution-'));
 try{
  const root=join(temp,'root'),pin=join(temp,'pinned'),members=[];
  const libraries=[{name:'outer',relative:'outer',value:DATASET},{name:'nested',relative:'outer/node_modules/nested',value:DATASET+1}];
  for(const lib of libraries){for(const base of [root,pin]){const dir=join(base,lib.relative);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'package.json'),JSON.stringify({name:lib.name,type:'module',exports:'./index.js'}));writeFileSync(join(dir,'index.js'),'export const value='+lib.value+';');}for(const name of ['package.json','index.js']){const path=join(root,lib.relative,name),bytes=readFileSync(path);members.push({path,digest:sha(bytes),bytes:bytes.length});}}
  const declaration={members,libraries:libraries.map(lib=>({name:lib.name,manifest:join(root,lib.relative,'package.json'),...(SCENARIO==='missing-coordinate'?{}:{coordinate:lib.relative+'/package.json'})})),builtins:[],entry:join(root,'outer/index.js'),platform:sha('declared platform')};
  const close=installNativeResolutionReuse(declaration),cap=globalThis[key],pins=libraries.map(lib=>({name:lib.name,at:join(pin,lib.relative)}));
  assert.equal(cap.profile,'fixed-native-resolution@1');assert.ok(Object.isFrozen(cap));assert.deepEqual(Object.keys(cap).sort(),['assertPins','libraries','libraryNames','profile']);
  assert.deepEqual(cap.libraryNames,['nested','outer']);assert.ok(Object.isFrozen(cap.libraryNames));assert.throws(()=>cap.libraryNames.push('catalog-world'),TypeError);
  assert.ok(Object.isFrozen(cap.libraries));assert.ok(cap.libraries.every(lib=>Object.isFrozen(lib)));
  assert.equal(Object.getOwnPropertyDescriptor(globalThis,key).writable,false);assert.equal(Object.getOwnPropertyDescriptor(globalThis,key).configurable,false);
  cap.assertPins(pins);
  if(SCENARIO==='changed-pinned'){
   const file=join(pin,'outer/index.js'),original=readFileSync(file);writeFileSync(file,original.toString().replace('value='+DATASET,'value='+(DATASET+1)));assert.throws(()=>cap.assertPins(pins),/member differs/);writeFileSync(file,original);cap.assertPins(pins);
  }else if(SCENARIO==='changed-root'){
   const file=join(root,'outer/index.js'),original=readFileSync(file);writeFileSync(file,original.toString().replace('value='+DATASET,'value='+(DATASET+1)));assert.throws(()=>cap.assertPins(pins),/member differs/);writeFileSync(file,original);cap.assertPins(pins);
  }else if(SCENARIO==='bad-pins'){
   assert.throws(()=>cap.assertPins([{name:'outer',at:join(temp,'absent')}]),/tree absent/);
   assert.throws(()=>cap.assertPins([{name:'unknown',at:pin}]),/not declared/);
   assert.throws(()=>cap.assertPins([pins[0],pins[0]]),/duplicate selection/);
   const file=join(pin,'outer/index.js');rmSync(file);assert.throws(()=>cap.assertPins([pins[0]]),/member absent/);
  }else if(SCENARIO==='nested'){
   const file=join(root,'outer/node_modules/nested/index.js'),original=readFileSync(file);writeFileSync(file,original.toString().replace('value='+(DATASET+1),'value='+(DATASET+2)));cap.assertPins([pins[0]]);assert.throws(()=>cap.assertPins([pins[1]]),/member differs/);
  }else if(SCENARIO==='lifetime'){
   installNativeResolutionReuse(declaration)();cap.assertPins(pins);
   const other={...declaration,platform:sha('different declared platform')};assert.throws(()=>installNativeResolutionReuse(other),/late resolution replacement/);
   assert.throws(()=>installNativeResolutionReuse({...declaration,libraries:declaration.libraries.map(lib=>({...lib,coordinate:'different/'+lib.coordinate}))}),/late resolution replacement/);
   assert.throws(()=>Object.defineProperty(globalThis,key,{value:{assertPins(){}}}),TypeError);
   close();assert.throws(()=>cap.assertPins(pins),/no current fixed library resolution/);assert.throws(()=>installNativeResolutionReuse(declaration),/already closed/);assert.throws(()=>installNativeResolutionReuse(other),/late resolution replacement/);
  }else if(SCENARIO==='registration'){
   protectNativeLoaderRegistration();assert.throws(()=>nodeModule.registerHooks({resolve(){}}),/not a fixed host capability/);assert.throws(()=>nodeModule.register('data:text/javascript,export{}',import.meta.url),/not a fixed host capability/);cap.assertPins(pins);
  }else if(SCENARIO==='catalog'){
   const {reuseNativeResolution}=await import(PROVIDER),provided=pins.map(pin=>({pkg:pin.name,at:pin.at}));
   assert.equal(reuseNativeResolution([...provided,{pkg:'catalog-world',at:pin}]),true);
   assert.throws(()=>cap.assertPins([{name:'catalog-world',at:pin}]),/not declared/);
   const boundary=loadBoundary(declaration);
   assert.throws(()=>boundary.resolve('catalog-world',{parentURL:pathToFileURL(declaration.entry).href},()=>{throw Error('unknown package reached native resolver')}),/library undeclared catalog-world/);
   const file=join(pin,'outer/index.js'),original=readFileSync(file);writeFileSync(file,original.toString().replace('value='+DATASET,'value='+(DATASET+1)));
   assert.throws(()=>reuseNativeResolution(provided),/member differs/);writeFileSync(file,original);assert.equal(reuseNativeResolution(provided),true);
  }else if(SCENARIO==='selection'){
   const {selectNativeDependencies,readProvidedPin,reuseNativeResolution}=await import(PROVIDER);
   const dep=(alias,needs)=>canonical({scope:'dep/'+alias,role:'reads',form:'alphabet',measure:'digest',value:sha(alias),by:'target',...(needs?{needs}:{})});
   const active=dep('opaque-alias','outer'),inactive=dep('unknown-catalog'),unmapped=dep('unmapped-catalog','absent');
   const selected=selectNativeDependencies(root,[inactive,active,unmapped],'package.json');assert.deepEqual(selected.map(item=>item.line),[active]);
   let opened=0;const provided=selected.map(item=>{opened++;return readProvidedPin('opaque-alias',join(pin,'outer'),'package.json',item.library.name)});assert.equal(opened,1);assert.equal(reuseNativeResolution(provided),true);
   assert.throws(()=>readProvidedPin('opaque-alias','','package.json',selected[0].library.name),/requires declared library/);
   const pinnedManifest=join(pin,'outer/package.json'),pinnedOriginal=readFileSync(pinnedManifest);writeFileSync(pinnedManifest,JSON.stringify({name:'nested'}));assert.throws(()=>readProvidedPin('opaque-alias',join(pin,'outer'),'package.json',selected[0].library.name),/library name differs/);writeFileSync(pinnedManifest,pinnedOriginal);
   const rootManifest=join(root,'outer/package.json'),rootOriginal=readFileSync(rootManifest);rmSync(rootManifest);assert.throws(()=>selectNativeDependencies(root,[active],'package.json'),/selected library mount absent/);
   const redirected=join(temp,'redirected-package.json');writeFileSync(redirected,rootOriginal);symlinkSync(redirected,rootManifest);assert.throws(()=>selectNativeDependencies(root,[active],'package.json'),/selected library mount differs/);rmSync(rootManifest);writeFileSync(rootManifest,rootOriginal);
   assert.equal(selectNativeDependencies(root,[active],'package.json').length,1);
   assert.throws(()=>loadBoundary(declaration).resolve('unknown-catalog',{parentURL:pathToFileURL(declaration.entry).href},()=>{throw Error('unknown package reached native resolver')}),/library undeclared/);
  }else if(SCENARIO==='missing-coordinate'){
   const {selectNativeDependencies}=await import(PROVIDER),line=canonical({scope:'dep/opaque-alias',role:'reads',form:'alphabet',measure:'digest',value:sha('archive'),by:'target',needs:'outer'});
   assert.throws(()=>selectNativeDependencies(root,[line],'package.json'),/logical library coordinate missing/);
   loadBoundary(declaration).assertClosed();
  }
 }finally{rmSync(temp,{recursive:true,force:true})}
}
console.log('FIXED RESOLUTION '+SCENARIO+' '+DATASET+' verified');
`;
for(const [scenario,dataset]of [['matching',1],['matching',6],['changed-pinned',1],['changed-root',1],['bad-pins',1],['nested',1],['lifetime',1],['registration',1],['catalog',1],['catalog',6],['selection',1],['selection',6],['missing-coordinate',1],['collision',1]] as const){
 test('fixed native resolution '+scenario+' dataset '+dataset,()=>{
  const source='const LOADER='+JSON.stringify(loader)+',PROVIDER='+JSON.stringify(provider)+',SCENARIO='+JSON.stringify(scenario)+',DATASET='+dataset+';\n'+program;
  const result=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined,String(result.error));assert.equal(result.signal,null,result.stderr);assert.equal(result.status,0,result.stderr||result.stdout);assert.match(result.stdout,/FIXED RESOLUTION .* verified/);
 });
}
