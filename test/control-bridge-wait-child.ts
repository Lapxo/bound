import {readFileSync,writeFileSync} from 'node:fs';import {createFixedControlBridge} from '../src/host/native/control-bridge.ts';
const data=JSON.parse(readFileSync(0,'utf8'));data.binding.workerBytes=Buffer.from(data.workerBytes,'base64');
const bridge=createFixedControlBridge(data.binding);writeFileSync(data.pidFile,String(process.pid));
try {bridge.exchange('{}');process.stdout.write('UNEXPECTED SUCCESS');} finally {await bridge.close();}
