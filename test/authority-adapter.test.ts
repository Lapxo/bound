import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {secondHead} from '../src/fold/second.ts';
import {releasePolicy,releasePolicyLines} from '../src/fold/release-policy.ts';
import {canonical} from '@lapxo/topos/wire';
test('host without an attester reads the Topos none verdict without inventing admission',()=>{
 const root=mkdtempSync(join(tmpdir(),'authority-absence-'));
 try{assert.deepEqual(secondHead(join(root,'.bound'),[],()=>{throw Error('no statement to admit');},[]),{verdict:'none',external:false,epoch:0});}finally{rmSync(root,{recursive:true,force:true});}
});
test('none blocks a selected declared gate even when the old paid list claims payment',()=>{
 const line=(scope:string,role:string,value:string,measure='id',needs?:string)=>canonical({scope,role,value,measure,form:'alphabet',by:'fixture',at:'policy:test',...(needs?{needs}:{})});
 const gate=line('custom/release','demands','agrees','verdict','custom/evidence');
 const standing=[line('release/blocks','writes','check'),line('release/category/check','writes','custom/release'),gate];
 const base={standing,demands:[gate],paid:[gate],ceilings:[],readings:{read:[],unread:[],vacuous:[],over:[]},snapshot:{fold:'f',instrument:'i'}};
 const blocked=releasePolicy({...base,verdicts:[{coordinate:'custom/evidence',value:'none'}]});
 assert.equal(blocked.status,'blocked');assert.ok(releasePolicyLines(blocked).some(l=>l.includes('custom/evidence=none')));
 assert.equal(releasePolicy({...base,verdicts:[{coordinate:'custom/evidence',value:'agrees'}]}).status,'ready');
 assert.equal(releasePolicy({...base,verdicts:[]}).status,'blocked');
});
test('a declared gate is visible without inventing release categories or READY',()=>{
 const gate=canonical({scope:'pipeline/release',role:'demands',form:'alphabet',measure:'verdict',value:'agrees',needs:'verify',by:'fixture',at:'policy:forge'});
 const got=releasePolicy({standing:[gate],demands:[gate],paid:[],ceilings:[],readings:{read:[],unread:[],vacuous:[],over:[]},snapshot:{fold:'f',instrument:'i'},verdicts:[{coordinate:'verify',value:'none'}]});
 assert.equal(got.status,'absent');assert.equal(got.gates?.[0]?.status,'blocked');assert.ok(releasePolicyLines(got).every(l=>!l.startsWith('RELEASE')));
});
