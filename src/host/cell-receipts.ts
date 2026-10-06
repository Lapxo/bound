import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {canonical,objectHistory,parse,byBytes,wireAt,RECEIPTS} from '@lapxo/topos/wire';
import {cellInputs,cellReceiptContract} from '@lapxo/topos/cell-inputs';
import {renderCells} from '@lapxo/topos/cells-view';
import {admittedObjects} from './objects.ts';
import {objectFold} from '../fold/object.ts';
import {fullDigest,bytesDigest} from './digest.ts';
import {closeReceipts,noteIdle} from '../fold/closed.ts';
import {authorityFor,rootSigner} from '../fold/signers.ts';
import {signaturesOf} from '../fold/digests.ts';
import {storeOf} from '../land/ledger.ts';
import {ownStore,ownLock} from '../observe/runner.ts';
import {lockStanding} from '../fold/keys.ts';
import {toposAt} from './selected-topos.ts';

type Fields=Readonly<Record<string,string>>;
const fields=(line:string):Fields=>{const p=parse(line);return p.kind==='fact'?p.value.fields:{};};
/** Only Topos input/render entry bytes enter region identity; host locations do not. */
function implementation(algorithm:string):readonly string[]{
 return ['@lapxo/topos/cell-inputs','@lapxo/topos/cells-view'].map(member=>bytesDigest(readFileSync(fileURLToPath(import.meta.resolve(member))),algorithm)).sort(byBytes);
}
/** Native count/bytes receipt lines; carried render blobs are separate verified cache payloads. */
export async function cellsWithReceipts(root:string,history:readonly string[],emit:(text:string)=>void):Promise<void>{
 const started=performance.now(),store=storeOf(root),parsed=objectHistory(history);
 if(parsed.kind!=='fact')throw Error(`REFUSE·wire ${parsed.why}`);
 const authority=authorityFor(history,rootSigner(root),signaturesOf(store).admitted);
 for(const record of parsed.value.objects)if(authority.of(canonical(record.fields)).kind!=='admitted')throw Error(`REFUSE·authority receipt input ${record.fields.id}`);
 const config=parsed.value.configuration.filter(f=>authority.of(canonical(f)).kind==='admitted');
 cellReceiptContract(config);
 const instrument=ownLock().map(fields);
 const wire=wireAt(instrument,Number.MAX_SAFE_INTEGER);if(!wire)throw Error('REFUSE·receipt no admitted digest algorithm');
 const algorithm=[...wire.digests][0];if(!algorithm)throw Error('REFUSE·receipt no digest algorithm');
 const code=implementation(algorithm);
 const inputs=cellInputs(parsed.value.objects),semantic=new Map<string,string>(),inputBytes=new Map<string,string>();
 const pins=new Map<string,readonly string[]>();
 for(const record of parsed.value.objects.filter(r=>r.record==='cell')){
  const pin=record.fields.topos!;if(!pins.has(pin)){const top=toposAt(pin);pins.set(pin,[pin,...top.dependencies]);}
  const scope=`receipts/cells/${record.fields.scope!}`;
  const bytes=[...inputs.get(record.fields.scope!)!,...pins.get(pin)!,...code,'resolution=1'].sort(byBytes).join('\n');
  inputBytes.set(scope,bytes);semantic.set(scope,fullDigest(bytes,algorithm));
 }
 // The context stamp is a cache validity guard, not any cell's semantic receipt identity.
 const contextStamp=fullDigest([...history,...code].sort(byBytes),algorithm);
 const at=join(root,RECEIPTS),raw=existsSync(at)?readFileSync(at,'utf8').split('\n').filter(Boolean):[],native=raw.filter(l=>parse(l).kind==='fact');
 const headers=native.filter(l=>fields(l).scope==='receipts'&&fields(l).measure==='digest');
 const carried=(digest:string):string=>join(store,'cas','carried',digest.slice(digest.indexOf(':')+1));
 const readVerified=(digest:string):string|undefined=>{
  if(!digest.startsWith(algorithm+':')||! /^[a-f0-9]+$/.test(digest.split(':')[1]??''))return;
  const file=carried(digest);if(!existsSync(file))return;const bytes=readFileSync(file);
  const got=bytesDigest(bytes,algorithm);if(got!==digest){emit(`RECEIPT invalid ${digest} · got ${got} · recompute`);return;}return bytes.toString('utf8');
 };
 const opened=new Set(await closeReceipts(root,store,semantic));
 const bodyLines=native.filter(l=>fields(l).scope!=='receipts').sort(byBytes).join('\n')+'\n';
 const intact=raw.length===native.length&&headers.length===1&&readVerified(fields(headers[0]!).at.replace(/^place:/,''))===bodyLines;
 if(!intact)for(const scope of semantic.keys())opened.add(scope);
 const cached=new Map<string,string>();
 for(const [scope,digest]of semantic){
  const bytes=native.filter(l=>fields(l).scope===scope&&fields(l).measure==='bytes');
  const counts=native.filter(l=>fields(l).scope===scope&&fields(l).measure==='count');
  if(bytes.length!==1||counts.length!==1||fields(bytes[0]!).value!==digest||fields(counts[0]!).value!=='1..1'){opened.add(scope);continue;}
  const output=readVerified(fields(counts[0]!).at.replace(/^place:/,''));
  if(output===undefined){opened.add(scope);continue;}cached.set(scope,output);
 }
 const idle=headers.length===1&&fields(headers[0]!).value===contextStamp&&readVerified(fields(headers[0]!).at.replace(/^place:/,''))!==undefined&&opened.size===0;
 let readings:ReturnType<typeof objectFold>|undefined;
 if(!idle){const held=await admittedObjects(root,history,emit);readings=objectFold(held.records,held.context);}
 const newLines:string[]=[],outputs:string[]=[];
 const save=(text:string):string=>{const digest=bytesDigest(Buffer.from(text),algorithm);const path=carried(digest);mkdirSync(dirname(path),{recursive:true});if(!existsSync(path)||readFileSync(path,'utf8')!==text)writeFileSync(path,text);return digest;};
 for(const [scope,digest]of semantic){
  const cellName=scope.slice('receipts/cells/'.length);
  const output=(!opened.has(scope)&&cached.has(scope))?cached.get(scope)!:renderCells([readings!.find(c=>c.cell===cellName)!]).join('\n')+'\n';
  outputs.push(output.trimEnd());const payload=save(output);
  if(save(inputBytes.get(scope)!)!==digest)throw Error('REFUSE·receipt input closure hash mismatch');
  newLines.push(canonical({scope,role:'writes',form:'interval',measure:'count',value:'1..1',at:`place:${payload}`,by:'bound'}),canonical({scope,role:'writes',form:'alphabet',measure:'bytes',value:digest,at:`place:${digest}`,by:'bound'}));
  emit(`RECEIPT ${scope}@1 · ${digest} · ${opened.has(scope)?'opened':'same'}`);
 }
 const nativeBody=newLines.sort(byBytes).join('\n')+'\n',body=save(nativeBody);
 // One native header names carried count/bytes lines; at closes the exact carried bytes.
 const next=[canonical({scope:'receipts',role:'writes',form:'alphabet',measure:'digest',value:contextStamp,at:`place:${body}`,by:'bound'}),...newLines.sort(byBytes)].join('\n')+'\n';
 if(!existsSync(at)||readFileSync(at,'utf8')!==next)writeFileSync(at,next);
 if(idle)noteIdle();
 emit(`RECEIPTS ${semantic.size} read · ${opened.size} opened · ${idle?'idle':'context checked'} · provider ${idle?0:pins.size}`);
 for(const output of outputs)emit(output);
 emit(`COST cells@1 · ${(performance.now()-started).toFixed(3)} ms · admission/context/receipt/render included`);
}
