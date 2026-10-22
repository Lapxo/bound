import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonical,parse,signedBytes,formatSignature} from '@lapxo/topos/wire';
import {encodeProfileComposition} from '@lapxo/topos/contract';
import {configurationValues} from '@lapxo/topos/forms';
import {composeProfile,profileDigest,releaseCategoryPins} from '../src/host/profile-composition.ts';

const caseYes=JSON.parse(readFileSync(new URL('../samples/profile-composition/yes.json',import.meta.url),'utf8'));
const caseNo=JSON.parse(readFileSync(new URL('../samples/profile-composition/no.json',import.meta.url),'utf8'));
const budget={bytes:65536,items:128};
const hash=(x:string)=>'sha256:'+createHash('sha256').update(x).digest('hex');
const row=(scope:string,measure:string,value:string,form='alphabet')=>canonical({scope,measure,value,form,role:'writes',at:'policy:sample',by:'target'});
const error=(code:string)=>(e:any)=>e.code===code;

test('declared release categories select exact artifact pins and refuse absent or ambiguous categories',()=>{
 const digest=hash('archive'),categories=['dep/tool','uses/vocabulary','sources/archive'].map(scope=>({category:scope,class:'artifact',scope,role:'reads' as const,measure:'digest' as const}));
 assert.throws(()=>releaseCategoryPins([{category:categories[0]!.category,class:'other',algorithm:'sha256',digest}],categories,[]),error('release/category-class'));
 const pins=categories.map(c=>({category:c.category,class:c.class,algorithm:'sha256' as const,digest}));
 const lines=categories.map(c=>canonical({scope:c.scope,role:c.role,measure:'digest',form:'alphabet',value:digest,at:'policy:fixture',by:'target'}));
 const ceiling=canonical({scope:'dep/tool',role:'reads',measure:'bytes',form:'interval',value:'0..9',at:'policy:fixture',by:'target'});
 assert.deepEqual(releaseCategoryPins(pins,categories,[...lines,ceiling]),lines);
 assert.throws(()=>releaseCategoryPins(pins,[],lines),error('release/category-missing'));
 assert.throws(()=>releaseCategoryPins(pins,[...categories,categories[0]!],lines),error('release/category-ambiguous'));
 assert.throws(()=>releaseCategoryPins(pins,categories,[...lines,lines[0]!]),error('release/pin-ambiguous'));
 assert.throws(()=>releaseCategoryPins(pins,categories,lines.slice(1)),error('release/pin-missing'));
 assert.throws(()=>releaseCategoryPins([{...pins[0]!,digest:hash('changed')}],categories,lines),error('release/pin-integrity'));
});

