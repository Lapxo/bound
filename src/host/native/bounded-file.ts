import fs from 'node:fs';
/** The opened descriptor is bounded before allocation/read. Growth after fstat
 * is detected with one sentinel byte; no oversized buffer reaches decode/hash.
 */
export function readBoundedFile(path:string,remaining:number,coordinate:string):Buffer{
 if(!Number.isSafeInteger(remaining)||remaining<0)throw Error('REFUSE·native file missing byte budget '+coordinate);
 const fd=fs.openSync(path,'r');try{
  const stat=fs.fstatSync(fd);if(!stat.isFile()||!Number.isSafeInteger(stat.size)||stat.size>remaining)throw Error('REFUSE·native file byte budget before read '+coordinate);
  const bytes=Buffer.alloc(stat.size);let offset=0;
  while(offset<bytes.length){const count=fs.readSync(fd,bytes,offset,bytes.length-offset,null);if(!count)throw Error('REFUSE·native file changed during read '+coordinate);offset+=count}
  if(fs.readSync(fd,Buffer.alloc(1),0,1,null)!==0)throw Error('REFUSE·native file grew during read '+coordinate);
  return bytes;
 }finally{fs.closeSync(fd)}
}
export function readBoundedBatch(paths:readonly {path:string;coordinate:string}[],budget:number):readonly Buffer[]{
 let bytes=0;return paths.map(file=>{const data=readBoundedFile(file.path,budget-bytes,file.coordinate);bytes+=data.length;return data});
}
