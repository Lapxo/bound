/** Fixed descendant entry. The caller supplies only a sealed operational envelope;
 * actual grants/counters live in the retained Root producer service.
 */
import {createHash} from 'node:crypto';
import {readBoundedFile} from '../host/native/bounded-file.ts';
import {installDescendantBoundary} from '../host/native/descendants.ts';
import {protectNativeLoaderRegistration} from '../host/native/loader.ts';
import {assertNativeRuntime} from '../host/native/runtime.ts';
const url=new URL(import.meta.url),path=url.searchParams.get('config'),cap=Number(url.searchParams.get('bytes')),expected=url.searchParams.get('digest');
if(!path||!expected||!Number.isSafeInteger(cap)||cap<1)throw Error('REFUSE·native descendant inherited envelope absent');
assertNativeRuntime(process.env,[]);
const raw=readBoundedFile(path,cap,'descendant host envelope');if('sha256:'+createHash('sha256').update(raw).digest('hex')!==expected)throw Error('REFUSE·native descendant envelope changed');
const config=JSON.parse(raw.toString('utf8'));config.custodian.preload=url.href;
installDescendantBoundary(config);

protectNativeLoaderRegistration();
