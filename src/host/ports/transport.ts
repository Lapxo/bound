import {readFileSync} from 'node:fs';
import {contentRequest,transportSelection,parse} from '@lapxo/topos/wire';
import {boundedProcess} from '../process-lifetime.ts';
import {fetchBytes} from '../adapters/transport/http.ts';

export async function transportBytes(location:string,digest:string,lines:readonly string[]):Promise<Uint8Array> {
 const scheme=new URL(location).protocol.slice(0,-1);
 const fields=lines.flatMap(line=>{const p=parse(line);return p.kind==='fact'?[p.value.fields]:[];});
 const selected=transportSelection(fields,scheme);
 if(selected===undefined)throw Error(`REFUSE·transport ${scheme} no admitted content-request/1 policy`);
 if(selected.name==='fetch'){
  if(!['http','https'].includes(scheme))throw Error(`REFUSE·transport ${scheme} is not supported by this host adapter`);
  return fetchBytes(location,selected);
 }
 const registryPath=process.env['BOUND_TRANSPORTS'];
 if(!registryPath)throw Error(`REFUSE·transport ${scheme} no host binding for ${selected.name}`);
 let record:{executable:string;args:readonly string[];env:Readonly<Record<string,string>>};
 try{
  const registry:unknown=JSON.parse(readFileSync(registryPath,'utf8'));
  if(!registry||typeof registry!=='object'||!Object.prototype.hasOwnProperty.call(registry,selected.name))throw Error();
  const value=(registry as Record<string,unknown>)[selected.name];if(!value||typeof value!=='object')throw Error();
  const f=value as Record<string,unknown>;
  if(f.kind!=='command'||typeof f.executable!=='string'||!f.executable||!Array.isArray(f.args)||!f.args.every(x=>typeof x==='string'))throw Error();
  if(f.environment!==undefined&&(!Array.isArray(f.environment)||!f.environment.every(x=>typeof x==='string')))throw Error();
  const names=(f.environment??[]) as string[];
  const env:Record<string,string>={};
  if(process.env.PATH!==undefined)env.PATH=process.env.PATH;
  for(const name of names)if(process.env[name]!==undefined)env[name]=process.env[name]!;
  record={executable:f.executable,args:f.args,env};
 }catch{throw Error(`REFUSE·transport ${scheme} host binding unavailable or invalid`);}
 const result=boundedProcess(record.executable,record.args,contentRequest(location,digest,selected),selected,undefined,record.env);
 if(result.status!==0||result.signal!==null)throw Error(`REFUSE·transport ${scheme} failed · status ${result.status??result.signal}`);
 return Buffer.from(result.stdoutBytes??'','base64');
}
