import {parentPort,workerData} from 'node:worker_threads';
import {runProgramViews} from './run-program-views.mjs';
const {reader,positive,negative,place}=workerData;
parentPort.postMessage(runProgramViews(reader,positive,negative,place));
