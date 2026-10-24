import{test}from'node:test';import assert from'node:assert/strict';import{createSocket}from'node:dgram';import{Resolver}from'node:dns/promises';import{performance}from'node:perf_hooks';import{fetchBytes}from'../dist/host/adapters/transport/http.js';import{BoundRefusal}from'../dist/host/refusals.js';
for(const domain of['archive-records','water-quality'])test(`DNS queries retire at the declared deadline: ${domain}`,async t=>{
 const server=createSocket('udp4');let questions=0;server.on('message',()=>{questions++});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.bind(0,'127.0.0.1',()=>resolve())});
 const cancel=t.mock.method(Resolver.prototype,'cancel'),started=performance.now();
 try{
  await assert.rejects(()=>fetchBytes('https://unanswered.invalid/content',{timeoutMs:50,responseBytes:1024},{dnsServers:['127.0.0.1:'+server.address().port]},'sha256:'+'a'.repeat(64)),error=>error instanceof BoundRefusal&&error.code==='host-port/timeout');
  assert.ok(questions>0);assert.ok(cancel.mock.callCount()>0,'the actual receiver resolver must be cancelled');
  const elapsedMs=performance.now()-started;assert.ok(elapsedMs<500,'retiring DNS cannot wait for an OS resolver retry window');
  console.log(JSON.stringify({domain,node:process.version,questions,cancelCalls:cancel.mock.callCount(),elapsedMs,deadlineMs:50,network:'isolated nonresponding UDP DNS fixture'}));
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
});

import{httpsContent}from'./support/https-content.ts';import{createHash}from'node:crypto';
for(const domain of['archive-records','water-quality'])test(`DNS answers are bound to network permission and the actual HTTPS connection: ${domain}`,async()=>{
 let requests=0;const body='receiver-selected content\n',web=await httpsContent((_request,response)=>{requests++;response.end(body)},'content.test','127.0.0.1'),dns=createSocket('udp4');
 dns.on('message',(query,peer)=>{
  let end=12;while(end<query.length&&query[end]!==0)end+=query[end]+1;end+=5;
  if(end>query.length)return;const question=query.subarray(12,end),type=query.readUInt16BE(end-4),header=Buffer.alloc(12);query.copy(header,0,0,2);header.writeUInt16BE(0x8180,2);header.writeUInt16BE(1,4);header.writeUInt16BE(type===1?1:0,6);
  const answer=type===1?Buffer.from([0xc0,0x0c,0,1,0,1,0,0,0,0,0,4,127,0,0,1]):Buffer.alloc(0);
  dns.send(Buffer.concat([header,question,answer]),peer.port,peer.address);
 });
 await new Promise<void>((resolve,reject)=>{dns.once('error',reject);dns.bind(0,'127.0.0.1',()=>resolve())});
 const options={...web.options,addresses:undefined,dnsServers:['127.0.0.1:'+dns.address().port]},expected='sha256:'+createHash('sha256').update(body).digest('hex');
 try{
  await assert.rejects(()=>fetchBytes(web.origin+'/content',{timeoutMs:1000,responseBytes:4096},{...options,allowAddress:undefined},expected),error=>error instanceof BoundRefusal&&error.code==='reference/transport');assert.equal(requests,0);
  const bytes=await fetchBytes(web.origin+'/content',{timeoutMs:1000,responseBytes:4096},options,expected);assert.equal(Buffer.from(bytes).toString(),body);assert.equal(requests,1);
  console.log(JSON.stringify({domain,node:process.version,resolvedPrivateAddressDeniedByDefault:true,receiverGrantedConnectionVerified:true}));
 }finally{await new Promise<void>(resolve=>dns.close(()=>resolve()));await web.close()}
});
