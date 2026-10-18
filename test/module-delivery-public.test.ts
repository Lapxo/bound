import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyModuleDelivery} from '../src/host/native/module-delivery.ts';
test("published closure carrier verifies and altered carrier refuses before execution",()=>{
 const pin='sha256:a6df1d11537a0792c9772b1874c7e127e0fda22203f756d6f0eb104d072a9df1';
 const limits={members:1000,bytes:4194304,responseBytes:8388608};
 const yes=verifyModuleDelivery(readFileSync('samples/module-delivery/inputs/delivery.json'),pin,limits);
 assert.equal(yes.manifest.modules.length,87);assert.equal(yes.manifest.notices.length,3);
 assert.throws(()=>verifyModuleDelivery(readFileSync('samples/no/module-delivery/delivery.json'),pin,limits),/bundle bytes differ/);
 console.log('DELIVERY 87 modules · 3 notices · exact carrier verified · changed carrier refused');
});
