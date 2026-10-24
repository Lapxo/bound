import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:https';
import {createHash} from 'node:crypto';
import {fetchBytes,publicAddress,type HTTPOptions} from '../dist/host/adapters/transport/http.js';
import {BoundRefusal} from '../dist/host/refusals.js';

const fixture=JSON.parse(readFileSync(new URL('../vectors/contracts/bounded-redirects.json',import.meta.url),'utf8'));
const digest=(value:string)=>'sha256:'+createHash('sha256').update(value).digest('hex');
test('network classification denies equivalent local, private, special and mapped destinations',()=>{
 for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','0.0.0.0','::','::1','fc00::1','fe80::1','::ffff:7f00:1','::ffff:10.0.0.1','2002:7f00:1::','2001:db8::1','3fff::1'])assert.equal(publicAddress(address),false,address);
 for(const address of ['8.8.8.8','::ffff:808:808','2606:4700:4700::1111'])assert.equal(publicAddress(address),true,address);
});
for(const domain of fixture.domains)test(`bounded HTTPS content ${domain}: neutral vectors through the real receiver port`,async()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-content-')),key=join(temp,'key.pem'),cert=join(temp,'cert.pem');
 let server:ReturnType<typeof createServer>|undefined;
 try{
  const certificate=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-keyout',key,'-out',cert],{encoding:'utf8'});assert.equal(certificate.status,0,'fixture certificate creation');
  const body=fixture.policy.fixtureContent;assert.equal(digest(body),fixture.policy.expectedDigest);
  let seen=0;const received:Record<string,string|undefined>[]=[];
  server=createServer({key:readFileSync(key),cert:readFileSync(cert)},(request,response)=>{
   seen++;received.push({authorization:request.headers.authorization,cookie:request.headers.cookie,proxy:request.headers['proxy-authorization'] as string|undefined,secret:request.headers['consumer-secret'] as string|undefined});
   const path=new URL(request.url!,'https://localhost').pathname;
   const redirect=(location:string,content='')=>{response.writeHead(302,{Location:location});response.end(content)};
   if(path==='/redirect')redirect('/direct');
   else if(path==='/relative-location'||path==='/header-projection')redirect('direct');
   else if(path==='/altered-bytes')redirect('/altered');
   else if(path==='/forbidden-destination')redirect('https://127.0.0.2:'+port+'/direct');
   else if(path==='/downgrade')redirect('http://localhost:'+port+'/direct');
   else if(path==='/loop')redirect('/loop');
   else if(path==='/hop-budget')redirect('/hop-budget-2');
   else if(path.startsWith('/hop-budget-')){const n=Number(path.split('-').at(-1));redirect(n<5?'/hop-budget-'+(n+1):'/direct')}
   else if(path==='/total-budget')redirect('/direct','x'.repeat(body.length));
   else if(path==='/cancel'){setTimeout(()=>response.end(body),100).unref()}
   else response.end(path==='/altered'?'altered':body);
  });
  await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(0,'localhost',()=>resolve())});
  const port=(server.address() as {port:number}).port,origin='https://localhost:'+port;
  const grant:HTTPOptions={addresses:[{hostname:'localhost',address:(server.address()as{address:string}).address}],ca:readFileSync(cert),allowAddress:(host,address)=>host==='localhost'&&['127.0.0.1','::1'].includes(address),redirects:{maxRedirects:fixture.policy.maxRedirects,headerBytes:fixture.policy.headerBytes}};
  const results=[];
  for(const c of fixture.cases){
   const trace:unknown[]=[],start=seen,options={...grant,hop:(record:unknown)=>trace.push(record),...(c.id==='header-projection'?{headers:{Authorization:'private',Cookie:'private','Proxy-Authorization':'private','consumer-secret':'private'}}:{})};
   let location=origin+'/'+c.id,expected:string|undefined=fixture.policy.expectedDigest;
   const limits={timeoutMs:fixture.policy.timeoutMs,responseBytes:fixture.policy.responseBytes};
   if(c.id==='no-digest')expected=undefined;
   if(c.id==='total-budget')limits.responseBytes=Buffer.byteLength(body)+1;
   if(c.id==='credential-url')location=origin.replace('https://','https://private:secret@')+'/direct';
   if(c.id==='public-trace')location=origin+'/private-secret-path?secret=value#private-fragment';
   if(c.id==='cancel'){const controller=new AbortController();options.signal=controller.signal;setTimeout(()=>controller.abort(),10).unref()}
   if(c.id==='dns-rebinding'){
    // Fault the observed peer after DNS validation. The connector must reject
    // that mismatch before sending an HTTP request, even under explicit trust.
    const original=https.request;
    https.request=((...args:Parameters<typeof original>)=>{const request=original(...args);request.prependOnceListener('socket',socket=>Object.defineProperty(socket,'remoteAddress',{configurable:true,get:()=> '127.0.0.2'}));return request})as typeof original;
    syncBuiltinESMExports();
    try{await assert.rejects(()=>fetchBytes(origin+'/direct',limits,options,expected),error=>error instanceof BoundRefusal&&error.code==='reference/transport');assert.equal(seen-start,0);results.push({id:c.id,kind:'refuse',code:'reference/transport',peerFaultInjected:true,requests:0});}finally{https.request=original;syncBuiltinESMExports()}
    continue;
   }
   let outcome:{kind:string;code?:string};
   try{const bytes=await fetchBytes(location,limits,options,expected);assert.equal(Buffer.from(bytes).toString(),body);outcome={kind:'fact'}}catch(error){assert.ok(error instanceof BoundRefusal,`${c.id}: ${String(error)}`);outcome={kind:'refuse',code:error.code}}
   assert.equal(outcome.kind,c.expected.kind,c.id);
   if(c.id==='forbidden-destination'||c.id==='downgrade'||c.id==='loop')assert.equal(seen-start,1,c.id+' never connects to its next target');
   if(c.id==='credential-url'||c.id==='no-digest')assert.equal(seen-start,0,c.id+' refuses before connection');
   if(c.id==='altered-bytes')assert.equal(outcome.code,'reference/integrity');
   if(c.id==='cancel')assert.equal(outcome.code,'reference/cancelled');
   assert.doesNotMatch(JSON.stringify(trace),/private|secret|fragment|value|\?/);
   assert.ok(received.every(headers=>Object.values(headers).every(value=>value===undefined)));
   results.push({id:c.id,...outcome,trace,requests:seen-start});
  }
  // Private access and redirection require separate explicit receiver grants.
  await assert.rejects(()=>fetchBytes(origin+'/direct',{timeoutMs:1000,responseBytes:65536},{ca:readFileSync(cert)},fixture.policy.expectedDigest),error=>error instanceof BoundRefusal&&error.code==='reference/transport');
  await assert.rejects(()=>fetchBytes(origin+'/redirect',{timeoutMs:1000,responseBytes:65536},{...grant,redirects:undefined},fixture.policy.expectedDigest),error=>error instanceof BoundRefusal&&error.code==='reference/transport');
  await assert.rejects(()=>fetchBytes(origin+'/redirect',{timeoutMs:1000,responseBytes:65536},{...grant,allowedOrigins:['https://other.invalid']},fixture.policy.expectedDigest),error=>error instanceof BoundRefusal&&error.code==='reference/transport');
  console.log(JSON.stringify({domain,node:process.version,contract:fixture.contract,trust:'explicit fixture CA; receiver grants loopback only',results}));
 }finally{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}rmSync(temp,{recursive:true,force:true})}
});
