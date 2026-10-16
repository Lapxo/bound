import {generateKeyPairSync,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical} from '@lapxo/topos/wire';
const sha=(s:string)=>'sha256:'+createHash('sha256').update(s).digest('hex');
const row=(scope:string,measure:string,value:string,about?:string)=>canonical({scope,measure,value,form:'alphabet',role:'writes',by:'target',at:'policy:fixture',...(about?{about}:{})});
const cli=new URL('../../src/cli/verb.ts',import.meta.url).pathname;
export interface ActingRootFixtureOptions {readonly fields?:string;readonly families?:string;readonly signaturePrefix?:'wire'|'audit/wire';readonly sourceResources?:{bytes:number;lines:number;places:number;acts:number};readonly extraBootstrapRows?:readonly string[];readonly runLimits?:{timeoutMs:number;maxBytes:number}}
export function actingRootFixture(dataset:string,captures:unknown[]=[],options:ActingRootFixtureOptions={}){
 const temp=mkdtempSync(join(tmpdir(),'bound-acting-root-')),root=join(temp,dataset);mkdirSync(root);
const owner=generateKeyPairSync('ed25519'),lane=generateKeyPairSync('ed25519'),ownerPem=owner.privateKey.export({format:'pem',type:'pkcs8'}).toString(),lanePem=lane.privateKey.export({format:'pem',type:'pkcs8'}).toString();const key=join(temp,'fixture.pem');writeFileSync(key,ownerPem,{mode:0o600});
 for(const place of ['catalog','inventory']){mkdirSync(join(root,place));writeFileSync(join(root,place,'TARGET.bound'),'')}
 const selection={profile:'place-act-context@1',namespace:'.',regionFamily:'region',receiptSigner:'owner',receiptScope:'receipts',digestAlgorithm:'sha256',budget:{bytes:65536,records:64,placements:2,policies:64,proofs:8,signers:8},storageBudget:{acts:32,bytes:131072},initial:['catalog','inventory'].map(p=>({place:p+'/TARGET.bound',receiver:{identity:sha('receiver:'+p),epoch:'1'},origin:{prefix:sha('origin:'+p),epoch:'2'}}))};
 const source={profile:'place-act-context@1',selector:'wire/place-act-context-selection',profileSelector:'wire/place-act-context',bootstrapCheckpoint:{scope:'wire/place-act-context',measure:'id'},resources:options.sourceResources??{bytes:262144,lines:512,places:2,acts:32},inherited:{clock:selection.budget,storage:selection.storageBudget}};
 const signaturePrefix=options.signaturePrefix??'wire';
 const lines=[row(signaturePrefix+'/era','id','sample'),row(signaturePrefix+'/signature-algorithms','id','ed25519:sample'),row(signaturePrefix+'/digest-algorithms','id','sha256')];
 for(const [name,value] of Object.entries({fields:options.fields??'scope|role|form|measure|value|by|at|epoch|sig|about',required:'scope|role|form|measure|value|by|at',forms:'alphabet|interval',roles:'reads|writes|demands','at-classes':'policy|place|origin|witness|receipt',families:options.families??'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region'}))lines.push(row('wire/'+name,'id',value));
 lines.push(row('keys/owner','class','authorize'),row('keys/owner','coverage','*'),row('keys/owner','public-key',owner.publicKey.export({format:'der',type:'spki'}).toString('base64')),row('keys/owner','signer','file'),row('keys/lane','class','attest'),row('keys/lane','coverage','region/catalog/items|region/inventory/items'),row('keys/lane','public-key',lane.publicKey.export({format:'der',type:'spki'}).toString('base64')),row('keys/reader','class','read'),row('keys/folder','class','fold'),row('region/catalog','coordinates','catalog/**'),row('region/inventory','coordinates','inventory/**'),row('wire/act-result','id','local-act@1'),row('wire/act-result-scope','id','receipts'),row('wire/act-result-context','id','receipt:local-act'),row('wire/place-act-context','id','place-act-context@1'),row('wire/place-act-context-selection','text','lock',JSON.stringify(selection)),row('wire/place-act-context-source','text','lock',JSON.stringify(source)));
 for(const name of ['act','standing'])lines.push(canonical({scope:'view/'+name,measure:'id',value:name,role:'demands',form:'alphabet',by:'target',at:'policy:fixture'}));
 for(const [scope,measure,value] of [['keys/owner','resolution','1..16'],['keys/lane','resolution','1..16'],['signer/timeout','milliseconds','5000..5000'],['signer/response-bytes','bytes','65536..65536']])lines.push(canonical({scope:scope!,measure:measure!,value:value!,form:'interval',role:'writes',by:'target',at:'policy:fixture'}));
 if(options.extraBootstrapRows)lines.push(...options.extraBootstrapRows);
 writeFileSync(join(root,'TARGET.bound'),lines.join('\n')+'\n');
 const run=(args:string[])=>{const r=spawnSync(process.execPath,['--experimental-strip-types',cli,...args],{cwd:root,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''},encoding:'utf8',timeout:options.runLimits?.timeoutMs??15000,maxBuffer:options.runLimits?.maxBytes??262144});captures.push({dataset,args:args.map(a=>a.replaceAll(temp,'[fixture]')),status:r.status,stdout:r.stdout,stderr:r.stderr});return r};
 const boot=run(['land','--key','owner','--key-file',key]);if(boot.status!==0)throw Error('fixture Root bootstrap refused '+boot.stderr);
 return{temp,root,owner,lane,ownerPem,lanePem,key,selection,source,run,close:()=>rmSync(temp,{recursive:true,force:true})};
}
