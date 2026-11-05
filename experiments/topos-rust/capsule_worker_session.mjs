// Pure trusted-embedding continuation; no callback or resource setting from requests.
const fail=code=>{throw Object.assign(Error(code),{code})};
export function capsuleResult(context,maxJobs){
 if(!Number.isSafeInteger(maxJobs)||maxJobs<1)fail('capsule-worker/job-selection');
 function read(code){const result=context.evalCode(code);if(result.error){result.error.dispose();fail('capsule-worker/guest-refused')}try{return context.dump(result.value)}finally{result.value.dispose()}}
 let jobs=0;while(read('globalThis.__capsuleDone')!==true){if(++jobs>maxJobs)fail('capsule-worker/job-budget');const runtime=context.runtime;if(!runtime||typeof runtime.executePendingJobs!=='function')fail('capsule-worker/async-unavailable');const result=runtime.executePendingJobs(1);if(result.error){result.error.dispose();fail('capsule-worker/job-refused')}let n;try{n=result.value}finally{result.dispose?.()}if(!Number.isInteger(n)||n<1)fail('capsule-worker/async-unsettled')}
 if(read('globalThis.__capsuleFailure')===true)fail('capsule-worker/load-refused');const text=read('globalThis.result');if(typeof text!=='string')fail('capsule-worker/result');return text;
}
