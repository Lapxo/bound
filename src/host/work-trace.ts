import{AsyncLocalStorage}from'node:async_hooks';
interface Span{readonly id:number;readonly parent:number;readonly name:string;readonly start:number;end?:number}
interface Trace{readonly clock:()=>number;readonly spans:Span[];truncated:boolean}
interface Scope{readonly trace:Trace;readonly parent:number}
const active=new AsyncLocalStorage<Scope>();
const LIMIT=10000;
export function traceWork<T>(name:string,run:()=>T):T{
 const scope=active.getStore();if(!scope)return run();
 const{trace,parent}=scope;if(trace.spans.length>=LIMIT){trace.truncated=true;return run();}
 const span:Span={id:trace.spans.length,parent,name,start:trace.clock()};trace.spans.push(span);
 const close=()=>{span.end=trace.clock()};
 return active.run({trace,parent:span.id},()=>{try{const result=run();if(result&&typeof(result as {then?:unknown}).then==='function')return Promise.resolve(result).finally(close) as T;close();return result}catch(error){close();throw error}});
}
/** Exclusive elapsed buckets partition the command, including work between
 * named spans. Inclusive spans are diagnostic only and must not be added. */
export function workReport(spans:readonly Span[],end:number,truncated=false){
 const root=spans[0]!,events=spans.flatMap(span=>[{time:span.start,id:span.id,start:true},{time:span.end??end,id:span.id,start:false}]).sort((a,b)=>a.time-b.time||Number(a.start)-Number(b.start)),live=new Set<number>(),exclusive=new Map<string,number>(),depths=spans.map(span=>{let n=0,p=span.parent;while(p>=0){n++;p=spans[p]!.parent}return n});let previous=root.start;
 for(const event of events){const at=Math.min(end,Math.max(root.start,event.time));if(at>previous){let chosen=0;for(const id of live)if(depths[id]!>depths[chosen]!||(depths[id]===depths[chosen]&&id>chosen))chosen=id;const name=spans[chosen]!.name;exclusive.set(name,(exclusive.get(name)??0)+at-previous);previous=at}if(event.start)live.add(event.id);else live.delete(event.id)}
 const phases=[...exclusive].map(([name,milliseconds])=>({name,milliseconds}));return{profile:'bound-work-trace@1',clock:'performance.now monotonic milliseconds',totalMilliseconds:end-root.start,exclusiveMilliseconds:phases.reduce((n,p)=>n+p.milliseconds,0),phases,inclusive:spans.map(span=>({name:span.name,milliseconds:(span.end??end)-span.start})),complete:!truncated};
}
export async function withWorkTrace<T>(run:()=>T|Promise<T>,emit:(report:ReturnType<typeof workReport>)=>void,clock:()=>number=()=>performance.now()):Promise<T>{
 if(active.getStore())return run();const root:Span={id:0,parent:-1,name:'command/dispatch',start:clock()},trace:Trace={clock,spans:[root],truncated:false};
 try{return await active.run({trace,parent:0},run)}finally{root.end=clock();emit(workReport(trace.spans,root.end,trace.truncated))}
}
