import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {canonical,parse} from '@lapxo/topos/wire';
export async function runWalkRefinement(reader,capture,family){
 const temp=mkdtempSync(join(tmpdir(),'bound-refinement-')),captures=[];
 const row=(scope,measure,value,form='alphabet')=>canonical({scope,measure,value,form,role:'writes',at:'policy:sample',by:'target'});
 const base=JSON.parse(readFileSync(new URL('../../samples/walk/yes.json',import.meta.url),'utf8')).declarations.map(v=>row(...v));
 const profile=JSON.parse(readFileSync(new URL('../../samples/walk/refinement.json',import.meta.url),'utf8'));
 const declarations=base.filter(l=>!profile.some(p=>parse(p).value.fields.scope===parse(l).value.fields.scope)).concat(profile);
 const facts=text=>text.split('\n').filter(l=>parse(l).kind==='fact');
 const run=(world,args)=>{const p=spawnSync(process.execPath,[reader,...args],{cwd:world.root,encoding:'utf8',timeout:20000});captures.push({args:args.map(v=>v.endsWith('.pem')?'[ephemeral key]':v),status:p.status,stdout:p.stdout,stderr:p.stderr});assert.equal(p.status,0,p.stderr);return p;};
 const worlds=['left','right'].map(name=>{const root=join(temp,name),pair=generateKeyPairSync('ed25519'),key=join(temp,name+'.pem');mkdirSync(root);writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});return {root,key,name,decl:[...declarations,row('walk/origin','id',name+'-ledger'),row('keys/'+name,'class','authorize'),row('keys/'+name,'coverage','*'),row('keys/'+name,'public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/'+name,'resolution','1..16','interval'),row('keys/'+name,'signer','file'),row('keys/local-reader','class','read')]};});
 const file=(name,lines)=>{const path=join(temp,name+'.bound');writeFileSync(path,lines.join('\n')+'\n');return path;};
 const walk=(world,depth,peer)=>run(world,['fold','--as','walk@'+depth,...peer?[peer]:[],'--key',world.name,'--key-file',world.key]);
 const regions=text=>facts(text).map(l=>parse(l).value.fields).filter(f=>f.scope.startsWith('walk/regions/')&&f.measure==='digest');
 const root=text=>facts(text).map(l=>parse(l).value.fields).find(f=>f.scope==='walk/root').value;
 const payload=text=>facts(text).filter(l=>parse(l).value.fields.scope.startsWith('sample/'));
 try{
  for(const world of worlds){const folded=run(world,['fold',file(world.name+'-context',[...world.decl,row('region/context','reads','keys/**|wire/**|walk/origin')])]);world.pin=/^PIN (\S+)$/m.exec(folded.stdout)[1];world.bytes=folded.stdout.split('\n').filter(l=>l.startsWith('TOPOS ')).map(l=>l.slice(6)).join('\n')+'\n';assert.equal(world.pin,'sha256:'+createHash('sha256').update(world.bytes).digest('hex'));}
  for(const world of worlds){const cas=join(world.root,'.bound','cas','blobs');mkdirSync(cas,{recursive:true});for(const other of worlds)writeFileSync(join(cas,other.pin.split(':')[1]),other.bytes);writeFileSync(join(world.root,'TARGET.bound'),[...world.decl,row('walk/context','digest',world.pin),row('uses/peer','digest',worlds.find(w=>w!==world).pin),canonical({scope:'view/walk',role:'demands',form:'alphabet',measure:'id',value:'walk@*',needs:'sample/**',at:'policy:sample',by:'target'}),canonical({scope:'view/evidence',role:'demands',form:'alphabet',measure:'id',value:'evidence@8',at:'policy:sample',by:'target'})].join('\n')+'\n');run(world,['land','--key',world.name,'--key-file',world.key]);}
  const [left,right]=worlds;
  const scopes=['north/first','south/second','north/third'].map(s=>'sample/'+family+'/'+s);
  run(left,['land',file('initial',scopes.map((s,i)=>row(s,'id','value-'+i))),'--key',left.name,'--key-file',left.key]);
  const peer=file('empty-right',facts(walk(right,0).stdout));
  const coarse=walk(left,0,peer),medium=walk(left,4,peer),fine=walk(left,6,peer);
  assert.equal(regions(coarse.stdout).length,1);assert.equal(regions(medium.stdout).length,2);assert.equal(regions(fine.stdout).length,3);assert.equal(root(coarse.stdout),root(medium.stdout));assert.equal(root(medium.stdout),root(fine.stdout));assert.equal(payload(fine.stdout).length,3);
  console.log('REFINEMENT '+family+' · 1 coarse · 2 intermediate · 3 complete coordinates · same history root');
  const invalid=file('grouped-fragment',[...facts(medium.stdout),...payload(fine.stdout)]);
  const refused=spawnSync(process.execPath,[reader,'land',invalid,'--key',right.name,'--key-file',right.key],{cwd:right.root,encoding:'utf8',timeout:20000});
  captures.push({args:['land','[grouped-fragment]'],status:refused.status,stdout:refused.stdout,stderr:refused.stderr});assert.notEqual(refused.status,0);assert.match(refused.stderr,/REFUSE·walk partial or extra payload|REFUSE·walk region digest or count mismatch/);console.log(refused.stderr.trim());
  const packet=file('payload',facts(fine.stdout));assert.match(run(right,['land',packet,'--key',right.name,'--key-file',right.key]).stdout,/INGRESS 3 new evidence lines/);
  assert.match(run(right,['land',packet]).stdout,/ONCE 0 new evidence lines/);
  const ack=file('fine-ack',facts(walk(right,5).stdout));assert.equal(payload(walk(left,6,ack).stdout).length,0);
  run(left,['land',file('new-coordinate',[row('sample/'+family+'/north/fourth','id','new')]),'--key',left.name,'--key-file',left.key]);
  const next=walk(left,6,ack);assert.equal(regions(next.stdout).length,1);assert.equal(payload(next.stdout).length,1);assert.ok(payload(next.stdout)[0].includes('/north/fourth'));assert.match(next.stdout,/EXCHANGE 1 touched regions · 1 open regions/);
  console.log('REFINEMENT '+family+' · new coordinate opens only itself · verified siblings reused');
  run(right,['land',file('next-payload',facts(next.stdout)),'--key',right.name,'--key-file',right.key]);
  const evidence=run(right,['fold','--as','evidence']);for(const scope of scopes)assert.ok(facts(evidence.stdout).some(l=>parse(l).value.fields.scope===scope));
  const result={family,status:'native CLI refinement passed',captures};if(capture)writeFileSync(capture,JSON.stringify(result,null,2)+'\n');return result;
 }finally{rmSync(temp,{recursive:true,force:true});}
}
