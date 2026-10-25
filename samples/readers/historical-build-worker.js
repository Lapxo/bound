import {parentPort,workerData} from 'node:worker_threads';
import {runHistoricalBuild} from './run-historical-build.js';
parentPort.postMessage(runHistoricalBuild(workerData.reader,workerData.positive,workerData.negative,workerData.place));
