/** Disposable component fixture: authority is generated here, never from the owner. */
import {parentPort,workerData} from 'node:worker_threads';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const repo=new URL('..',import.meta.url).pathname,require=createRequire(join(repo,'package.json'));
const {canonical,signedBytes,formatSignature}=await import(pathToFileURL(require.resolve('@lapxo/topos/wire')).href);
const {canonicalJson}=await import(pathToFileURL(join(repo,'src/host/native/reading.ts')).href);
const {createGeneratedProducer}=await import(pathToFileURL(join(repo,'src/host/native/generated.ts')).href);
const {startProducerCustodian}=await import(pathToFileURL(join(repo,'src/host/native/generated-custodian.ts')).href);
const dir=mkdtempSync(join(tmpdir(),'ipc-reuse-')),sha=(x)=>'sha256:'+createHash('sha256').update(x).digest('hex'),impl=Buffer.from('Root finite content producer'),d=sha('fixture'),file=join(dir,'original.js'),body='export const n=1;';writeFileSync(file,body);
// Explicit standalone fixture resources, declared before its disposable signed profile.
const parent={identity:d,port:'port/parent',binding:'fixed-job',implementation:d,instrument:d,policy:d,authority:d,inputs:[],environment:[],argv:[],cwd:dir,runtime:process.execPath,timeoutMs:10000,responseBytes:65536};
const profile={profile:'host-generated-executable@3',interpretations:['node-package-json@1'],environmentNames:[],coordinate:'port/generated',implementation:sha(impl),selector:{port:parent.port,binding:parent.binding,implementation:parent.implementation},limits:{members:2,bytes:4096,work:100,argvBytes:16384,argvItems:32}};
const pair=generateKeyPairSync('ed25519'),fields={scope:profile.coordinate,role:'writes',form:'alphabet',measure:'text',value:'lock',about:canonicalJson(profile),epoch:'2',by:'fixture',at:'policy:fixture'},line=canonical({...fields,sig:formatSignature('ed25519:fixture',sign(null,Buffer.from(signedBytes(fields)),pair.privateKey).toString('base64'))});
const root={history:[line],live:[line],signer:{id:'fixture',keyClass:'authorize',publicKey:pair.publicKey.export({type:'spki',format:'der'}).toString('base64'),coverage:['port/**'],depth:{lo:1,hi:16},admittedBy:[]},eras:['ed25519:fixture'],epoch:2,budget:{lines:2,bytes:65536}};
const service=await startProducerCustodian(createGeneratedProducer(root,profile.coordinate,parent,impl),{budget:{members:1,bytes:4096},members:[{path:file,digest:sha(body)}],libraries:[],builtins:[],platform:d},new Set(),dir);
const request={operation:'entry',token:service.endpoint.token,request:{kind:'file',path:file,mode:'module',invocation:{cwd:dir,argv:[],environment:[],runtime:process.execPath,timeoutMs:1000,responseBytes:4096}}};
parentPort.postMessage({endpoint:service.endpoint,request,profile,line,resources:{memoryBytes:32800,inputBytes:16384,outputBytes:16384}});
parentPort.on('message',async message=>{if(message==='close'){await service.close();rmSync(dir,{recursive:true,force:true});parentPort.close();}else if(message==='usage')parentPort.postMessage({usage:service.usage()});});
