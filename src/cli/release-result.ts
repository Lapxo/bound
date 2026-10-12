import {parse} from '@lapxo/topos/wire';
import {authorityFor,writerFor,releaseSigner} from '../fold/signers.ts';
import {eraOf} from '../fold/digests.ts';
import {fieldOf,foldClaims} from '../fold/claims.ts';
import {observeText} from '../observe/files.ts';
import {claimLinesIn} from './args.ts';
import {LOCK} from '@lapxo/topos/wire';
import {join} from 'node:path';

/** Judge an external signed approval without landing it, fetching its source,
 * executing a provider, or changing the release-policy verdict of the place.
 * The anchor is the place's key, never a key offered by the approval. */
export function releaseApproval(lock:readonly string[],lines:readonly string[]):string {
  const standing=foldClaims(lock).standing;
  const id=writerFor(standing,'authorize');
  if(!id)throw Error('REFUSE·release place names no authorizer');
  const one=(rows:readonly string[],scope:string,measure?:string):string=>{
    const selected=rows.filter(line=>fieldOf(line,'scope')===scope&&(!measure||fieldOf(line,'measure')===measure)&&fieldOf(line,'value')!=='withdraw');
    if(selected.length!==1)throw Error(`REFUSE·release ${scope} needs one declaration`);
    return fieldOf(selected[0]!,'value');
  };
  const anchor={...releaseSigner(standing),id,publicKey:one(standing,`keys/${id}`,'public-key'),coverage:one(standing,`keys/${id}`,'coverage').split('|')};
  if(!lines.length)throw Error('REFUSE·release empty approval');
  for(const line of lines){
    const got=parse(line);
    if(got.kind!=='fact')throw Error('REFUSE·release malformed approval');
    if(got.value.fields['by']!==id||!got.value.fields['sig'])throw Error(`REFUSE·release approval must be signed by ${id}`);
  }
  // A separate release place may declare an era; its configuration must itself
  // authenticate against the existing anchor. No packet key or coverage is used.
  const wire=lines.filter(line=>['wire/signature-algorithms','audit/wire/signature-algorithms','wire/era','audit/wire/era'].includes(fieldOf(line,'scope')));
  let era:ReturnType<typeof eraOf>;
  try{era=eraOf(wire.length?foldClaims(wire).standing:standing);}
  catch{throw Error('REFUSE·release signature era is absent or conflicting');}
  const authority=authorityFor([],anchor,era.admitted);
  for(const line of lines){const verdict=authority.of(line);if(verdict.kind!=='admitted')throw Error(`REFUSE·release ${fieldOf(line,'scope')}: ${verdict.why??verdict.kind}`);}
  const released=lines.filter(line=>/^release\/[^/]+$/.test(fieldOf(line,'scope'))&&fieldOf(line,'measure')==='digest'&&fieldOf(line,'role')==='writes');
  if(released.length!==1)throw Error('REFUSE·release needs one signed release/<tag> digest');
  const required=(scope:string,measure:string):string=>{
    const selected=lines.filter(line=>fieldOf(line,'scope')===scope);
    if(selected.some(line=>fieldOf(line,'role')!=='writes'||fieldOf(line,'form')!=='alphabet'||fieldOf(line,'measure')!==measure))throw Error(`REFUSE·release ${scope} is not an approval declaration`);
    return one(selected,scope,measure);
  };
  const digest=required(fieldOf(released[0]!,'scope'),'digest'),name=required('release/artifact','id'),source=required('sources/archive','id');
  if(!/^sha256:[a-f0-9]{64}$/.test(digest))throw Error('REFUSE·release archive needs sha256');
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name))throw Error('REFUSE·release artifact needs one safe filename');
  let url:URL;try{url=new URL(source);}catch{throw Error('REFUSE·release archive source needs an absolute URL');}
  if(url.username||url.password||/[\s\x00-\x1f\x7f]/.test(source))throw Error('REFUSE·release archive source needs a credential-free absolute URL without whitespace');
  return `READY ${digest} ${name} ${source}`;
}

export function printReleaseApproval(root:string,file:string):void {
  const text=observeText(file);
  if(text===undefined)throw Error('REFUSE·release approval file is absent');
  const lines=text.split('\n').filter(line=>line.trim().length>0);
  process.stdout.write(releaseApproval(claimLinesIn(join(root,LOCK)),lines)+'\n');
}
