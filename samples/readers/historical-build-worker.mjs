import {parentPort,workerData} from 'node:worker_threads';
import {runHistoricalBuild} from './run-historical-build.mjs';
parentPort.postMessage(runHistoricalBuild(workerData.reader,workerData.positive,workerData.negative,workerData.place));
