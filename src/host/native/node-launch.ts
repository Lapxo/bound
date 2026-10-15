/** Parse the actual Node launch without rewriting argv or evaluating text.
 * Selection/authority and generated-member sealing belong to the Root host.
 * This is a deliberately finite native profile, not a JS sandbox. */
export type NodeLaunch =
 | {kind:'eval';mode:'commonjs'|'module';text:string;args:readonly string[];imports:readonly string[]}
 | {kind:'file';entry:string;args:readonly string[];imports:readonly string[];test:boolean};
const refuse:(why:string)=>never=(why:string)=>{throw Error('REFUSE·native descendant '+why)};
export function nodeLaunch(args:readonly string[]):NodeLaunch{
 if(!Array.isArray(args)||args.some(s=>typeof s!=='string'||s.includes('\0')))refuse('argv invalid');
 let mode:'commonjs'|'module'='commonjs',evalText:string|undefined,entry:string|undefined,test=false;
 const imports:string[]=[];
 for(let i=0;i<args.length;i++){
  const arg=args[i]!;
  if(arg==='--'){entry=args[++i];break;}
  if(arg==='--input-type=module'){mode='module';continue;}
  if(arg==='--input-type=commonjs'){mode='commonjs';continue;}
  if(arg==='--input-type'){const value=args[++i];if(value!=='module'&&value!=='commonjs')refuse('input type unsupported');mode=value;continue;}
  if(arg==='-e'||arg==='--eval'){if(evalText!==undefined)refuse('eval ambiguous');evalText=args[++i];if(evalText===undefined)refuse('eval absent');continue;}
  if(arg.startsWith('--eval=')){if(evalText!==undefined)refuse('eval ambiguous');evalText=arg.slice(7);continue;}
  if(arg==='--import'||arg==='--require'||arg==='-r'){const value=args[++i];if(value===undefined)refuse('preload absent');imports.push(value);continue;}
  if(arg.startsWith('--import=')||arg.startsWith('--require=')){imports.push(arg.slice(arg.indexOf('=')+1));continue;}
  if(arg==='--test'){test=true;continue;}
  if(arg.startsWith('--test-')||arg==='--experimental-strip-types'||arg==='--experimental-transform-types')continue;
  if(arg.startsWith('-'))refuse('option unsupported '+arg);
  if(evalText!==undefined)break;
  entry=arg;break;
 }
 if(evalText!==undefined){if(entry!==undefined)refuse('eval plus executable file');return{kind:'eval',mode,text:evalText,args:[...args],imports};}
 if(!entry)refuse(test?'implicit test discovery unsupported':'executable target absent');
 return{kind:'file',entry,args:[...args],imports,test};
}

/** Pure host glue. Inputs are projections obtained from verified opaque native
 * program handles under Root's guard, never accepted from a world proposal.
 * Selection names preserve argv; they confer no independent authority. */
import {isAbsolute,resolve} from 'node:path';
import {isSha256} from '../hash.ts';
import type {NativeProgramProjection} from './native-program.ts';
const programFail:(why:string)=>never=(why:string)=>{throw Error('REFUSE·native launch '+why)};
const digest=isSha256;
const exactPath=(value:unknown):value is string=>typeof value==='string'&&isAbsolute(value)&&resolve(value)===value;
export interface SelectedInterpreter {readonly path:string;readonly digest:string}
export interface NativeProgramLaunch {readonly interpreter:string;readonly interpreterDigest:string;readonly entry:string;readonly args:readonly string[]}
function graph(program:NativeProgramProjection):void {
 if(!program||typeof program.alias!=='string'||!program.alias.length||!exactPath(program.interpreter)||!digest(program.interpreterDigest)||!exactPath(program.entry)||!exactPath(program.root)||!Array.isArray(program.members))programFail('verified program projection absent');
 const paths=new Set<string>();for(const member of program.members){if(!member||!exactPath(member.path)||!digest(member.digest)||paths.has(member.path))programFail('program graph member ambiguous');paths.add(member.path)}
 if(!paths.has(program.entry))programFail('program entry not in selected graph');
}
/** Only an exact, unique declared alias selects a native program. No PATH,
 * filename heuristics, option rewriting or consumer-specific names occur here. */
