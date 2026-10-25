import {sha256 as hash} from '../host/hash.ts';
/** Fixed instrument child. Root authority and reading identity arrive through the
 * inherited supervisor argv; request JSON supplies neither verifier nor grant.
 */
import {realpathSync} from 'node:fs';
import {topos_contract_readingIdentityBytes as readingIdentityBytes} from "../../vendor/library.js";
import {readBoundedBatch} from '../host/native/bounded-file.ts';
import {inheritedNativeGuard,inheritedNativeRoot,type NativeRootInheritance} from '../host/native/root.ts';
import {authenticateNativeProfile,loadSignedNativeReading,answerNativeReading} from '../host/native/reading.ts';
import {readingEnvironment,type ReadingExecution} from '../host/reading-context.ts';
import {assertNativeRuntime} from '../host/native/runtime.ts';
import {nativeReferenceInputs} from '../host/native/references.ts';
import type {Handoff} from '../host/native/jobs.ts';
const fail=(why:string):never=>{throw Error('REFUSE·native dispatcher '+why)};
const ordered=(value:readonly (readonly[string,string])[])=>[...value].sort(([a],[b])=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
async function run(){
 const inherited:NativeRootInheritance={store:process.argv[2]!,parent:Number(process.argv[8]),expected:JSON.parse(process.argv[4]!)},coordinate=process.argv[3]!,inputLimit=Number(process.argv[6]),phase=process.argv[7],execution:ReadingExecution=JSON.parse(process.argv[9]!);
 if(phase!=='act')fail('effects forbidden during '+phase);
 if(!Number.isSafeInteger(inputLimit)||inputLimit<1)fail('missing inherited input limit');
 if(!execution?.context||!execution.env||!Array.isArray(execution.flags)||!execution.cwd)fail('missing complete inherited reading identity');
 assertNativeRuntime(process.env,process.execArgv);
 const identity=hash(readingIdentityBytes(execution.context));
 if(JSON.stringify(ordered(readingEnvironment(hash,execution.env,execution.cwd,execution.flags)))!==JSON.stringify(ordered(execution.context.environment)))fail('inherited execution differs from context');
 if(JSON.stringify(ordered(readingEnvironment(hash)))!==JSON.stringify(ordered(execution.context.environment)))fail('actual child environment differs from inherited identity');
 const chunks:Buffer[]=[];let bytes=0;for await(const chunk of process.stdin){const got=Buffer.from(chunk);bytes+=got.length;if(bytes>inputLimit)fail('input bytes exceeded');chunks.push(got)}
 const frame=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 const current=inheritedNativeRoot(inherited,frame.proof),guard=inheritedNativeGuard(inherited,frame.proof),authenticated=authenticateNativeProfile(current,coordinate),profile=authenticated.profile;
 const selected=authenticated.selection;
 if(execution.context.implementation!==profile.selection.archive)fail('reading implementation differs from selected archive');
 if(!Array.isArray(frame.locations)||frame.locations.length!==profile.selection.members.length||frame.locations.length>profile.selection.budget.members)fail('image member budget/count');
 const runtime=frame.locations.find((location:{member:string;path:string})=>location.member===profile.selection.runtime);
 if(!runtime||realpathSync(runtime.path)!==realpathSync(process.execPath))fail('runtime differs from executing interpreter');
 nativeReferenceInputs(execution.context.inputs,profile.selection.members.map(member=>['native/'+member.coordinate,member.digest] as const));
 const imagePaths=profile.selection.members.map(member=>{const rows=frame.locations.filter((location:{member:string;path:string})=>location.member===member.coordinate);if(rows.length!==1)return fail('missing/ambiguous actual member '+member.coordinate);return{path:rows[0].path,coordinate:member.coordinate}});
 const raw=readBoundedBatch([...imagePaths,{path:frame.archive,coordinate:'implementation archive'}],profile.selection.budget.bytes),archive=raw.at(-1)!,members=profile.selection.members.map((member,index)=>({...member,bytes:new Uint8Array(raw[index]!)}));
 if(hash(archive)!==profile.selection.archive)fail('implementation archive differs');
 const handoff:Handoff={place:inherited.expected.namespace,instrument:execution.context.instrument,policy:execution.context.policy,authoritySnapshot:identity,budget:profile.selection.budget,members,bindings:profile.selection.bindings,loads:profile.selection.loads};
 const image={cwd:execution.cwd,locations:frame.locations,runtime:profile.selection.runtime,preload:profile.selection.preload??undefined,nativePreloadMembers:profile.selection.nativePreloadMembers,condition:profile.selection.condition,commandPort:profile.port};
 const handle=await loadSignedNativeReading(selected,{profile,handoff,image,archive},guard);
 const results=await answerNativeReading(handle,frame.requests,profile.selection.reader,{phase:'act',guard});
 process.stdout.write(JSON.stringify(results)+'\n');
}
run().catch(error=>{process.stderr.write((error instanceof Error?error.message:String(error))+'\n');process.exitCode=1});
