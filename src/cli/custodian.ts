/** Fixed sync-to-async transport executable. It never resets producer counters
 * or grants. Its stdin budget comes from the fixed host argv before reading.
 */
import {createConnection} from 'node:net';
import {scheduleDeadline} from '../host/native/deadline.ts';
const cap=Number(process.argv[2]);if(!Number.isSafeInteger(cap)||cap<1)throw Error('REFUSE·producer sync client input resources');
const chunks:Buffer[]=[];let size=0;for await(const chunk of process.stdin){const raw=Buffer.from(chunk);size+=raw.length;if(size>cap)throw Error('REFUSE·producer sync client input bytes');chunks.push(raw)}
const {endpoint,frame}=JSON.parse(Buffer.concat(chunks).toString('utf8'));
if(!endpoint||typeof endpoint.socket!=='string'||!Number.isSafeInteger(endpoint.timeoutMs)||endpoint.timeoutMs<1||!Number.isSafeInteger(endpoint.responseBytes)||endpoint.responseBytes<1||typeof frame!=='string'||Buffer.byteLength(frame)>endpoint.responseBytes)throw Error('REFUSE·producer sync client binding');
const socket=createConnection(endpoint.socket),remaining=Math.max(1,Math.min(endpoint.timeoutMs,endpoint.deadlineMs-Date.now())),cancel=scheduleDeadline(process.hrtime.bigint()+BigInt(remaining)*1_000_000n,()=>socket.destroy(Error('REFUSE·producer IPC timeout')));let bytes=0;
socket.once('connect',()=>socket.write(frame+'\n'));socket.on('data',chunk=>{bytes+=chunk.length;if(bytes>endpoint.responseBytes)socket.destroy(Error('REFUSE·producer IPC response bytes'));else process.stdout.write(chunk)});socket.once('error',error=>{process.stderr.write(error.message);process.exitCode=1});socket.once('close',cancel);
