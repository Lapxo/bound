import{createHash}from'node:crypto';import{gzipSync}from'node:zlib';import{mkdirSync,writeFileSync,cpSync,readFileSync}from'node:fs';import{join}from'node:path';
import{canonical,parse}from'@lapxo/topos/wire';import{standingBytes}from'@lapxo/topos/standing';import{actingRootFixture}from'./acting-root.ts';
const hash=(b:string|Uint8Array)=>'sha256:'+createHash('sha256').update(b).digest('hex');
const row=(scope:string,measure:string,value:string,extra:Record<string,string>={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',by:'target',at:'policy:fixture',...extra});
/** Disposable archived world: retained source plus a declared input projection.
 * Only fixture framing is built here; execution, admission, authentication and
 * receipt preparation all go through existing Bound operations. */
function member(name:string,text:string){const bytes=Buffer.from(text),h=Buffer.alloc(512);h.write(name);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h.write('0',156);h.write('ustar\0',257);h.write(h.reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);return Buffer.concat([h,bytes,Buffer.alloc(Math.ceil(bytes.length/512)*512-bytes.length)])}
export function catalogProjectedFixture(name:string,modern:boolean){
 const plan=canonical({scope:'extent',measure:'reads',value:'input.txt',role:'reads',form:'alphabet',by:'world',at:'receipt:1'});
 const code='export const render=()=>'+JSON.stringify([plan])+';export const receipt=()=>[{scope:"sample/observed",measure:"count",role:"reads",bound:{kind:"interval",lo:1,hi:1}}];\n';
 const declaration=[row('region/extent','reads','**'),row('region/extent','writes','**'),row('region/extent','input-projection','inputs')].join('\n')+'\n';
 const archive=gzipSync(Buffer.concat([member('capsule.bound',declaration),member('entry.js',code),Buffer.alloc(1024)])),blob=hash(archive);
 const standing=standingBytes([row('offers/provider','digest',blob,{kind:'capsule',restsOn:blob})]),pin=hash(standing);
 const config=[row('wire/shapes','id','run|entry.js|input.txt'),row('wire/region-measures','id','coordinates'),row('wire/region-coordinate','id','coordinates'),row('reader/timeout','milliseconds','0..3000',{form:'interval'}),row('reader/response-bytes','bytes','0..65536',{form:'interval'}),row('reader/inputs','id','required'),row('wire/reader-inputs','id','declared-presence@1'),row('wire/reader-lifetime','id','bounded-process@2'),row('uses/provider','digest',pin),row('dep/provider','digest',blob,{shape:'entry.js'}),row('region/extent','coordinates','input.txt')];
 for(const[key,value]of Object.entries({bytes:65536,files:16,readings:16,probes:1}))config.push(row('reading-identity/'+key,key,'0..'+value,{form:'interval'}));
 if(modern)config.push(row('wire/reading-context','id','reading-context@1'),row('wire/reading-receipt','id','reading-receipt@1'));
 const f=actingRootFixture(name,[],{families:'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region|reading-identity|uses|dep|offers',fields:'scope|role|form|measure|value|by|at|epoch|sig|about|shape|needs|kind|restsOn',extraBootstrapRows:config});
 const cas=join(f.root,'.bound/cas/blobs');mkdirSync(cas,{recursive:true});writeFileSync(join(cas,pin.slice(7)),standing);writeFileSync(join(cas,blob.slice(7)),archive);writeFileSync(join(f.root,'input.txt'),'stable input');
 return f;
}

export function catalogReadingInstrument(temp:string){
 const root=join(temp,'instrument');mkdirSync(root);cpSync(new URL('../../dist/',import.meta.url),join(root,'dist'),{recursive:true});mkdirSync(join(root,'vendor'));cpSync(new URL('../../vendor/syntax/',import.meta.url),join(root,'vendor/syntax'),{recursive:true});writeFileSync(join(root,'package.json'),' {"type":"module"}\n');
 const grammar=readFileSync(new URL('../../TARGET.bound',import.meta.url),'utf8').split('\n').filter(line=>{const p=parse(line);return p.kind==='fact'&&(p.value.fields.scope.startsWith('wire/')||p.value.fields.scope.startsWith('audit/wire/'))&&p.value.fields.measure==='id'});
 writeFileSync(join(root,'TARGET.bound'),[...grammar,row('wire/region-leaf','id','leaves'),row('store/vouches','id','tree'),row('store/source','id','write|leaf')].join('\n')+'\n');
 return {root,entry:join(root,'dist/cli/verb.js')};
}
