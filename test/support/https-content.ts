import{createServer}from'node:https';
import type{RequestListener}from'node:http';
import{mkdtempSync,readFileSync,rmSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';import{spawnSync}from'node:child_process';
import type{HTTPOptions,HTTPReceiverPolicy}from'../../dist/host/adapters/transport/http.js';
/** Isolated HTTPS with explicit fixture trust; no ambient TLS settings. */
export async function httpsContent(listener:RequestListener,hostname='localhost',bind='localhost'){
 const temp=mkdtempSync(join(tmpdir(),'bound-https-')),key=join(temp,'key.pem'),cert=join(temp,'cert.pem');
 let server:ReturnType<typeof createServer>|undefined;
 try{
  const result=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN='+hostname,'-addext','subjectAltName=DNS:'+hostname,'-keyout',key,'-out',cert],{encoding:'utf8'});if(result.status!==0)throw Error('Fixture trust creation failed');
  server=createServer({key:readFileSync(key),cert:readFileSync(cert)},listener);
  await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(0,bind,()=>resolve())});
  const origin='https://'+hostname+':'+(server.address()as{port:number}).port,ca=readFileSync(cert,'utf8');
  const addresses=[{hostname,address:(server.address()as{address:string}).address}];
  const options:HTTPOptions={ca,addresses,allowAddress:(hostname,address)=>hostname===new URL(origin).hostname&&['127.0.0.1','::1'].includes(address)};
  const policy:HTTPReceiverPolicy={origins:[origin],ca,internalDestinations:addresses,redirects:{maxRedirects:3,headerBytes:32768}};
  return{origin,options,policy,close:async()=>{server!.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));rmSync(temp,{recursive:true,force:true})}};
 }catch(error){if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}rmSync(temp,{recursive:true,force:true});throw error}
}
