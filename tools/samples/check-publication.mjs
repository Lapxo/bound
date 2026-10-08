import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {runTypedSample} from './run-typed.mjs';
import {runSigningSample} from './run-signing.mjs';
import {Worker} from 'node:worker_threads';
const [profile, yes, no, requestedReader=new URL('../../dist/cli/verb.js',import.meta.url).pathname]=process.argv.slice(2);
const {publicInstrument}=await import('./public-instrument.mjs');
const instrument=await publicInstrument(requestedReader),reader=instrument.reader;
process.once('exit',()=>instrument.close());
if(profile==='typed-object') {
 const result=runTypedSample(reader,undefined,'yes.json',undefined,{yes,no});
 for(const snapshot of result.snapshots){console.log('SCENE '+snapshot.label);for(const row of snapshot.cells)console.log('CELL '+JSON.stringify(row));}
 for(const event of result.events.filter(e=>e.case))console.log('NEGATIVE '+event.case+' '+event.stderr.trim());
} else if(profile==='evidence'||profile==='native-views') {
 const positive=JSON.parse(readFileSync(yes,'utf8')),negative=JSON.parse(readFileSync(no,'utf8'));
 assert.deepEqual(positive.keyClasses,['authorize','read','access','attest']);
 assert.equal(typeof negative.uncovered?.scope,'string');assert.equal(typeof negative.tamperedValue,'string');
 const results=await Promise.all(positive.keyClasses.map(keyClass=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./evidence-worker.mjs',import.meta.url),{workerData:{reader,keyClass,negative,options:profile==='native-views'?{lines:positive.lines,views:true}:undefined}});
  let completed=false;worker.once('message',events=>{completed=true;resolve({keyClass,events});});worker.once('error',reject);worker.once('exit',code=>{if(code!==0||!completed)reject(Error('Evidence worker did not complete: '+keyClass+' '+code));});
 })));
 for(const {keyClass,events}of results){console.log('KEY-CLASS '+keyClass);for(const event of events)console.log(event.stdout+event.stderr);}
} else if(profile==='signing') {
 const result=runSigningSample(reader,JSON.parse(readFileSync(yes,'utf8')),JSON.parse(readFileSync(no,'utf8')));
 for(const event of result.runs)console.log(event.label+'\n'+event.stdout+event.stderr);
 console.log('SIGNING file-command-equivalent; one invocation per lot; atomic refusals');
} else if(profile==='query-views') {
 const {runQueryViews}=await import('./run-query-views.mjs');
 const events=runQueryViews(reader,JSON.parse(readFileSync(yes,'utf8')),JSON.parse(readFileSync(no,'utf8')));
 for(const event of events)console.log(event.stdout+event.stderr);
 console.log('QUERY why: two places; exact coordinate; absent OPEN; missing view refused');
} else if(profile==='prose-views') {
 const positive=JSON.parse(readFileSync(yes,'utf8')),negative=JSON.parse(readFileSync(no,'utf8'));
 assert.equal(positive.places.length,2);
 const results=await Promise.all(positive.places.map(place=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./prose-worker.mjs',import.meta.url),{workerData:{reader,positive,negative,place:place.name}});
  let received=false;worker.once('message',events=>{received=true;resolve(events);});worker.once('error',reject);worker.once('exit',code=>{if(code!==0||!received)reject(Error('Prose sample worker did not complete: '+place.name+' '+code));});
 })));
 for(const events of results)for(const event of events)console.log(event.stdout+event.stderr);
 console.log('PROSE three named views; two places; two exact readings; disagreement refused');
} else if(profile==='historical-presentation') {
 const positive=JSON.parse(readFileSync(yes,'utf8')),negative=JSON.parse(readFileSync(no,'utf8'));
 assert.equal(positive.places.length,2);
 const results=await Promise.all(positive.places.map(place=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./historical-presentation-worker.mjs',import.meta.url),{workerData:{reader,positive,negative,place:place.name}});
  let received=false;worker.once('message',events=>{received=true;resolve(events);});worker.once('error',reject);worker.once('exit',code=>{if(code!==0||!received)reject(Error('Historical presentation worker did not complete: '+place.name+' '+code));});
 })));
 for(const events of results)for(const event of events)console.log(event.stdout+event.stderr);
 console.log('HISTORICAL explanation and README; two places; exact prose; absent evidence not invented; unoffered view refused');
} else if(profile==='historical-document-views') {
 const positive=JSON.parse(readFileSync(yes,'utf8')),negative=JSON.parse(readFileSync(no,'utf8'));
 assert.equal(positive.places.length,2);
 const results=await Promise.all(positive.places.map(place=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./historical-document-worker.mjs',import.meta.url),{workerData:{reader,positive,negative,place:place.name}});
  let received=false;worker.once('message',events=>{received=true;resolve(events);});worker.once('error',reject);worker.once('exit',code=>{if(code!==0||!received)reject(Error('Historical document sample worker did not complete: '+place.name+' '+code));});
 })));
 for(const events of results)for(const event of events)console.log(event.stdout+event.stderr);
 console.log('HISTORICAL citation, guide, reference; two places; two exact readings; unoffered view refused');
} else if(profile==='historical-build') {
 const positive=JSON.parse(readFileSync(yes,'utf8')),negative=JSON.parse(readFileSync(no,'utf8'));
 const results=await Promise.all(positive.places.map(place=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./historical-build-worker.mjs',import.meta.url),{workerData:{reader,positive,negative,place:place.name}});
  let received=false;worker.once('message',events=>{received=true;resolve(events);});worker.once('error',reject);worker.once('exit',code=>{if(code!==0||!received)reject(Error('Build sample worker did not complete: '+place.name+' '+code));});
 })));
 for(const events of results)for(const event of events)console.log(event.stdout+event.stderr);
 console.log('BUILD two places; exact configuration; two equal readings; unoffered view refused');
} else if(profile==='program-views') {
 const positive=JSON.parse(readFileSync(yes,'utf8')),negative=JSON.parse(readFileSync(no,'utf8'));
 assert.equal(positive.places.length,2);
 const results=await Promise.all(positive.places.map(place=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./program-worker.mjs',import.meta.url),{workerData:{reader,positive,negative,place:place.name}});
  let received=false;worker.once('message',events=>{received=true;resolve(events);});worker.once('error',reject);worker.once('exit',code=>{if(code!==0||!received)reject(Error('Program sample worker did not complete: '+place.name+' '+code));});
 })));
 for(const events of results)for(const event of events)console.log(event.stdout+event.stderr);
 console.log('PROGRAMS two places; card and programs; two equal readings; unread stays unread; cycle refused');
} else throw Error('Unknown sample profile: '+profile);
