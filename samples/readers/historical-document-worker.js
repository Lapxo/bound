import {parentPort,workerData} from 'node:worker_threads';
import {runHistoricalDocumentViews} from './run-historical-document-views.js';
const {reader,positive,negative,place}=workerData;
parentPort.postMessage(runHistoricalDocumentViews(reader,positive,negative,place));
