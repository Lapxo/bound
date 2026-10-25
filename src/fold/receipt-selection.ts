import{lstatSync}from'../host/io.ts';
import{join}from'../host/io.ts';
import{archiveCoordinate}from'../host/archive.ts';
import{readBoundedFile}from'../host/native/bounded-file.ts';
import{viewInput}from'../host/reading-context.ts';
import{fieldOf}from'./claims.ts';

export interface ReceiptSelection {readonly scope:string;readonly coordinate:string;readonly files:ReadonlySet<string>}
export function publicationSelection(region:string):string|undefined{
 if(region==='publication-receipts')return 'publish/receipt-members';
 const prefix='publication-receipts/';if(!region.startsWith(prefix))return undefined;
 const id=region.slice(prefix.length);try{if(!id||archiveCoordinate(id)!==id)return undefined}catch{return undefined}
 return 'publish/receipt-members/'+id;
}
export const isPublicationRegion=(name:string):boolean=>name==='publication-lines'||publicationSelection(name)!==undefined;
export function receiptSelectionLimits(lines:readonly string[]):{bytes:number;files:number}{
 const cap=(scope:string)=>{const rows=lines.filter(l=>fieldOf(l,'scope')===scope&&fieldOf(l,'value')!=='withdraw');if(rows.length!==1)throw Error('REFUSE·receipt publication resource '+scope);const value=/^0\.\.([1-9][0-9]*)$/.exec(fieldOf(rows[0]!,'value')),n=Number(value?.[1]);if(!value||!Number.isSafeInteger(n))throw Error('REFUSE·receipt publication missing resource '+scope);return n};
 return{bytes:cap('publish/receipt-bytes'),files:cap('publish/receipt-files')};
}
/** One validator serves production and historical byte-seal verification. */
export function receiptSelection(root:string,lines:readonly string[],scope:string,hash:(bytes:Uint8Array)=>string):ReceiptSelection{
 if(scope!=='publish/receipt-members'&&publicationSelection('publication-receipts/'+scope.slice('publish/receipt-members/'.length))!==scope)throw Error('REFUSE·receipt publication profile '+scope);
 const rows=lines.filter(l=>fieldOf(l,'scope')===scope&&fieldOf(l,'value')!=='withdraw');if(rows.length!==1)throw Error('REFUSE·receipt publication selection '+scope);
 const selection=rows[0]!,coordinate=fieldOf(selection,'shape'),limits=receiptSelectionLimits(lines);archiveCoordinate(coordinate);
 const read=(name:string)=>{if(archiveCoordinate(name)!==name)throw Error('REFUSE·receipt publication noncanonical member '+name);for(const component of name.split('/').map((_,i,parts)=>parts.slice(0,i+1).join('/')))if(lstatSync(join(root,component)).isSymbolicLink())throw Error('REFUSE·receipt publication symbolic member '+name);return Buffer.from(viewInput('file:'+join(root,name),()=>readBoundedFile(join(root,name),limits.bytes,name).toString('base64')),'base64')};
 const input=read(coordinate);if(hash(input)!==fieldOf(selection,'value'))throw Error('REFUSE·receipt publication inventory bytes differ');
 const paths:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input));
 if(!Array.isArray(paths)||!paths.length||paths.length>limits.files||paths.some(path=>typeof path!=='string')||new Set(paths).size!==paths.length||!paths.includes('TARGET.bound')||!paths.includes('receipts.bound'))throw Error('REFUSE·receipt publication inventory shape/resources');
 let used=input.length;for(const path of paths){used+=read(path).length;if(used>limits.bytes)throw Error('REFUSE·receipt publication byte resources');}
 return{scope,coordinate,files:new Set(paths as string[])};
}