export function projectNativeProgramLaunch(programs:readonly NativeProgramProjection[],program:string,args:readonly string[],runtime:SelectedInterpreter):NativeProgramLaunch {
 if(!Array.isArray(programs)||typeof program!=='string'||!program.length||!Array.isArray(args)||args.some(arg=>typeof arg!=='string'||arg.includes('\0'))||!runtime||!exactPath(runtime.path)||!digest(runtime.digest))programFail('invocation context absent');
 const matches=programs.filter(p=>p?.alias===program);if(matches.length!==1)programFail(matches.length?'program alias ambiguous '+program:'program alias undeclared '+program);const selected=matches[0]!;graph(selected);
 if(selected.interpreter!==runtime.path||selected.interpreterDigest!==runtime.digest)programFail('selected interpreter differs');
 return Object.freeze({interpreter:selected.interpreter,interpreterDigest:selected.interpreterDigest,entry:selected.entry,args:Object.freeze([...args])});
}
export interface NativeProgramParent {readonly parent:string;readonly root:string;readonly members:readonly {readonly path:string;readonly digest:string}[]}
/** Select a package-resolution context only for the exact reached parent member.
 * Root must validate the supplied parent digest against actual bytes first.
 * Node still performs actual resolution; Root checks the returned target digest
 * before handing it back. Merely sharing a path prefix grants no membership. */
export function selectNativeProgramParent(programs:readonly NativeProgramProjection[],parent:{readonly path:string;readonly digest:string}):NativeProgramParent {
 if(!Array.isArray(programs)||!parent||!exactPath(parent.path)||!digest(parent.digest))programFail('parent content context absent');
 const matches=programs.filter(p=>Array.isArray(p?.members)&&p.members.some((m:{path:string;digest:string})=>m?.path===parent.path&&m.digest===parent.digest));if(matches.length!==1)programFail(matches.length?'parent graph ambiguous':'parent not in selected graph');const selected=matches[0]!;graph(selected);
 return Object.freeze({parent:parent.path,root:selected.root,members:Object.freeze(selected.members.map((member:{path:string;digest:string})=>Object.freeze({...member})))});
}

/** The fixed host receives this record only from the actual Root custodian's
 * retained before-fork evidence. This projection grants no new executable. */
export interface NativeEvalActual {readonly argv:readonly string[];readonly rootPrefix:readonly string[];readonly cwd:string;readonly environment:readonly (readonly [string,string])[];readonly runtime:string}
export interface NativeEvalParent {readonly url:string;readonly context:string;readonly digest:string;readonly mode:'module'|'commonjs'}
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {canonicalJson} from './reading.ts';
import type {DerivedExecutable} from './generated.ts';
export function retainedNativeEvalMatches(record:DerivedExecutable,actual:NativeEvalActual):boolean{
 if(!record||record.kind!=='derived-executable/1'||record.target?.kind!=='eval'||!actual||!Array.isArray(actual.argv)||!Array.isArray(actual.rootPrefix)||!exactPath(actual.cwd)||!exactPath(actual.runtime)||!Array.isArray(actual.environment))return false;
 if(actual.rootPrefix.some((arg,i)=>actual.argv[i]!==arg)||canonicalJson(actual.argv)!==canonicalJson(record.target.argv)||actual.cwd!==record.target.cwd||actual.cwd!==record.invocation.cwd||actual.runtime!==record.invocation.runtime||canonicalJson(actual.environment)!==canonicalJson(record.invocation.environment)||canonicalJson(actual.argv.slice(actual.rootPrefix.length))!==canonicalJson(record.invocation.argv))return false;
 let launch:NodeLaunch;try{launch=nodeLaunch(actual.argv)}catch{return false}
 if(launch.kind!=='eval'||launch.text!==record.target.text||launch.mode!==record.mode)return false;
 const bytes=Buffer.from(launch.text,'utf8');return bytes.toString('utf8')===launch.text&&bytes.length===record.byteLength&&'sha256:'+createHash('sha256').update(bytes).digest('hex')===record.digest;
}
/** Exact Node CLI eval origin, not a file-pattern exception. A different URL
 * continues through ordinary physical-parent verification and refuses if absent.
 * Node's module and CommonJS CLI forms have distinct observed synthetic names. */
export function nativeEvalParent(record:DerivedExecutable,actual:NativeEvalActual):NativeEvalParent{
 if(!retainedNativeEvalMatches(record,actual))programFail('actual eval differs from Root-retained context');
 return Object.freeze({url:record.mode==='module'?pathToFileURL(actual.cwd+'/').href+'[eval1]':pathToFileURL(resolve(actual.cwd,'[eval]')).href,context:record.identity,digest:record.digest,mode:record.mode});
}

/** Non-authoritative discovery from Node's actual runtime options only. A false
 * result confers no permission: physical-parent/load checks remain unchanged.
 * Before-fork argv validation and exact retained-record matching are separate. */
export function actualNodeEvalOptions(execArgv:readonly string[]):boolean{try{return nodeLaunch(execArgv).kind==='eval'}catch{return false}}
