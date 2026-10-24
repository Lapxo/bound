import {httpReceiverOptions,withHTTPReceiver,type HTTPReceiverPolicy} from './adapters/transport/http.ts';
import {unsupportedFoldDocument} from '../cli/args.ts';
import{withActCosts}from'./act-cost.ts';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {join,basename,resolve} from 'node:path';
import {nativeHostInstrument} from './native-receiver.ts';
import {withHostCall} from './call-context.ts';
import {withActHost,underTheLock} from '../land/act.ts';
import {storeOf} from '../land/ledger.ts';
import {withNativeSigning} from './signing.ts';
import {BoundRefusal,refusalRecord} from './refusals.ts';
import {readFileSync} from 'node:fs';
import {sha256} from './hash.ts';
import {nativePlaceState} from './native-place-state.ts';
import type {NativeHostLimits,NativeCommand} from './persistent-host.ts';
import type {SigningLot,SignatureRecord} from '../engine/ports.ts';

/** Private transport. All interpretation, signing and admission stay in the
 * native CLI dispatcher. One receiver-selected place and one active request. */
export function serveNativeCommands(dispatch:(argv:readonly string[])=>Promise<number>):void{
 let configured:{place:string;scratch:string;limits:NativeHostLimits;instrumentName:string;instrumentRoot:string;instrumentEntry:string;http?:HTTPReceiverPolicy}|undefined;
 let active:{id:number;abort:AbortController;done:Promise<void>}|undefined,closing=false;
 let signing:{resolve:(value:readonly SignatureRecord[])=>void;reject:(error:Error)=>void}|undefined;
 const send=(message:unknown)=>{if(process.connected)process.send!(message)};
 const stop=()=>{closing=true;active?.abort.abort();signing?.reject(new BoundRefusal('host/cancelled','REFUSE·host/cancelled'));if(!active){if(configured)rmSync(configured.scratch,{recursive:true,force:true});process.removeListener('message',receive);if(process.connected)process.disconnect()}};
 const receive=(message:any)=>{
  if(message?.kind==='configure'&&!configured){
   configured={place:realpathSync(message.place),scratch:realpathSync(message.scratch),limits:message.limits,http:message.http,instrumentName:message.instrumentName,instrumentRoot:realpathSync(message.instrumentRoot),instrumentEntry:realpathSync(process.argv[1]!)};
   send({kind:'ready',pid:process.pid});return;
  }
  if(message?.kind==='close'){stop();return}
  if(message?.kind==='cancel'&&active&&active.id===message.id){active.abort.abort();signing?.reject(new BoundRefusal('host/cancelled','REFUSE·host/cancelled'));return}
  if(message?.kind==='signed'&&active?.id===message.id&&signing){const held=signing;signing=undefined;if(message.error){const code=['host/signer-mismatch','host/unbound-signer'].includes(message.error.code)?message.error.code:'host-port/failed';held.reject(new BoundRefusal(code,'REFUSE·'+code));}else held.resolve(message.records);return}
  if(message?.kind!=='request'||!configured||closing)return;
  if(active){send({kind:'result',id:message.id,status:1,stdout:'',stderr:'REFUSE·host/busy\n'});return}
  const config=configured,abort=new AbortController(),id=message.id;
  const run=async()=>{
   let scratch:string|undefined,stdout='',stderr='',used=0,status=1;
   const output=(stream:'out'|'error',text:string)=>{used+=Buffer.byteLength(text);if(used>config.limits.responseBytes)throw new BoundRefusal('host/budget','REFUSE·host/budget');if(stream==='out')stdout+=text;else stderr+=text};
   try{
    const request=message.command as NativeCommand;
    if(Buffer.byteLength(JSON.stringify(request))>config.limits.requestBytes||!['fold','sign','land'].includes(request.verb)||!Array.isArray(request.args)||request.args.some(x=>typeof x!=='string'))throw new BoundRefusal('host/context','REFUSE·host/context');
    if(request.verb==='fold'&&unsupportedFoldDocument(request.args)&&request.args.some(arg=>arg.startsWith('@input/')&&!(request.inputs??[]).some(input=>input.name===arg.slice(7))))throw new BoundRefusal('host/input','REFUSE·host/input missing document input; select a declared reading with --as');
    if(request.verb==='fold'&&unsupportedFoldDocument(request.args))throw new BoundRefusal('host/document-target','REFUSE·host/document-target select a declared reading with --as');
    const placeState=nativePlaceState(config.place);if(placeState==='birth'&&request.verb!=='land')throw new BoundRefusal('host/foundation-required','REFUSE·host/foundation-required');
    scratch=mkdtempSync(join(config.scratch,'request-'));
    const inputs=new Map<string,string>();
    for(const input of request.inputs??[]){
     if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(input.name)||inputs.has(input.name)||typeof input.text!=='string')throw new BoundRefusal('host/context','REFUSE·host/context');
     const file=join(scratch,input.name);writeFileSync(file,input.text,{mode:0o600,flag:'wx'});inputs.set(input.name,file);
    }
    const args=request.args.map(value=>value.startsWith('@input/')?inputs.get(value.slice(7))??(()=>{throw new BoundRefusal('host/context','REFUSE·host/context')})():value);
    const argv=[request.verb,config.place,...args];
    const acquire=(format:'claims'|'frame')=>async(lot:SigningLot)=>new Promise<readonly SignatureRecord[]>((resolve,reject)=>{signing={resolve,reject};send({kind:'sign',format,id,lot})});
    const signer=message.signer?{...message.signer,signal:abort.signal,sign:acquire('claims'),frame:acquire('frame')}:undefined;
    const runtime=nativeHostInstrument(config.instrumentRoot,config.instrumentEntry).runtime;
    const network=config.http?httpReceiverOptions(config.http):{};
    status=await withHTTPReceiver({...network,signal:abort.signal,hop:record=>output('error',`TRANSPORT ${record.origin} ${record.status} ${record.outcome}\n`)},()=>withHostCall({instrumentName:config.instrumentName,runtime,freshBytes:true,arguments:argv,output},()=>withActHost({name:config.instrumentName,report:text=>output('error',text),signal:abort.signal},()=>withNativeSigning(signer,()=>request.verb==='land'&&placeState==='admitted'?underTheLock(storeOf(config.place),'host land',()=>dispatch(argv)):dispatch(argv)))));
   }catch(error){stderr+=(error instanceof Error?error.message:'REFUSE·host/failed')+'\n';if(error instanceof BoundRefusal){let text='';try{text=readFileSync(new URL('../../docs/contracts/refusals.bound',import.meta.url),'utf8')}catch{}stderr+=JSON.stringify(refusalRecord(error,text,sha256))+'\n'}}
   finally{signing=undefined;if(scratch)rmSync(scratch,{recursive:true,force:true});}
   send({kind:'result',id,status,stdout,stderr});
  };
  const done=Promise.resolve().then(()=>withActCosts(run)).finally(()=>{active=undefined;if(closing)stop()});active={id,abort,done};
 };
 process.on('message',receive);process.once('disconnect',stop);process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
