import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical,parse} from '@lapxo/topos/wire';
import {runTypedSample} from './run-typed.mjs';

/** Authenticated typed history stays origin-qualified evidence; it grants no receiver authority. */
export function runTypedWalkSample(reader,capture,sample='yes.json') {
 const events=[];
 const facts=text=>text.split('\n').filter(l=>parse(l).kind==='fact');
 const row=(scope,measure,value,extra={})=>canonical({scope,measure,value,role:'writes',form:'alphabet',at:'policy:typed-walk',by:'target',...extra});
 try {return runTypedSample(reader,undefined,sample,({root,place:sender,seed,pin,closure,yes,key})=>{
  const receiver=join(root,'receiver');mkdirSync(receiver);
  const pair=generateKeyPairSync('ed25519'),receiverKey=join(root,'receiver.pem');writeFileSync(receiverKey,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  const run=(place,args)=>{const p=spawnSync(process.execPath,[reader,...args],{cwd:place,encoding:'utf8',timeout:30000});events.push({args:args.map(a=>a.startsWith(root)?'<fixture>/'+a.slice(root.length+1):a),status:p.status,stdout:p.stdout,stderr:p.stderr});return p;};
  const ok=(place,args)=>{const p=run(place,args);assert.equal(p.status,0,p.stderr||p.stdout);return p;};
  const doc=(name,lines)=>{const f=join(root,name+'.bound');writeFileSync(f,lines.join('\n')+'\n');return f;};
  const selected=JSON.parse(readFileSync(new URL('../../samples/walk/yes.json',import.meta.url),'utf8')).declarations.map(([scope,measure,value])=>row(scope,measure,value)).filter(l=>parse(l).value.fields.scope.startsWith('wire/walk/'));
  const config=seed.filter(l=>parse(l).value.fields.scope!=='wire/families');
  const families=row('wire/families','id','B|C|D|G|keys|signer|wire|tree|write|leaf|reader|read|fold|receipts|rendered|resolved|beat|view|region|evidence|uses|walk');
  const contexts=[['sender',seed],['receiver',config.map(l=>{const f=parse(l).value.fields;return f.scope==='keys/device'&&f.measure==='public-key'?canonical({...f,value:pair.publicKey.export({type:'spki',format:'der'}).toString('base64')}):l;})]].map(([name,rows])=>{
   const declarations=[row('keys/device','resolution','1..16',{form:'interval'}),...rows.filter(l=>!parse(l).value.fields.scope.startsWith('view/')),...selected.map(l=>{const f=parse(l).value.fields;return f.scope==='wire/walk/fields'?canonical({...f,value:[...new Set([...f.value.split('|'),...parse(seed.find(l=>parse(l).value.fields.scope==='wire/fields')).value.fields.value.split('|')])].filter(k=>k!=='sig').sort().join('|')}):l;}),row('walk/origin','id',name+'-typed-ledger'),row('region/context','reads','keys/**|wire/**|walk/origin|uses/**')];
   const folded=ok(receiver,['fold',doc(name+'-context',declarations)]),digest=/^PIN (\S+)$/m.exec(folded.stdout)?.[1];assert.ok(digest);
   const bytes=folded.stdout.split('\n').filter(l=>l.startsWith('TOPOS ')).map(l=>l.slice(6)).join('\n')+'\n';assert.equal('sha256:'+createHash('sha256').update(bytes).digest('hex'),digest);
   return {name,digest,bytes,declarations};
  });
  for(const place of [sender,receiver]){
   const cas=join(place,'.bound/cas/blobs');mkdirSync(cas,{recursive:true});
   for(const c of contexts)writeFileSync(join(cas,c.digest.split(':')[1]),c.bytes);
   for(const [d,b] of closure.blobs)writeFileSync(join(cas,d.split(':')[1]),b);
   writeFileSync(join(cas,pin.split(':')[1]),readFileSync(join(sender,'.bound/cas/blobs',pin.split(':')[1])));
  }
  const additions=c=>[...c.declarations.filter(l=>parse(l).value.fields.scope.startsWith('wire/walk/')),row('keys/device','resolution','1..16',{form:'interval'}),families,row('walk/context','digest',c.digest),row('uses/peer','digest',contexts.find(o=>o!==c).digest),row('view/walk','id','walk@*',{role:'demands',needs:'B|C|D|G|evidence/**'}),row('view/evidence','id','evidence@8',{role:'demands'})];
  ok(sender,['land',doc('sender-walk',additions(contexts[0])),'--key','device','--key-file',key]);
  writeFileSync(join(receiver,'TARGET.bound'),[...config.map(l=>{const f=parse(l).value.fields;return f.scope==='keys/device'&&f.measure==='public-key'?canonical({...f,value:pair.publicKey.export({type:'spki',format:'der'}).toString('base64')}):l;}),...additions(contexts[1])].join('\n')+'\n');
  ok(receiver,['land','--key','device','--key-file',receiverKey]);
  const cell={...yes.cells.find(c=>c.scope==='C'),type:'cell',id:'receiver-definition',restsOn:'none',form:yes.form,measure:yes.measure,params:JSON.stringify(yes.params),topos:pin,by:'target'};
  ok(receiver,['land',doc('receiver-cell',[canonical(cell)]),'--key','device','--key-file',receiverKey]);
  ok(receiver,['land',doc('receiver-claim',[canonical({type:'claim',scope:'C',id:'c-C',sign:'+1',origin:'ana',value:yes.acts.find(a=>a.id==='c-C').value,by:'target'})]),'--key','device','--key-file',receiverKey]);
  const baseline=ok(receiver,['fold','--as','cells']);
  const peer=doc('peer-inventory',facts(ok(receiver,['fold','--as','walk@0','--key','device','--key-file',receiverKey]).stdout));
  const packet=doc('typed-history',facts(ok(sender,['fold','--as','walk@8',peer,'--key','device','--key-file',key]).stdout));
  const incoming=ok(receiver,['land',packet,'--key','device','--key-file',receiverKey]);assert.match(incoming.stdout,/INGRESS \d+ new evidence lines · 1 signed local import receipt/);
  const retained=ok(receiver,['fold','--as','evidence']);assert.ok(facts(retained.stdout).some(l=>{const f=parse(l).value.fields;return f.type==='claim'&&f.takes==='c-C'&&f.sign==='-1'}));
  const after=ok(receiver,['fold','--as','cells']);const cells=p=>p.stdout.split('\n').filter(l=>l.startsWith('CELL ')).join('\n');assert.equal(cells(after),cells(baseline),'foreign withdrawal cannot take a local ID');assert.match(after.stdout,/0 opened.*idle.*provider 0/);
  assert.ok(JSON.parse(after.stdout.split('\n').find(l=>l.startsWith('CELL ')).slice(5)).ownClaims.some(c=>c.id==='c-C'));
  const hash=()=>readdirSync(join(receiver,'.bound/ledger')).map(n=>[n,createHash('sha256').update(readFileSync(join(receiver,'.bound/ledger',n))).digest('hex')]);const before=hash();assert.match(ok(receiver,['land',packet]).stdout,/ONCE 0 new evidence lines/);assert.deepEqual(hash(),before);
  if(capture)writeFileSync(capture,JSON.stringify({contract:'foreign typed evidence, not cross-origin object reconstruction',events},null,2)+'\n');
  console.log('TYPED WALK '+sample+' · foreign exact withdrawal retained · local ID live · receipts idle · replay ONCE');
 });} finally {if(capture)writeFileSync(capture,JSON.stringify({contract:'foreign typed evidence, not cross-origin object reconstruction',events},null,2)+'\n');}
}
