import {spawnSync} from 'node:child_process';
import {processOf} from '../observe/runner.ts';
import type {ReaderLifetime} from '@lapxo/topos/wire';

export interface ProcessResult {readonly stdout:string;readonly stdoutBytes?:string;readonly stderr:string;readonly status:number|null;readonly signal:NodeJS.Signals|null;readonly failure?:string}
/** A synchronous fold waits on a supervising host process; the supervisor owns cancellation of its child group. */
export function boundedProcess(command:string,args:readonly string[],input:string,limits:ReaderLifetime,cwd?:string,env?:Readonly<Record<string,string>>):ProcessResult {
 if(!Number.isSafeInteger(limits.timeoutMs)||limits.timeoutMs<=0||!Number.isSafeInteger(limits.responseBytes)||limits.responseBytes<=0)throw Error('REFUSE·reader invalid process limits');
 // The same monotonic deadline covers handoff, input and execution. Starting a
 // fresh timer after stdin closes would leave the handoff outside the policy.
 const deadline=process.hrtime.bigint()+BigInt(limits.timeoutMs)*1000000n;
 const run=spawnSync(process.execPath,[processOf('lifetime','host'),String(deadline),String(limits.responseBytes)],{input:JSON.stringify({command,args,input,limits,cwd,env}),encoding:'utf8',maxBuffer:limits.responseBytes*12+4096});
 if(run.error||run.status!==0)throw Error(`REFUSE·reader lifetime supervisor ${run.error?.message??run.signal??run.status}`);
 const result=JSON.parse(run.stdout) as ProcessResult;
 if(result.failure)throw Error(`REFUSE·reader ${result.failure} · status ${result.status??result.signal??'cancelled'}${result.stderr?' · child stderr: '+result.stderr:''}`);
 return result;
}
