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
  seconds():number{return Math.max(0,Math.round(Math.max(this.largest,this.clock()-this.began-this.occupied)/1000));}
}
export const actCosts=new ActCosts();
