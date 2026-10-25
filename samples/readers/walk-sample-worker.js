import {parentPort,workerData} from 'node:worker_threads';
import {publicInstrument} from './public-instrument.js';
import {runWalkSample} from './run-walk.js';
const instrument=await publicInstrument(workerData.reader);
try {parentPort.postMessage(await runWalkSample(instrument.reader,undefined,workerData.family,workerData.positive));}
finally {instrument.close();}
