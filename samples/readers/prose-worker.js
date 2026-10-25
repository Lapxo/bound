import {parentPort,workerData} from 'node:worker_threads';
import {runProseViews} from './run-prose-views.js';
const {reader,positive,negative,place}=workerData;
parentPort.postMessage(runProseViews(reader,positive,negative,place));
