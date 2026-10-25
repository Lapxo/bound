import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
const [yes,no,reader=new URL('../../dist/cli/verb.js',import.meta.url).pathname]=process.argv.slice(2);
const positive=JSON.parse(readFileSync(yes,'utf8')),negative=JSON.parse(readFileSync(no,'utf8'));
assert.ok(positive.declarations.length);assert.equal(negative.contract,'whole-region@1');
const families=['measurement','artifact'];
// Separate event loops keep a sample's synchronous CLI calls from delaying
// another sample's real interruption. Each worker owns its instrument and places.
const results=await Promise.allSettled(families.map(family=>new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./walk-sample-worker.mjs',import.meta.url),{workerData:{family,reader,positive}});
 let answered=false;
 worker.once('message',events=>{answered=true;resolve(events);});
 worker.once('error',reject);
 worker.once('exit',code=>{if(!answered)reject(Error('Walk sample exited without evidence: '+code));});
})));
for(const [index,result] of results.entries()){
 if(result.status==='rejected')throw result.reason;
 console.log('PLACE '+families[index]);
 for(const event of result.value)console.log(event.stdout+event.stderr);
}
