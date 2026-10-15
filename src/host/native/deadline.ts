const TIMER_MAX_MS=2_147_483_647;
/** Remaining monotonic lease, rounded up for host APIs that accept milliseconds. */
export function remainingDeadlineMs(deadline:bigint):number {
 return Math.max(0,Number((deadline-process.hrtime.bigint()+999_999n)/1_000_000n));
}
interface Clock {
 readonly now:()=>bigint;
 readonly schedule:(callback:()=>void,delayMs:number)=>unknown;
 readonly cancel:(handle:unknown)=>void;
}
const native:Clock={now:()=>process.hrtime.bigint(),schedule:(callback,delay)=>setTimeout(callback,delay),cancel:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>)};
/** The admitted deadline is never clamped to the platform timer range. Each
 * timer is merely a wake-up slice; expiry checks the original monotonic clock.
 * Injected clock exists only for deterministic platform-boundary vectors. */
export function scheduleDeadline(deadline:bigint,expire:()=>void,clock:Clock=native):()=>void {
 let active=true,handle:unknown;
 const arm=()=>{
  if(!active)return;
  const remaining=deadline-clock.now();
  if(remaining<=0n){active=false;expire();return;}
  const ceilMs=(remaining+999_999n)/1_000_000n;
  const slice=ceilMs>BigInt(TIMER_MAX_MS)?TIMER_MAX_MS:Number(ceilMs);
  handle=clock.schedule(arm,slice);
 };
 arm();
 return ()=>{active=false;if(handle!==undefined)clock.cancel(handle);};
}
