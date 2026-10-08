import {randomUUID} from 'node:crypto';
import {closeSync,existsSync,fsyncSync,mkdirSync,openSync,readFileSync,readdirSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {requireEffects} from '../read-only.ts';
import {underTheLock} from '../../land/act.ts';

/** Prepared by the admitted Topos contract and receiver signer. The host does not infer origins, coverage or epochs. */
export interface IngressBundle {readonly evidence: string; readonly receipt: string}
export interface IngressResult extends IngressBundle {readonly kind: 'landed' | 'once'; readonly evidenceBytes: number; readonly receiptBytes: number}
export interface IngressStorage {
 publish(staged: string, committed: string): void;
}
const syncDirectory = (path: string): void => {const fd=openSync(path,'r');try{fsyncSync(fd)}finally{closeSync(fd)}};
const durableFile = (path: string, text: string): void => {const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,text);fsyncSync(fd)}finally{closeSync(fd)}};
/** Directory publication makes the pair visible together; there is no later ledger append that can expose half. */
export const nativeIngressStorage: IngressStorage = {publish(staged,committed){renameSync(staged,committed);syncDirectory(join(committed,'..'))}};
const directory = (store: string): string => join(store,'ingress');
const nameOf = (identity: string): string => {
 if(!identity||identity.includes('\0'))throw Error('REFUSE·ingress missing import identity');
 return 'committed-'+encodeURIComponent(identity);
};
const read = (at: string): IngressBundle => ({evidence:readFileSync(join(at,'evidence.bound'),'utf8'),receipt:readFileSync(join(at,'receipt.bound'),'utf8')});
const measured = (kind: 'landed'|'once', bundle: IngressBundle): IngressResult => ({kind,...bundle,evidenceBytes:Buffer.byteLength(bundle.evidence),receiptBytes:Buffer.byteLength(bundle.receipt)});

/** Native signed receipt lines only. Foreign bytes are never added to the local ledger or epoch allocator. */
export function ingressReceipts(store: string): readonly string[] {
 const root=directory(store);if(!existsSync(root))return [];
 return readdirSync(root).filter(name=>name.startsWith('committed-')).sort().flatMap(name=>read(join(root,name)).receipt.split('\n').filter(Boolean));
}
/** Private staging directories are invisible to readers and may be discarded after host recovery. */
export function ingressEvidence(store: string, identity: string): IngressBundle | undefined {
 const at=join(directory(store),nameOf(identity));return existsSync(at)?read(at):undefined;
}

export function ingressBundles(store: string): readonly IngressBundle[] {
 const root=directory(store);if(!existsSync(root))return [];
 return readdirSync(root).filter(name=>name.startsWith('committed-')).sort().map(name=>read(join(root,name)));
}

/** Verification and signing complete before staging. Replay performs no signer invocation or persistent write. */
export async function commitIngress(store: string, identity: string,
 prepare: (localImportReceipts: readonly string[]) => Promise<IngressBundle>,
 verify: (bundle: IngressBundle) => boolean,
 storage: IngressStorage = nativeIngressStorage): Promise<IngressResult> {
 requireEffects('foreign evidence ingress');
 return underTheLock(store,'ingress',async()=>{
  const root=directory(store),at=join(root,nameOf(identity));
  if(existsSync(at)){const prior=read(at);if(verify(prior)!==true)throw Error('REFUSE·ingress committed bytes do not verify');return measured('once',prior)}
  const bundle=await prepare(ingressReceipts(store));
  if(!bundle.evidence||!bundle.receipt||verify(bundle)!==true)throw Error('REFUSE·ingress evidence and receipt do not verify');
  mkdirSync(root,{recursive:true});
  const staged=join(root,'.stage-'+randomUUID());mkdirSync(staged,{mode:0o700});
  try {
   durableFile(join(staged,'evidence.bound'),bundle.evidence);
   durableFile(join(staged,'receipt.bound'),bundle.receipt);
   syncDirectory(staged);
   storage.publish(staged,at);
  }finally{rmSync(staged,{recursive:true,force:true})}
  return measured('landed',bundle);
 });
}

/** Costs distinguish delivered bytes from newly committed bytes; no count is called information or freedom. */
export function ingressCost(result: IngressResult, deliveredBytes: number, protocolBytes: number): string {
 if(!Number.isSafeInteger(deliveredBytes)||deliveredBytes<0||!Number.isSafeInteger(protocolBytes)||protocolBytes<0)throw Error('REFUSE·ingress invalid exchange byte measurement');
 return `EXCHANGE ${deliveredBytes} payload bytes · ${protocolBytes} protocol bytes · ${result.kind==='once'?0:result.evidenceBytes} new evidence bytes · ${result.kind==='once'?0:result.receiptBytes} new receipt bytes`;
}
