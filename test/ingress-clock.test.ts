import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {canonical,parse,signedBytes,formatSignature} from '@lapxo/topos/wire';
import {commitIngress} from '../src/host/ports/ingress.ts';

// Host ingress is prepared here; this vector tests the ordinary CLI's local clock,
// not foreign-walk admission or a fabricated native fold observation.
for(const name of ['measurement','artifact'])test(`local signing advances past import receipts, not foreign epochs: ${name}`,async()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-ingress-clock-')),root=join(temp,'place'),pair=generateKeyPairSync('ed25519');
 const key=join(temp,'device.pem'),reader=process.env.BOUND_TEST_READER??new URL('../src/cli/verb.ts',import.meta.url).pathname;
 const row=(scope:string,measure:string,value:string,form='alphabet')=>canonical({scope,measure,value,form,role:'writes',at:'policy:clock',by:'target'});
 const signed=(fields:Record<string,string>)=>canonical({...fields,sig:formatSignature('ed25519:sample',sign(null,Buffer.from(signedBytes(fields)),pair.privateKey).toString('base64'))});
 const run=(args:string[])=>spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:20000});
 try{
  mkdirSync(root);writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  const seed=[['keys/device','class','authorize'],['keys/device','coverage','*'],['keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')],['keys/device','signer','file'],['keys/reader','class','read'],['signer/timeout','milliseconds','5000..5000','interval'],['signer/response-bytes','bytes','65536..65536','interval'],['wire/digest-algorithms','id','sha256'],['wire/signature-algorithms','id','ed25519:sample'],['wire/era','id','sample'],['wire/families','id','keys|signer|wire|tree|write|leaf|reader|read|fold|receipts|rendered|resolved|beat|view|region|sample'],['wire/fields','id','scope|role|form|measure|value|by|at|epoch|sig'],['wire/required','id','scope|role|form|measure|value|by|at'],['wire/forms','id','alphabet|interval'],['wire/roles','id','reads|writes|demands'],['wire/at-classes','id','origin|place|receipt|witness|policy']].map(v=>row(v[0],v[1],v[2],v[3]));
  writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');
  const boot=run(['land','--key','device','--key-file',key]);assert.equal(boot.status,0,boot.stderr);
  const evidence=signed({scope:`sample/${name}`,role:'writes',form:'alphabet',measure:'id',value:'foreign',at:'origin:remote',by:'remote',epoch:'900'});
  const identity='sha256:'+createHash('sha256').update(evidence).digest('hex');
  const receipt=signed({scope:'receipts',role:'writes',form:'alphabet',measure:'digest',value:identity,at:'receipt:import',by:'device',epoch:'2'});
  await commitIngress(join(root,'.bound'),identity,async()=>({evidence:evidence+'\n',receipt:receipt+'\n'}),bundle=>bundle.receipt===receipt+'\n'&&bundle.evidence===evidence+'\n');
  const proposal=join(temp,'local.proposal');writeFileSync(proposal,row('sample/local','id','local')+'\n');
  const next=run(['sign',proposal,'--key','device','--key-file',key]);assert.equal(next.status,0,next.stderr);
  const facts=next.stdout.split('\n').map(parse).filter(p=>p.kind==='fact');assert.equal(facts.length,1);assert.equal(facts[0].value.fields.epoch,'3');
  process.stdout.write('CLOCK foreign 900 unchanged · local import 2 · next local sign 3\n');
  // Corrupting local receipt authentication must prevent further signing.
  writeFileSync(join(root,'.bound','ingress','committed-'+encodeURIComponent(identity),'receipt.bound'),receipt.replace('epoch=2','epoch=8')+'\n');
  const refused=run(['sign',proposal,'--key','device','--key-file',key]);assert.notEqual(refused.status,0);assert.match(refused.stderr,/REFUSE·ingress/);
 }finally{rmSync(temp,{recursive:true,force:true})}
});
