/** Receiver-selected network permission is independent of content integrity. */
import {AsyncLocalStorage} from 'node:async_hooks';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {Resolver} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import {sha256,isSha256} from '../../hash.ts';
import {BoundRefusal} from '../../refusals.ts';
export class ContentUnavailable extends Error {}
export interface HTTPHop{readonly origin:string;readonly status:number;readonly outcome:'redirect'|'content'}
export interface HTTPOptions{
 readonly signal?:AbortSignal;
 readonly allowedOrigins?:readonly string[];
 /** Receiver-selected hostname bindings; address permission is still checked. */
 readonly addresses?:readonly {readonly hostname:string;readonly address:string}[];
 /** Receiver-selected DNS servers, with request-scoped cancellation. */
 readonly dnsServers?:readonly string[];
 /** Explicit private-address exception; never read from a carrier. */
 readonly allowAddress?:(hostname:string,address:string,family:4|6)=>boolean;
 readonly redirects?:{readonly maxRedirects:number;readonly headerBytes:number};
 readonly ca?:string|Buffer;
 readonly hop?:(record:HTTPHop)=>void;
}
/** Receiver data crosses a host boundary; a command cannot offer capabilities. */
export interface HTTPReceiverPolicy{
 readonly origins:readonly string[];
 readonly dnsServers?:readonly string[];
 /** Explicit hostname/address bindings, including permission to reach those internal addresses. */
 readonly internalDestinations?:readonly {readonly hostname:string;readonly address:string}[];
 readonly redirects?:{readonly maxRedirects:number;readonly headerBytes:number};
 readonly ca?:string;
}
const receiverHTTP=new AsyncLocalStorage<HTTPOptions>();
export function httpReceiverOptions(policy:HTTPReceiverPolicy):HTTPOptions{
 if(!policy||!Array.isArray(policy.origins)||!policy.origins.length||policy.origins.some(origin=>{try{const u=new URL(origin);return u.origin!==origin||u.protocol!=='https:'}catch{return true}})
  ||(policy.ca!==undefined&&typeof policy.ca!=='string')
  ||(policy.internalDestinations!==undefined&&(!Array.isArray(policy.internalDestinations)||policy.internalDestinations.some(one=>!one||typeof one.hostname!=='string'||!isIP(one.address))))
  ||(policy.redirects&&(!Number.isSafeInteger(policy.redirects.maxRedirects)||policy.redirects.maxRedirects<0||!Number.isSafeInteger(policy.redirects.headerBytes)||policy.redirects.headerBytes<1)))throw new BoundRefusal('reference/transport','REFUSE·invalid receiver network policy');
 if(policy.dnsServers!==undefined){if(!Array.isArray(policy.dnsServers)||!policy.dnsServers.length||policy.dnsServers.some(server=>typeof server!=='string'))throw new BoundRefusal('reference/transport','REFUSE·invalid receiver DNS policy');try{const resolver=new Resolver();resolver.setServers([...policy.dnsServers]);resolver.cancel()}catch{throw new BoundRefusal('reference/transport','REFUSE·invalid receiver DNS policy')}}
 const held=structuredClone(policy);
 return {allowedOrigins:held.origins,ca:held.ca,redirects:held.redirects,addresses:held.internalDestinations,dnsServers:held.dnsServers,allowAddress:(hostname,address)=>held.internalDestinations?.some(one=>one.hostname===hostname&&one.address===address)===true};
}
export const withHTTPReceiver=<T>(options:HTTPOptions,body:()=>T):T=>receiverHTTP.run(options,body);
const denied=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]] as const)denied.addSubnet(address,prefix,'ipv4');
denied.addSubnet('2001:db8::',32,'ipv6');
denied.addSubnet('2001::',23,'ipv6'); // Special-purpose address space, including transition mechanisms.
denied.addSubnet('2002::',16,'ipv6');
denied.addSubnet('3fff::',20,'ipv6');
const global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');
const mapped4=new BlockList();mapped4.addSubnet('::ffff:0:0',96,'ipv6');
/** Equivalent IPv4-mapped IPv6 encodings use the same IPv4 exclusions. */
export function publicAddress(address:string):boolean{
 const family=isIP(address);
 return family===4?!denied.check(address,'ipv4'):family===6&&(mapped4.check(address,'ipv6')?!denied.check(address,'ipv6'):global6.check(address,'ipv6')&&!denied.check(address,'ipv6'));
}
/** Each request owns its DNS queries. Cancellation retires them before return;
 * no detached getaddrinfo work accumulates in a persistent host. */
