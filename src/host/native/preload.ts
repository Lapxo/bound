/** Fixed instrument preload. FD3 is an instrument-created execution envelope,
 * never world stdin or workerData. It introduces no key or command grant.
 */
import {readSync,closeSync} from 'node:fs';
import {realpathSync} from 'node:fs';
import {installDescendantBoundary} from './descendants.ts';
import {installBoundary,installNativeResolutionReuse,type Declaration} from './loader.ts';
const fail=(why:string):never=>{throw Error('REFUSE·native preload '+why)};
const limit=Number(new URL(import.meta.url).searchParams.get('bytes'));
if(!Number.isSafeInteger(limit)||limit<1)fail('missing admitted envelope resources');
const header=Buffer.alloc(8);let read=0;while(read<header.length){const n=readSync(3,header,read,header.length-read,null);if(!n)fail('truncated host frame');read+=n}
const size=header.readBigUInt64BE();if(size>BigInt(limit))fail('host envelope bytes exceeded');
const raw=Buffer.alloc(Number(size));read=0;while(read<raw.length){const n=readSync(3,raw,read,raw.length-read,null);if(!n)fail('truncated host envelope');read+=n}
if(readSync(3,Buffer.alloc(1),0,1,null)!==0)fail('host envelope has trailing bytes');closeSync(3);
const frame=JSON.parse(raw.toString('utf8')) as {format:string;entries:readonly string[];declaration:Declaration;descendant?:any;execution?:{runtime:string;cwd:string;mounts:readonly {coordinate:string;path:string;kind:string}[]}};
if(frame.format!=='native-image-envelope/1'||!Array.isArray(frame.entries)||!frame.entries.includes(realpathSync(process.argv[1]!)))fail('entry outside host image');
if(frame.descendant)installDescendantBoundary(frame.descendant);
installNativeResolutionReuse(frame.declaration);
if(frame.execution){const facade=Object.freeze({...frame.execution,preload:frame.descendant?.custodian?.preload,mounts:Object.freeze(frame.execution.mounts.map(mount=>Object.freeze({...mount})))});Object.defineProperty(globalThis,Symbol.for('bound.native.execution@1'),{value:facade,writable:false,configurable:false});}
const boundary=installBoundary({...frame.declaration,entry:realpathSync(process.argv[1]!)});
process.once('beforeExit',()=>boundary.assertClosed());
