import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {release} from 'node:os';
import {readingIdentityBytes} from '@lapxo/topos/contract';
import type {ReadingIdentityContext} from '@lapxo/topos/contract';

export type ReadingReference = readonly [string,string];
export interface ReadingExecution {
 readonly context:ReadingIdentityContext;
 readonly env:Readonly<Record<string,string>>;
 readonly cwd:string;
 readonly flags:readonly string[];
}
interface Boundary {readonly identity:string;readonly execution?:ReadingExecution}
const active=new AsyncLocalStorage<Boundary>();
export const readingBoundary=active.getStore.bind(active);
export function withReadingBoundary<T>(identity:string,execution:ReadingExecution|undefined,run:()=>T):T{
 if(execution){const algorithm=identity.split(':')[0]!;const hash=(text:string)=>algorithm+':'+createHash(algorithm).update(text).digest('hex');
  const expected=readingEnvironment(hash,execution.env,execution.cwd,execution.flags);
  const named=[...execution.context.environment].sort(([a],[b])=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
  if(JSON.stringify([...expected].sort(([a],[b])=>Buffer.compare(Buffer.from(a),Buffer.from(b))))!==JSON.stringify(named))throw Error('REFUSE·reading execution environment differs from its identity');
 }
 return active.run({identity,execution},run);
}

/** References commit the actual inherited boundary. Values are hashed, never
 * carried as environment secrets. No empty map is substituted for unknown input. */
// The running runtime is resolved once for this act; mutable input bytes are not
// stored in this slot. Later processes establish their own runtime reference.
const runtimes=new Map<string,string>();
const runtimeOf=(algorithm:string):string=>{const held=runtimes.get(algorithm);if(held)return held;const digest=algorithm+':'+createHash(algorithm).update(readFileSync(process.execPath)).digest('hex');runtimes.set(algorithm,digest);return digest;};
export function readingEnvironment(hash:(text:string)=>string,env:Readonly<Record<string,string|undefined>>=process.env,cwd=process.cwd(),flags:readonly string[]=process.execArgv):readonly ReadingReference[]{
 const inherited=Object.entries(env).filter((entry):entry is [string,string]=>entry[1]!==undefined);
 return [
  ['variables',hash(JSON.stringify(inherited.sort(([a],[b])=>Buffer.compare(Buffer.from(a),Buffer.from(b)))))],
  ['cwd',hash(realpathSync(cwd))],['flags',hash(JSON.stringify(flags))],
  ['runtime',runtimeOf(hash('').split(':')[0]!)],
  ['platform',hash(JSON.stringify([process.platform,process.arch,process.versions,release()]))],
 ];
}

export function readingProfile(lines:readonly string[],field:(line:string,name:string)=>string):boolean{
 const values=(scope:string)=>lines.filter(line=>field(line,'scope')===scope&&field(line,'role')==='writes'&&field(line,'value')!=='withdraw');
 const contexts=values('wire/reading-context'),receipts=values('wire/reading-receipt');
 if(!contexts.length&&!receipts.length)return false;
 if(contexts.length!==1||receipts.length!==1||field(contexts[0]!,'value')!=='reading-context@1'||field(receipts[0]!,'value')!=='reading-receipt@1')throw Error('REFUSE·reading identity ambiguous or incomplete profiles');
 return true;
}

/** The caller supplies verified implementation and transitive references. This
 * constructor adds the process boundary that the host will actually hand over. */
export function readingExecution(input:{instrument:string;implementation:string;policy:string;inputs:readonly ReadingReference[]},hash:(text:string)=>string,boundary:{env:Readonly<Record<string,string|undefined>>;cwd:string;flags:readonly string[]}={env:process.env,cwd:process.cwd(),flags:process.execArgv}):ReadingExecution{
 const env=Object.fromEntries(Object.entries(boundary.env).filter((entry):entry is [string,string]=>entry[1]!==undefined));
 const cwd=boundary.cwd,flags=Object.freeze([...boundary.flags]);Object.freeze(env);
 const context={...input,environment:readingEnvironment(hash,env,cwd,flags)};
 readingIdentityBytes(context);
 return {context,env,cwd,flags};
}
