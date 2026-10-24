import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {canonical} from '@lapxo/topos/wire';

/** Published CLI sample: a coordinate is explained by its admitted declarations, not inferred from prose. */
export function runQueryViews(reader,positive,negative) {
 const temp=mkdtempSync(join(tmpdir(),'bound-query-')),events=[];
 const row=(scope,measure,value,extra={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',at:'policy:query',by:'target',...extra});
 try {
  assert.equal(positive.places.length,2);
  for(const place of positive.places) {
   const root=join(temp,place.name);mkdirSync(root);
   const pair=generateKeyPairSync('ed25519'),key=join(temp,place.name+'.pem');
   writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
   const seed=positive.wire.map(([name,value])=>row('wire/'+name,'id',value));
   seed.push(row('keys/device','class','authorize'),row('keys/device','coverage','*'),row('keys/device','public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')),row('keys/device','signer','file'),row('keys/reader','class','read'),row('keys/fold','class','fold'),row('keys/device','resolution','1..16',{form:'interval'}),row('signer/timeout','milliseconds','5000..5000',{form:'interval'}),row('signer/response-bytes','bytes','65536..65536',{form:'interval'}));
   seed.push(row('view/why','id','why',{role:'demands'}),row(place.scope,'id',place.value,{needs:place.coordinate}),row('view/missing','id','not-offered',{role:'demands'}));
   writeFileSync(join(root,place.coordinate),place.content);writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');
   const run=args=>{const start=Date.now(),p=spawnSync(process.execPath,[reader,...args],{cwd:root,encoding:'utf8',timeout:20000});events.push({place:place.name,args:args.map(a=>a===key?'[ephemeral key]':a),status:p.status,stdout:p.stdout,stderr:p.stderr,runtimeMs:Date.now()-start});return p;};
   const boot=run(['land','--key','device','--key-file',key]);assert.equal(boot.status,0,boot.stderr);
   const why=run(['fold',place.coordinate,'--as','why']);assert.equal(why.status,0,why.stderr);assert.ok(why.stdout.includes('WHY      '+place.scope+' · policy:query · '+place.value),why.stdout);
   const absent=run(['fold',negative.absentCoordinate,'--as','why']);assert.equal(absent.status,0,absent.stderr);assert.ok(absent.stdout.includes('OPEN     '+negative.absentCoordinate));assert.doesNotMatch(absent.stdout,/WHY/);
   const missing=run(['fold','--as','missing']);assert.equal(missing.status,1,missing.stderr);assert.match(missing.stderr,/REFUSE·view/);
  }
  return events;
 } finally {rmSync(temp,{recursive:true,force:true});}
}
