import {spawn} from 'node:child_process';
import type {topos_wire_ReaderLifetime as ReaderLifetime} from "../../vendor/library.js";
import type {ProcessResult} from './process-lifetime.ts';

// Host-selected limits apply before input can arrive; provider output cannot choose them.
type Request = {command:string;args:readonly string[];input:string;cwd?:string;env?:Readonly<Record<string,string>>;limits:ReaderLifetime};
const deadline=BigInt(process.argv[2]??'0'),responseBytes=Number(process.argv[3]);
if(deadline<=0n||!Number.isSafeInteger(responseBytes)||responseBytes<=0)throw Error('REFUSE·reader invalid process limits');
let child:ReturnType<typeof spawn>|undefined,finished=false,failure:string|undefined,size=0;
const stdout:Buffer[]=[],stderr:Buffer[]=[];
const grouped=process.platform!=='win32';
const cancel=()=>{if(child?.pid===undefined)return;try{if(grouped)process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL')}catch{}};
const finish=(status:number|null,signal:NodeJS.Signals|null)=>{
 if(finished)return;finished=true;clearTimeout(timer);cancel();
 child?.stdin?.destroy();child?.stdout?.destroy();child?.stderr?.destroy();process.stdin.destroy();
 const bytes=failure?Buffer.alloc(0):Buffer.concat(stdout);
 const result:ProcessResult={stdout:bytes.toString('utf8'),stdoutBytes:bytes.toString('base64'),stderr:Buffer.concat(stderr).toString('utf8'),status,signal,...(failure?{failure}:{})};
 process.stdout.write(JSON.stringify(result));
};
const refuse=(why:string)=>{if(failure&&why==='response exceeds declared byte bound'&&!failure.includes(why))failure+=' · '+why;else failure??=why;finish(null,'SIGKILL')};
// A closed input pipe can precede the queued stderr/close events of an early
// rejecting child. Cancel immediately, but drain only until the SAME deadline.
const inputFailed=(why:string)=>{if(finished)return;failure??=why;stdout.length=0;cancel();child?.stdin?.destroy();process.stdin.destroy();if(process.hrtime.bigint()>=deadline)finish(null,'SIGKILL');};
const remaining=Number(deadline-process.hrtime.bigint())/1e6;
const timer=setTimeout(()=>refuse('declared timeout exhausted'),Math.max(0,remaining));
process.once('SIGTERM',()=>refuse('interrupted'));
try{
 if(remaining<=0)refuse('declared timeout exhausted');
 const chunks:Buffer[]=[];
 for await(const chunk of process.stdin){if(finished)break;chunks.push(Buffer.from(chunk));}
 if(!finished){
  const request=JSON.parse(Buffer.concat(chunks).toString('utf8')) as Request;
  if(request.limits.responseBytes!==responseBytes||!Number.isSafeInteger(request.limits.timeoutMs)||request.limits.timeoutMs<=0)throw Error('invalid process limits');
  // Parsing is synchronous; recheck before spawning even if the timer has not
  // had a turn to run. An expired handoff must never start the command.
  if(process.hrtime.bigint()>=deadline){refuse('declared timeout exhausted');}
  else {
  child=spawn(request.command,[...request.args],{cwd:request.cwd,env:request.env,detached:grouped,stdio:['pipe','pipe','pipe']});
  const receive=(items:Buffer[],bytes:Buffer)=>{if(finished)return;size+=bytes.length;if(size>responseBytes)refuse('response exceeds declared byte bound');else if(!failure||items===stderr)items.push(bytes)};
  child.stdout!.on('data',(b:Buffer)=>receive(stdout,b));child.stderr!.on('data',(b:Buffer)=>receive(stderr,b));
  child.stdin!.on('error',error=>inputFailed('input failed: '+error.message));
  child.once('error',error=>refuse(error.message));child.once('close',finish);
  child.stdin!.end(request.input);
  }
 }
}catch{if(!finished)refuse('input unavailable or malformed')}
