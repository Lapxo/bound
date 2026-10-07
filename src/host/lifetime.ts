import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import type {ReaderLifetime} from '@lapxo/topos/wire';
import type {ProcessResult} from './process-lifetime.ts';

// This is a host mechanism, not a wire reader or a provider. The parent supplies its already selected policy.
const request=JSON.parse(readFileSync(0,'utf8')) as {command:string;args:readonly string[];input:string;cwd?:string;env?:Readonly<Record<string,string>>;limits:ReaderLifetime};
if(!Number.isSafeInteger(request.limits.timeoutMs)||request.limits.timeoutMs<=0||!Number.isSafeInteger(request.limits.responseBytes)||request.limits.responseBytes<=0)throw Error('REFUSE·reader invalid process limits');
const grouped=process.platform!=='win32';
const child=spawn(request.command,[...request.args],{cwd:request.cwd,env:request.env,detached:grouped,stdio:['pipe','pipe','pipe']});
const stdout:Buffer[]=[],stderr:Buffer[]=[];let size=0,failure:string|undefined,finished=false;
const cancel=():void=>{if(child.pid===undefined)return;try{if(grouped)process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{}};
const refuse=(why:string):void=>{failure??=why;cancel();};
const receive=(chunks:Buffer[],bytes:Buffer):void=>{size+=bytes.length;if(size>request.limits.responseBytes){refuse('response exceeds declared byte bound');return;}chunks.push(bytes);};
child.stdout.on('data',(bytes:Buffer)=>receive(stdout,bytes));child.stderr.on('data',(bytes:Buffer)=>receive(stderr,bytes));
child.stdin.on('error',error=>{if(!finished)refuse(`input failed: ${error.message}`);});
const timer=setTimeout(()=>refuse('declared timeout exhausted'),request.limits.timeoutMs);
const finish=(status:number|null,signal:NodeJS.Signals|null):void=>{
 if(finished)return;finished=true;clearTimeout(timer);cancel();
 const result:ProcessResult={stdout:failure?'':Buffer.concat(stdout).toString('utf8'),stdoutBytes:failure?'':Buffer.concat(stdout).toString('base64'),stderr:failure?'':Buffer.concat(stderr).toString('utf8'),status,signal,...(failure?{failure}:{})};
 process.stdout.write(JSON.stringify(result));
};
child.on('error',error=>{failure=error.message;finish(null,null);});child.on('close',finish);
child.stdin.end(request.input);
