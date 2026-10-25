import {parentPort,workerData} from 'node:worker_threads';
import {runHistoricalPresentationViews} from './run-historical-presentation.js';
const {reader,positive,negative,place}=workerData;
parentPort.postMessage(runHistoricalPresentationViews(reader,positive,negative,place));