async function resolveAddresses(hostname:string,signal:AbortSignal,options:HTTPOptions,timeoutMs:number):Promise<readonly {address:string;family:number}[]>{
 if(isIP(hostname))return[{address:hostname,family:isIP(hostname)}];
 const bound=options.addresses?.filter(one=>one.hostname===hostname);
 if(bound?.length){if(bound.some(one=>!isIP(one.address)))throw refusal('invalid receiver address binding');return bound.map(one=>({address:one.address,family:isIP(one.address)}))}
 // RFC 6761 local names cannot become public destinations through DNS.
 if(/(^|\.)localhost\.?$/i.test(hostname))throw refusal('local name requires an explicit receiver binding');
 const resolver=new Resolver({timeout:timeoutMs,tries:1});
 if(options.dnsServers)resolver.setServers([...options.dnsServers]);
 const cancel=()=>resolver.cancel();signal.addEventListener('abort',cancel,{once:true});
 try{
  if(signal.aborted)throw signal.reason;
  const answers=await Promise.allSettled([resolver.resolve4(hostname),resolver.resolve6(hostname)]);
  return answers.flatMap((answer,index)=>answer.status==='fulfilled'?answer.value.map(address=>({address,family:index===0?4:6})):[]);
 }finally{signal.removeEventListener('abort',cancel);resolver.cancel()}
}
const headerBytes=(raw:readonly string[])=>raw.reduce((sum,part)=>sum+Buffer.byteLength(part),0)+raw.length*2;
const refusal=(reason:string)=>new BoundRefusal('reference/transport',`REFUSE·transport ${reason}`);
export async function fetchBytes(location:string,limits:{readonly timeoutMs:number;readonly responseBytes:number},options:HTTPOptions={},expectedDigest?:string):Promise<Uint8Array>{
 const receiver=receiverHTTP.getStore();
 const requestedSignal=options.signal;
 options={...receiver,...options,signal:receiver?.signal?(requestedSignal?AbortSignal.any([receiver.signal,requestedSignal]):receiver.signal):requestedSignal};
 const policy=options.redirects;
 if(!Number.isSafeInteger(limits.timeoutMs)||limits.timeoutMs<=0||limits.timeoutMs>2147483647||!Number.isSafeInteger(limits.responseBytes)||limits.responseBytes<0
   ||(policy&&(!Number.isSafeInteger(policy.maxRedirects)||policy.maxRedirects<0||!Number.isSafeInteger(policy.headerBytes)||policy.headerBytes<=0)))throw refusal('invalid receiver budget');
 if(policy&&!isSha256(expectedDigest))throw refusal('redirects require a supported expected digest');
 const timeout=AbortSignal.timeout(limits.timeoutMs),signal=options.signal?AbortSignal.any([timeout,options.signal]):timeout;
 const interrupted=()=>new BoundRefusal(options.signal?.aborted?'reference/cancelled':'host-port/timeout','REFUSE·reference transport interrupted');
 const checkSignal=()=>{if(signal.aborted)throw interrupted()};
 const headerLimit=policy?.headerBytes??16384;
 let current:URL;try{current=new URL(location)}catch{throw refusal('invalid URL')}
 const seen=new Set<string>();let transferred=0,headers=0,redirects=0;
 try{for(;;){
  checkSignal();
  if(!['https:','http:'].includes(current.protocol)||(policy&&current.protocol!=='https:'))throw refusal('scheme or downgrade denied');
  if(current.username||current.password)throw refusal('URL credentials denied');
  if(options.allowedOrigins&&!options.allowedOrigins.includes(current.origin))throw refusal('origin denied');
  current.hash='';if(seen.has(current.href))throw refusal('redirect loop');seen.add(current.href);
  const hostname=current.hostname.replace(/^\[|\]$/g,'');
  // Resolve once; bind the verified address to this connection, not to a later resolver call.
  const resolved=await resolveAddresses(hostname,signal,options,limits.timeoutMs);
  checkSignal();
  if(!resolved.length)throw new ContentUnavailable('content destination unavailable');
  for(const entry of resolved){const family=entry.family as 4|6;if(![4,6].includes(family)||(!publicAddress(entry.address)&&options.allowAddress?.(hostname,entry.address,family)!==true))throw refusal('destination denied');}
  const selected=resolved[0]!;
  const result=await new Promise<{status:number;location?:string;bytes:Uint8Array}>((resolve,reject)=>{
   const request=(current.protocol==='https:'?httpsRequest:httpRequest)(current,{
    method:'GET',agent:false,signal,ca:options.ca,rejectUnauthorized:true,maxHeaderSize:headerLimit,
    headers:{Accept:'application/octet-stream','Accept-Encoding':'identity'},
    lookup:(_name,opts,done)=>{if(opts.all)done(null,[{address:selected.address,family:selected.family}]);else done(null,selected.address,selected.family);}
   },response=>{
    const status=response.statusCode??0;
    headers+=headerBytes(response.rawHeaders)+Buffer.byteLength(response.statusMessage??'')+17;
    if(headers>headerLimit){response.destroy();reject(new BoundRefusal('host-port/budget','REFUSE·transport chain header budget'));return;}
    const chunks:Buffer[]=[];
    response.on('data',(part:Buffer)=>{transferred+=part.length;if(transferred>limits.responseBytes){response.destroy(new BoundRefusal('host-port/budget','REFUSE·transport chain byte budget'));return;}chunks.push(part);});
    response.on('end',()=>{headers+=headerBytes(response.rawTrailers);if(headers>headerLimit){reject(new BoundRefusal('host-port/budget','REFUSE·transport chain header budget'));return;}resolve({status,location:response.headers.location,bytes:Buffer.concat(chunks)});});
    response.on('error',reject);
   });
   request.on('socket',socket=>socket.prependOnceListener(current.protocol==='https:'?'secureConnect':'connect',()=>{const peer=socket.remoteAddress,expected=new BlockList();expected.addAddress(selected.address,selected.family===6?'ipv6':'ipv4');if(!peer||!isIP(peer)||!expected.check(peer,isIP(peer)===6?'ipv6':'ipv4'))request.destroy(refusal('connected address differs from receiver-validated DNS'));}));
   request.on('information',info=>{headers+=headerBytes(info.rawHeaders)+Buffer.byteLength(info.statusMessage??'')+17;if(headers>headerLimit)request.destroy(new BoundRefusal('host-port/budget','REFUSE·transport chain header budget'));});
   request.on('error',reject);request.end();
  });
  checkSignal();
  if(result.status>=300&&result.status<400){
   if(!policy||!expectedDigest)throw refusal('redirect not admitted');
   if(![301,302,303,307,308].includes(result.status)||!result.location)throw refusal('invalid redirect');
   if(redirects++>=policy.maxRedirects)throw refusal('redirect hop budget');
   options.hop?.({origin:current.origin,status:result.status,outcome:'redirect'});
   try{current=new URL(result.location,current)}catch{throw refusal('invalid redirect location')}
   continue;
  }
  if(result.status<200||result.status>=300)throw new ContentUnavailable(`HTTP ${result.status}`);
  if(expectedDigest&&sha256(result.bytes)!==expectedDigest)throw new BoundRefusal('reference/integrity','REFUSE·transport digest mismatch');
  options.hop?.({origin:current.origin,status:result.status,outcome:'content'});
  return result.bytes;
 }}catch(error){
  if(signal.aborted)throw interrupted();
  if(error instanceof BoundRefusal||error instanceof ContentUnavailable)throw error;
  // Network errors can contain a full URL. Keep public diagnostics bounded and secret-free.
  throw new ContentUnavailable('content connection unavailable');
 }
}
