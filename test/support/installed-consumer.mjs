import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
export const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export async function installedConsumer(location=process.env.BOUND_CONSUMER_ROOT){
 // Package self-reference resolves only declared compiled public exports; an explicit consumer may select an installed candidate.
 const require=location?createRequire(join(resolve(location),'package.json')):createRequire(new URL('../../package.json',import.meta.url));
 const packageFile=require.resolve('@lapxo/bound/package.json'),root=resolve(packageFile,'..'),pkg=JSON.parse(readFileSync(packageFile,'utf8'));
 const host=await import(pathToFileURL(require.resolve('@lapxo/bound/host')).href);
 const wire=await import(pathToFileURL(require.resolve('@lapxo/topos/wire')).href);
 const contract=await import(pathToFileURL(require.resolve('@lapxo/topos/contract')).href);
 const forms=await import(pathToFileURL(require.resolve('@lapxo/topos/forms')).href);
 return {require,root,pkg,host,wire,contract,forms};
}
/** Disposable authority; every bootstrap and revision uses the candidate's real CLI. */
export function consumerPlace(candidate,name,extra=[]){
 const {canonical,publicationOf,parse}=candidate.wire;
 const row=(scope,measure,value,more={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',by:'target',at:'policy:consumer',...more});
 const temp=mkdtempSync(join(tmpdir(),'bound-installed-consumer-')),root=join(temp,name),instrument=join(temp,'instrument');mkdirSync(root);mkdirSync(instrument);
 cpSync(join(candidate.root,'dist'),join(instrument,'dist'),{recursive:true});cpSync(join(candidate.root,'vendor'),join(instrument,'vendor'),{recursive:true});cpSync(join(candidate.root,'docs'),join(instrument,'docs'),{recursive:true});
 symlinkSync(join(candidate.root,'node_modules'),join(instrument,'node_modules'),'dir');writeFileSync(join(instrument,'package.json'),'{"type":"module"}\n');
 const grammar=readFileSync(join(candidate.root,'TARGET.bound'),'utf8').split('\n').filter(line=>{const p=parse(line);return p.kind==='fact'&&p.value.fields.scope.startsWith('wire/')&&p.value.fields.measure==='id'});
 // The disposable instrument's grammar is a public projection, with no copied owner store.
 writeFileSync(join(instrument,'TARGET.bound'),publicationOf([...grammar,row('wire/region-leaf','id','leaves'),row('store/vouches','id','tree'),row('store/source','id','write|leaf')]).join('\n')+'\n');
 const pair=generateKeyPairSync('ed25519'),key=join(temp,'fixture.pem');writeFileSync(key,pair.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
 const seed=[row('keys/device','class','authorize'),row('keys/device','coverage','*'),row('keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/device','signer','file'),row('keys/reader','class','read'),row('keys/folder','class','fold'),row('signer/timeout','milliseconds','5000..5000',{form:'interval'}),row('signer/response-bytes','bytes','65536..65536',{form:'interval'}),row('wire/era','id','consumer'),row('wire/signature-algorithms','id','ed25519:consumer'),row('wire/digest-algorithms','id','sha256')];
 for(const [k,v] of Object.entries({families:'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region|reading|physical|port|uses|dep|offers|release',fields:'scope|role|form|measure|value|by|at|epoch|sig|about|shape|needs|restsOn|kind|condition',required:'scope|role|form|measure|value|by|at',forms:'alphabet|interval',roles:'reads|writes|demands','at-classes':'policy|place|origin|witness|receipt|attest','receipt-fields':'scope|role|form|measure|value|by|at'}))seed.push(row('wire/'+k,'id',v));
 seed.push(...extra.map(fields=>typeof fields==='string'?fields:canonical(fields)));writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');
 const captures=[],cli=join(instrument,'dist','cli','verb.js');
 const run=args=>{const p=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''},timeout:30000,maxBuffer:4194304});captures.push({args:args.map(a=>a.replaceAll(temp,'[fixture]')),status:p.status,stdout:p.stdout,stderr:p.stderr});return p;};
 const ok=args=>{const p=run(args);if(p.status!==0)throw Error(p.stderr+p.stdout);return p;};
 const land=(lines,name='proposal')=>{const path=join(temp,name+'.bound');writeFileSync(path,lines.join('\n')+'\n');return run(['land',path,'--key','device','--key-file',key]);};
 const bootstrap=ok(['land','--key','device','--key-file',key]);
 return {temp,root,instrument,cli,row,pair,key,run,ok,land,captures,bootstrap,close:()=>rmSync(temp,{recursive:true,force:true})};
}
