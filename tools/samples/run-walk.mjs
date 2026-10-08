import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import {canonical,parse,signedBytes,formatSignature} from '@lapxo/topos/wire';
import {walkSelection,walkSnapshot,walkAt,walkHeaders,readWalkHeaders} from '@lapxo/topos/walk';

export async function runWalkSample(reader, capture, family='measurement', profile) {
 const temp=mkdtempSync(join(tmpdir(),'bound-native-walk-')),captures=[];
 const row=(scope,measure,value,form='alphabet')=>canonical({scope,measure,value,form,role:'writes',at:'policy:walk-fixture',by:'target'});
 const base=(profile??JSON.parse(readFileSync(new URL('../../samples/walk/yes.json',import.meta.url),'utf8'))).declarations.map(v=>row(v[0],v[1],v[2],v[3]));
 const facts=(text)=>text.split('\n').filter(line=>parse(line).kind==='fact');
 const run=(root,args)=>{const p=spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:20000});captures.push({args:args.map(a=>a.endsWith('.pem')?'[ephemeral key]':a),status:p.status,stdout:p.stdout,stderr:p.stderr});return p;};
 const passed=(root,args)=>{const p=run(root,args);assert.equal(p.status,0,p.stderr);return p;};
 const worlds=['left','right'].map(name=>{
  const root=join(temp,name),pair=generateKeyPairSync('ed25519'),key=join(temp,name+'.pem');mkdirSync(root);writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  const declarations=[...base,row('walk/origin','id',name+'-ledger'),row('keys/'+name,'class','authorize'),row('keys/'+name,'coverage','*'),row('keys/'+name,'public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/'+name,'resolution','1..16','interval'),row('keys/'+name,'signer','file'),row('keys/local-reader','class','read')];
  const file=join(temp,name+'-context.bound');writeFileSync(file,[...declarations,row('region/context','reads','keys/**|wire/**|walk/origin')].join('\n')+'\n');
  const conflict=join(temp,name+'-conflicting-wire.bound');
  writeFileSync(conflict,[...declarations,row('wire/fields','id','scope|value'),row('region/context','reads','keys/**|wire/**|walk/origin')].join('\n')+'\n');
  const ambiguity=run(root,['fold',conflict]);assert.notEqual(ambiguity.status,0);assert.match(ambiguity.stderr,/REFUSE·document wire\/fields writes id · target has two live inscriptions without withdrawal/);
  const folded=passed(root,['fold',file]),pin=/^PIN (\S+)$/m.exec(folded.stdout)?.[1];assert.ok(pin);
  const bytes=folded.stdout.split('\n').filter(line=>line.startsWith('TOPOS ')).map(line=>line.slice(6)).join('\n')+'\n';assert.equal('sha256:'+createHash('sha256').update(bytes).digest('hex'),pin);
  return {name,root,key,declarations,pin,bytes,pair};
 });
 const document=(name,lines)=>{const file=join(temp,name+'.bound');writeFileSync(file,lines.join('\n')+'\n');return file;};
 const snapshot=(root)=>{
  const visit=(at)=>readdirSync(at,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(d=>d.isDirectory()?visit(join(at,d.name)):[join(at,d.name)+':'+createHash('sha256').update(readFileSync(join(at,d.name))).digest('hex')]);
  return visit(root);
 };
 try{
  for(const world of worlds){
   const cas=join(world.root,'.bound','cas','blobs');mkdirSync(cas,{recursive:true});for(const origin of worlds)writeFileSync(join(cas,origin.pin.split(':')[1]),origin.bytes);
   const seed=[...world.declarations,row('walk/context','digest',world.pin),row('uses/peer','digest',worlds.find(w=>w!==world).pin),canonical({scope:'view/walk',role:'demands',form:'alphabet',measure:'id',value:'walk@*',needs:'sample/**',at:'policy:walk-fixture',by:'target'}),canonical({scope:'view/evidence',role:'demands',form:'alphabet',measure:'id',value:'evidence@8',at:'policy:walk-fixture',by:'target'})];
   if(world.name==='right')seed.push(row('keys/importer','class','authorize'),row('keys/importer','coverage','receipts'),row('keys/importer','public-key',world.pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/importer','resolution','1..16','interval'),row('keys/importer','signer','waiting-command'));
   writeFileSync(join(world.root,'TARGET.bound'),seed.join('\n')+'\n');passed(world.root,['land','--key',world.name,'--key-file',world.key]);
  }
  const [left,right]=worlds;
  const inventory=(world,depth,file)=>passed(world.root,['fold','--as','walk@'+depth,...file?[file]:[],'--key',world.name,'--key-file',world.key]);
  const equalLeft=inventory(left,0),equalRight=inventory(right,0);assert.equal(facts(equalLeft.stdout).find(l=>l.includes('scope=walk/root'))?.match(/value=(\S+)/)?.[1],facts(equalRight.stdout).find(l=>l.includes('scope=walk/root'))?.match(/value=(\S+)/)?.[1]);
  for(const world of worlds){const lot=document(world.name+'-local',[row('sample/'+family,'id',world.name)]);passed(world.root,['land',lot,'--key',world.name,'--key-file',world.key]);}
  const remoteInventory=document('right-inventory',facts(inventory(right,0).stdout));
  const summary=inventory(left,1,remoteInventory);assert.ok(!facts(summary.stdout).some(l=>l.includes('scope=sample/')));
  const intermediate=inventory(left,4,remoteInventory);assert.ok(!facts(intermediate.stdout).some(l=>l.includes('scope=sample/')));
  const detailed=inventory(left,6,remoteInventory);assert.ok(facts(detailed.stdout).some(l=>l.includes('scope=sample/')));
  const packet=inventory(left,8,remoteInventory);assert.match(packet.stdout,/EXCHANGE 1 touched regions · 1 open regions · \d+ payload bytes/);
  const offered=facts(packet.stdout),file=document('left-payload',offered),before=snapshot(right.root);
  const altered=document('altered',offered.map(l=>l.replace('value=left','value=altered')));const bad=run(right.root,['land',altered,'--key',right.name,'--key-file',right.key]);assert.notEqual(bad.status,0);assert.match(bad.stderr,/REFUSE·walk/);assert.deepEqual(snapshot(right.root),before);
  const resign=(world,fields)=>{const {sig,...body}=fields;return canonical({...body,sig:formatSignature('ed25519:sample',sign(null,Buffer.from(signedBytes(body)),world.pair.privateKey).toString('base64'))})};
  const refuses=(name,lines,reason)=>{const unchanged=snapshot(right.root),p=run(right.root,['land',document(name,lines),'--key',right.name,'--key-file',right.key]);assert.notEqual(p.status,0);assert.match(p.stderr,reason);assert.deepEqual(snapshot(right.root),unchanged,name+' must admit nothing')};
  refuses('partial-payload',offered.filter(l=>!l.includes('scope=sample/')),/REFUSE·walk/);
  refuses('outside-prefix',offered.map(l=>l.includes('scope=sample/')?resign(left,{...parse(l).value.fields,epoch:'99'}):l),/REFUSE·walk foreign epoch is outside the authenticated prefix/);
  refuses('unauthorized-prefix',offered.map(l=>l.includes('scope=walk/')?resign(left,{...parse(l).value.fields,by:'outsider'}):l),/REFUSE·walk/);
  refuses('stale-base',offered.map(l=>l.includes('scope=walk\/root')?resign(left,{...parse(l).value.fields,condition:'sha256:'+('0'.repeat(64))}):l),/REFUSE·walk stale receiver base/);
  const untouched=snapshot(left.root),unsupported=run(left.root,['fold','--as','walk@2','--key',left.name,'--key-file',left.key]);assert.notEqual(unsupported.status,0);assert.match(unsupported.stderr,/REFUSE·walk/);assert.deepEqual(snapshot(left.root),untouched);
  const landed=passed(right.root,['land',file,'--key',right.name,'--key-file',right.key]);assert.match(landed.stdout,/INGRESS 1 new evidence lines · 1 signed local import receipt/);assert.match(landed.stdout,/EXCHANGE \d+ payload bytes · \d+ protocol bytes · \d+ new evidence bytes · \d+ new receipt bytes/);
  const receipt=facts(landed.stdout).find(l=>l.includes('scope=receipts'));assert.ok(receipt);assert.match(receipt,/epoch=3/);
  const replayBefore=snapshot(right.root),replay=passed(right.root,['land',file]);assert.match(replay.stdout,/ONCE 0 new evidence lines · 1 retained import receipt/);assert.deepEqual(snapshot(right.root),replayBefore);
  const prefixFields=parse(left.declarations.find(l=>l.includes('scope=wire/walk/fields'))).value.fields.value.split('|');
  const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
  const packetFor=(history,cut)=>{
   const peerHeaders=facts(inventory(right,0).stdout),peerRoot=peerHeaders.find(l=>l.includes('scope=walk/root')),peer=readWalkHeaders(peerHeaders,right.pin,parse(peerRoot).value.fields.condition,()=>true);
   const selected=walkAt(walkSnapshot(history,prefixFields,digest,left.name+'-ledger'),peer,8,walkSelection(left.declarations).projections);
   return [...walkHeaders(selected,left.pin,peer.root,true).map(l=>resign(left,{...parse(l).value.fields,by:left.name,epoch:String(cut)})),...selected.records];
  };
  const original=offered.find(l=>l.includes('scope=sample/'));
  refuses('missing-earlier-prefix',packetFor([resign(left,{...parse(original).value.fields,epoch:'3',value:'replaced'})],3),/REFUSE·walk foreign history is not an extension of its verified prefix/);
  refuses('inserted-at-verified-epoch',packetFor([original,resign(left,{...parse(original).value.fields,scope:'sample/extra',epoch:'2'})],3),/REFUSE·walk foreign epoch does not match the verified prefix/);
  const acknowledged=document('right-acknowledged',facts(inventory(right,0).stdout));
  const noPayload=inventory(left,8,acknowledged);assert.match(noPayload.stdout,/EXCHANGE 0 touched regions · 0 open regions · 0 payload bytes/);
  const none=document('no-payload',facts(noPayload.stdout)),idleBefore=snapshot(right.root),idle=passed(right.root,['land',none]);assert.match(idle.stdout,/ONCE 0 new evidence lines · 0 import receipts/);assert.deepEqual(snapshot(right.root),idleBefore);
  const leftInventory=document('left-inventory',facts(inventory(left,0).stdout)),rightPayload=document('right-payload',facts(inventory(right,8,leftInventory).stdout));
  passed(left.root,['land',rightPayload,'--key',left.name,'--key-file',left.key]);
  const bothLeft=inventory(left,0),bothRight=inventory(right,0),rootValue=text=>facts(text).find(l=>l.includes('scope=walk/root'))?.match(/value=(\S+)/)?.[1];
  assert.equal(rootValue(bothLeft.stdout),rootValue(bothRight.stdout),'two heads retain both origin prefixes and converge by the wire');
  const evidence=passed(right.root,['fold','--as','evidence']);assert.ok(facts(evidence.stdout).some(l=>l.includes('scope=sample/'+family)&&l.includes('value=left')&&l.includes('epoch=2')));assert.ok(facts(evidence.stdout).some(l=>l.includes('scope=sample/'+family)&&l.includes('value=right')));
  const local=document('next-local',[row('sample/after','id','local')]),signed=passed(right.root,['sign',local,'--key',right.name,'--key-file',right.key]);assert.match(signed.stdout,/epoch=4/);
  const changed=passed(right.root,['land',local,'--key',right.name,'--key-file',right.key]);assert.match(changed.stdout,/epoch 4/);
  const historicalReplay=snapshot(right.root);assert.match(passed(right.root,['land',file]).stdout,/ONCE 0 new evidence lines/);assert.deepEqual(snapshot(right.root),historicalReplay,'a valid old delivery stays idempotent after a local change');
  assert.ok(!readFileSync(join(right.root,'.bound','ledger',right.name+'.bound'),'utf8').includes('by=left'),'foreign keys/history never enter local owner ledger');
  const alternate=document('alternate-origin-context',[...left.declarations,row('wire/walk/profile','id','alternate'),row('region/context','reads','keys/**|wire/**|walk/origin')]),alternateFold=passed(right.root,['fold',alternate]);
  const alternatePin=/^PIN (\S+)$/m.exec(alternateFold.stdout)[1],alternateBytes=alternateFold.stdout.split('\n').filter(l=>l.startsWith('TOPOS ')).map(l=>l.slice(6)).join('\n')+'\n';
  assert.equal(digest(alternateBytes),alternatePin);writeFileSync(join(right.root,'.bound','cas','blobs',alternatePin.split(':')[1]),alternateBytes);
  passed(right.root,['land',document('select-alternate',[row('uses/alternate','digest',alternatePin)]),'--key',right.name,'--key-file',right.key]);
  refuses('undeclared-context-lineage',offered.map(l=>l.includes('scope=walk/')?resign(left,{...parse(l).value.fields,at:'receipt:'+alternatePin}):l),/REFUSE·walk origin context changed without declared lineage/);
  const extended=document('new-left-local',[row('sample/new','id','next')]);passed(left.root,['land',extended,'--key',left.name,'--key-file',left.key]);
  const finalPeer=document('right-final-inventory',facts(inventory(right,0).stdout)),interruptionFile=document('interruption-payload',facts(inventory(left,8,finalPeer).stdout));
  // Interrupt a real CLI while its declared receiver signer is still preparing the receipt.
  const waiting=join(temp,'waiting-signer.mjs'),marker=join(temp,'signer-ready'),registry=join(temp,'host-signers.json');
  writeFileSync(waiting,"import {writeFileSync} from 'node:fs'; process.stdin.resume(); process.stdin.on('end',()=>{writeFileSync(process.argv[2],'ready');setInterval(()=>{},1000)});\n");
  writeFileSync(registry,JSON.stringify({'waiting-command':{kind:'command',executable:process.execPath,args:[waiting,marker]}}));
  const ingressBefore=snapshot(join(right.root,'.bound','ingress')),ledgerBefore=snapshot(join(right.root,'.bound','ledger')),lockBefore=readFileSync(join(right.root,'TARGET.bound'),'utf8');
  const interrupted=spawn(process.execPath,[reader,'land',interruptionFile,'--key','importer'],{cwd:right.root,env:{...process.env,BOUND_SIGNERS:registry},detached:true,stdio:['ignore','pipe','pipe']});
  let interruptedOut='',interruptedErr='';interrupted.stdout.on('data',b=>interruptedOut+=b);interrupted.stderr.on('data',b=>interruptedErr+=b);
  const completion=new Promise(resolve=>interrupted.on('close',(status,signal)=>resolve({status,signal})));
  try {
   const until=Date.now()+4000;while(Date.now()<until&&!readdirSync(temp).includes('signer-ready'))await new Promise(resolve=>setTimeout(resolve,10));
   assert.ok(readdirSync(temp).includes('signer-ready'),'real receiver signer must be invoked before interruption');
  } finally {try{process.kill(-interrupted.pid,'SIGKILL')}catch{}}
  const interruptedStatus=await completion;captures.push({args:['land','<walk-payload>','--key','importer'],...interruptedStatus,stdout:interruptedOut,stderr:interruptedErr});
  assert.equal(interruptedStatus.signal,'SIGKILL');assert.deepEqual(snapshot(join(right.root,'.bound','ledger')),ledgerBefore);assert.equal(readFileSync(join(right.root,'TARGET.bound'),'utf8'),lockBefore);
  assert.deepEqual(snapshot(join(right.root,'.bound','ingress')),ingressBefore,'interrupted ingress adds neither evidence nor receipt');
  const stale=run(right.root,['land',interruptionFile,'--key',right.name,'--key-file',right.key]);assert.notEqual(stale.status,0);assert.match(stale.stderr,/REFUSE·stale .*host recovery required/);assert.deepEqual(snapshot(join(right.root,'.bound','ingress')),ingressBefore);

  return captures;
 }finally{if(capture)writeFileSync(capture+'.'+family+'.json',JSON.stringify(captures,null,2)+'\n');rmSync(temp,{recursive:true,force:true})}
}
