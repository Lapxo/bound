import{AsyncLocalStorage}from'node:async_hooks';
/** A sequence of declared acts is not one act. Unpartitioned host work still has a cost. */
export class ActCosts {
  private readonly began:number;
  private occupied=0;
  private largest=0;
  private depth=0;
  private readonly clock:()=>number;
  constructor(clock:()=>number=()=>performance.now()){this.clock=clock;this.began=clock();}
  begin():()=>void {
    const started=this.clock(),outer=this.depth++===0;let closed=false;
    return()=>{if(closed)throw Error('Act measurement closed twice');closed=true;const elapsed=Math.max(0,this.clock()-started);this.depth--;this.largest=Math.max(this.largest,elapsed);if(outer)this.occupied+=elapsed;};
  }
  measure<T>(work:()=>T):T{const end=this.begin();try{return work();}finally{end();}}
  measurement(){const elapsedMilliseconds=Math.max(0,this.clock()-this.began),unpartitionedMilliseconds=Math.max(0,elapsedMilliseconds-this.occupied);return{elapsedMilliseconds,declaredMilliseconds:this.occupied,largestDeclaredMilliseconds:this.largest,unpartitionedMilliseconds,costMilliseconds:Math.max(this.largest,unpartitionedMilliseconds)}}
  seconds():number{return Math.max(0,Math.round(Math.max(this.largest,this.clock()-this.began-this.occupied)/1000));}
}
const defaultCosts=new ActCosts(),calls=new AsyncLocalStorage<ActCosts>();
/** Persistent receivers own one current act per request. Idle client time and
 * earlier requests never become the cost of a later act. CLI fallback remains
 * one complete invocation; nested declared acts retain the same accounting. */
export function withActCosts<T>(run:()=>T,clock:()=>number=()=>performance.now()):T{return calls.run(new ActCosts(clock),run)}
const current=()=>calls.getStore()??defaultCosts;
export const actCosts={begin:()=>current().begin(),measure<T>(work:()=>T):T{return current().measure(work)},seconds:()=>current().seconds(),measurement:()=>current().measurement()};