test('two unrelated places resolve digest parents with actual admitted signatures and the existing widening judge',()=>{
 const temp=mkdtempSync(join(tmpdir(),'bound-profile-')),pair=generateKeyPairSync('ed25519'),key=join(temp,'device.pem');
 writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 const pub=pair.publicKey.export({type:'spki',format:'der'}).toString('base64');
 const seed=[['keys/device','class','authorize'],['keys/device','coverage','*'],['keys/device','public-key',pub],['keys/device','signer','file'],['keys/reader','class','read'],['keys/folder','class','fold'],['signer/timeout','milliseconds','5000..5000','interval'],['signer/response-bytes','bytes','65536..65536','interval'],['wire/digest-algorithms','id','sha256'],['wire/signature-algorithms','id','ed25519:sample'],['wire/era','id','sample'],['wire/families','id','keys|signer|wire|tree|write|leaf|reader|read|fold|receipts|rendered|resolved|beat|view|region|sample'],['wire/fields','id','scope|role|form|measure|value|by|at|needs|sig|epoch|shape|restsOn|condition|about|kind|view'],['wire/required','id','scope|role|form|measure|value|by|at'],['wire/forms','id','alphabet|interval'],['wire/roles','id','reads|writes|demands'],['wire/at-classes','id','origin|place|receipt|witness|policy']].map(v=>row(...v as [string,string,string,string?]));
 const stamp=(fields:Record<string,string>)=>{const f={...fields,by:'device',epoch:'2'};return canonical({...f,sig:formatSignature('ed25519:sample',sign(null,Buffer.from(signedBytes(f)),pair.privateKey).toString('base64'))})};
 try{for(const name of caseYes.places as string[]){
  const root=join(temp,name);mkdirSync(root);writeFileSync(join(root,'TARGET.bound'),seed.join('\n')+'\n');
  mkdirSync(join(root,'.bound','ledger'),{recursive:true});
  writeFileSync(join(root,'.bound','device.keys'),JSON.stringify({device:{id:'device',publicKey:pub,coverage:['*']}}));
  writeFileSync(join(root,'.bound','ledger','device.bound'),seed.map(line=>{const got=parse(line);assert.equal(got.kind,'fact');return stamp(got.value.fields)}).join('\n')+'\n');
  const archive=hash('artifact'),category={category:'archive',class:'artifact',scope:'sources/archive',role:'reads' as const,measure:'digest' as const};
  const pinned={name:'release',parents:[],fields:[],pins:[{category:'archive',class:'artifact',algorithm:'sha256' as const,digest:archive}],witnesses:[]};
  const bound=stamp({scope:category.scope,role:'reads',form:'alphabet',measure:'digest',value:archive,at:'policy:fixture'});
  assert.deepEqual(composeProfile({root,place:'',profile:pinned,profiles:new Map(),fields:[],statements:[bound],budget,categories:[category]}).releases,[bound]);
  assert.throws(()=>composeProfile({root,place:'',profile:pinned,profiles:new Map(),fields:[],statements:[],budget,categories:[category]}),error('release/pin-missing'));
  for(const role of ['reads','writes'] as const)for(const form of ['interval','alphabet'] as const){
   const coordinate=role+'/'+form,contract=hash(coordinate),value=form==='interval'?caseYes.interval.parent:caseYes.alphabet.parent,narrow=form==='interval'?caseYes.interval.narrow:caseYes.alphabet.narrow,wide=form==='interval'?caseNo.intervalWidening:caseNo.alphabetWidening;
   const field={coordinate,mode:'meet' as const,decode:(v:string)=>configurationValues([{form,value:v}])!.spans[0],lattice:configurationValues([{form,value}])!.L,inhabited:(v:any)=>form==='interval'?v.lo<=v.hi:true};
   const fields=[{contract,field,scope:'sample/'+coordinate,role,form,measure:'count'}];
   const parent={name:'foundation',parents:[],fields:[{coordinate,contract,value}],pins:[],witnesses:[]};
   const bytes=encodeProfileComposition(parent,budget),id=profileDigest(bytes),profiles=new Map([[id,bytes]]);
   const line=(v:string,source:string,at='policy:fixture')=>stamp({scope:fields[0]!.scope,role,form,measure:'count',value:v,restsOn:source,at});
   const inherited=line(value,id);
   const inheritedOnly={name:'local',parents:[id],fields:[],pins:[],witnesses:[]};
   const base={root,place:'',profiles,fields,budget,categories:[]};
   assert.throws(()=>composeProfile({...base,profile:inheritedOnly,fields:[...fields,fields[0]!],statements:[inherited]}),error('profile/ambiguous-field'));
   assert.throws(()=>composeProfile({...base,profile:inheritedOnly,profiles:new Map(),statements:[inherited]}),error('profile/missing-parent'));
   assert.throws(()=>composeProfile({...base,profile:inheritedOnly,statements:[inherited,inherited]}),error('profile/ambiguous-authority'));
   let bindingReads=0;const movingField={...field,get coordinate(){return ++bindingReads<=3?coordinate:'changed-coordinate'}};
   assert.throws(()=>composeProfile({...base,fields:[{...fields[0]!,field:movingField}],profile:inheritedOnly,statements:[inherited]}),error('profile/undeclared-field'));
   if(form==='interval'){
    const disjoint={...inheritedOnly,fields:[{coordinate,contract,value:caseNo.disjointInterval}]};
    assert.throws(()=>composeProfile({...base,profile:disjoint,statements:[inherited]}),error('profile/incompatible'));
   }

   assert.equal(composeProfile({...base,profile:inheritedOnly,statements:[inherited]}).status,'prepared');
   assert.throws(()=>composeProfile({...base,profile:inheritedOnly,statements:[]}),error('profile/authority-required'));
   for(const ownValue of [narrow,wide]){
    const profile={...inheritedOnly,fields:[{coordinate,contract,value:ownValue}]},source=profileDigest(encodeProfileComposition(profile,budget)),ordinary=line(ownValue,source);
    if(ownValue===wide)assert.throws(()=>composeProfile({...base,profile,statements:[inherited,ordinary]}),error('profile/widening-witness-required'));
    else assert.equal(composeProfile({...base,profile,statements:[inherited,ordinary]}).status,'prepared');
    const witnessed=line(ownValue,source,'witness:measured-case');
    assert.equal(composeProfile({...base,profile,statements:[inherited,witnessed]}).status,'prepared');
    assert.throws(()=>composeProfile({...base,profile,statements:[inherited,witnessed.replace('epoch=2','epoch=3')]}),error('profile/authority-required'));
   }
   const added={...inheritedOnly,parents:[],fields:[{coordinate,contract,value:narrow}]},source=profileDigest(encodeProfileComposition(added,budget));assert.equal(composeProfile({...base,profile:added,statements:[line(narrow,source)]}).status,'prepared');
   assert.throws(()=>composeProfile({...base,profiles:new Map([[id,bytes.replace('foundation',caseNo.changedParent)]]),profile:inheritedOnly,statements:[inherited]}),(e:any)=>e.code==='profile/declaration'&&/profile\/integrity/.test(e.message));
  }
 }}finally{rmSync(temp,{recursive:true,force:true})}
});
