import {decodeReference} from '@lapxo/bound/reference';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {canonical,parseSignature} from '@lapxo/topos/wire';
import {standingBytes} from '@lapxo/topos/standing';
import {actingRootFixture} from './acting-root.ts';
import {intervalForm} from '@lapxo/topos/forms';
const sha=(b:Uint8Array|string)=>'sha256:'+createHash('sha256').update(b).digest('hex');
const verifyBytes=(bytes:string,key:string,signature:string,algorithms:readonly string[])=>{const parsed=parseSignature(signature);if(!parsed||!algorithms.includes(parsed.algorithm))return false;try{return verify(null,Buffer.from(bytes),createPublicKey({key:Buffer.from(key,'base64'),format:'der',type:'spki'}),Buffer.from(parsed.raw,'base64'))}catch{return false}};
const repo=new URL('../../',import.meta.url),row=(scope:string,measure:string,value:string)=>canonical({scope,measure,value,role:'writes',form:'alphabet',by:'target',at:'policy:fixture'});
/** Real admitted fixture shared by separate export and backend conformance regions. */
export function referenceRootFixture(place:string,world?:{readonly standing:string;readonly members:ReadonlyMap<string,Uint8Array>}){
  const require=createRequire(import.meta.url),sdk=join(require.resolve('@lapxo/topos/package.json'),'..');
  const yes=JSON.parse(readFileSync(new URL('samples/reference-export/yes.json',repo),'utf8')),no=JSON.parse(readFileSync(new URL('samples/reference-export/no.json',repo),'utf8'));
  const schema=JSON.parse(readFileSync(join(sdk,'samples/walk/interval.json'),'utf8'));
  const guest=readFileSync(new URL('assets/wasm/guest.js',repo)),guestPin=sha(guest);
  const provider=Buffer.from(`import {intervalForm} from './${guestPin.slice(7)}';\nexport function context({digest,records,admit}){return {resolve:cell=>({digest,form:intervalForm,params:JSON.parse(cell.fields.params)}),origin:(id,by)=>records.some(f=>f.scope==='origin/'+id&&f.value===by&&admit(f)),witness:()=>false};}\n`),providerPin=sha(provider);
  const topos=world?.standing??standingBytes([canonical({scope:'wire/topos/context-view',role:'writes',form:'alphabet',measure:'id',value:'context',at:'policy:fixture'}),canonical({scope:'offers/context',role:'writes',form:'alphabet',measure:'digest',kind:'check',view:'context',value:providerPin,restsOn:providerPin+'|'+guestPin,at:'policy:fixture'})]),toposPin=sha(topos);
  const contracts={refusals:sha(readFileSync(new URL('docs/contracts/refusals.bound',repo))),standing:sha(readFileSync(new URL('docs/contracts/standing.bound',repo)))};
  const grammar=schema.historicalWire.filter((f:Record<string,string>)=>f.scope.startsWith('wire/object/')).map((f:Record<string,string>)=>canonical({...f,by:'target',epoch:undefined}));
  const extra=[...grammar,row('reference/authentication','id','authenticated-standing@1'),row('reference/proof-scope','id','sample/reference-proof'),row('reference/records','id','256'),canonical({scope:'reference/export-bytes',role:'writes',form:'interval',measure:'bytes',value:'262144..262144',by:'target',at:'policy:fixture'}),row('reference/contracts/refusals','id',contracts.refusals),row('reference/contracts/standing','id',contracts.standing),row('uses/interval','digest',toposPin),row('origin/one','id','owner')];
  if(world)extra.push(canonical({scope:'evidence/origin/one',role:'writes',form:'alphabet',measure:'id',value:'one',by:'target',at:'policy:fixture',condition:yes.cell.scope}));
  const f=actingRootFixture(place,[],{entry:fileURLToPath(new URL('dist/cli/verb.js',repo)),fields:schema.historicalWire.find((r:Record<string,string>)=>r.scope==='wire/fields').value,families:'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region|reference|uses|origin|engine|transport'+(world?'|evidence':''),extraBootstrapRows:extra});
  try{
    // The disposable place receives fixture data by digest before the measured opening.
    const laid=join(f.root,'.bound/cas/blobs');mkdirSync(laid,{recursive:true});
    for(const bytes of (world?[...world.members.values()]:[guest,provider,Buffer.from(topos)]))writeFileSync(join(laid,sha(bytes).slice(7)),bytes,{mode:0o444,flag:'wx'});
    const lot=join(f.temp,'typed-lot.bound');
    writeFileSync(lot,[canonical({type:'cell',id:'cell',scope:yes.cell.scope,by:'target',form:'interval',measure:'value',params:JSON.stringify(yes.cell.params),topos:toposPin,restsOn:'none'}),canonical({type:'claim',id:'claim',scope:yes.cell.scope,by:'target',origin:yes.claim.origin,sign:'+1',value:yes.claim.value})].join('\n')+'\n');
    const admitted=f.run(['land',lot,'--key','owner','--key-file',f.key]);assert.equal(admitted.status,0,admitted.stderr);
    const ledger=()=>{const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)+' '+sha(readFileSync(join(dir,e.name)))]);return walk(join(f.root,'.bound/ledger'));};
    const before=ledger(),targetBefore=readFileSync(join(f.root,'TARGET.bound'),'utf8');
    const output=f.run(['sign','--as','reference',yes.source,'--key','owner','--key-file',f.key]);assert.equal(output.status,0,output.stderr);
    const bundle=JSON.parse(output.stdout);assert.equal(bundle.profile,'reference-export@1');assert.equal(output.stdout.includes(f.temp),false);assert.doesNotMatch(output.stdout,/PRIVATE KEY/);assert.deepEqual(bundle.context.contracts,contracts);assert.equal(decodeReference(bundle.reference).blob,sha(bundle.carrier));assert.deepEqual(ledger(),before);assert.equal(readFileSync(join(f.root,'TARGET.bound'),'utf8'),targetBefore);
    const objects={admit:()=>true,resolve:()=>({digest:toposPin,form:intervalForm,params:{lo:0,hi:10}}),origin:()=>true,witness:()=>false};
    // The test host independently accepts its own fixture's authority and contract pins.
    // Production consumers must establish these expectations outside a downloaded carrier.
    const trust={...bundle.context,contracts,objects,digestBytes:sha,verifyBytes,fetchBytes:async()=>new Uint8Array(Buffer.from(bundle.carrier))};
    assert.equal(bundle.context.signers.find((s:{id:string})=>s.id==='owner').publicKey,f.owner.publicKey.export({format:'der',type:'spki'}).toString('base64'));
    return{f,yes,no,contracts,toposPin,objects,trust,bundle,ledger,before,targetBefore};
  }catch(error){f.close();throw error}
}
