import {parentPort,workerData} from 'node:worker_threads';
import {runEvidenceSample} from './run-evidence.mjs';
const {reader,keyClass,negative,options}=workerData;
parentPort.postMessage(runEvidenceSample(reader,keyClass,negative,undefined,options));
