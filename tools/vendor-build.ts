import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {join,dirname,relative,posix} from 'node:path';
import ts from 'typescript';
import {sha256} from '../src/host/hash.ts';
import {archiveCoordinate} from '../src/host/archive.ts';

interface Member {coordinate:string;source:string;digest:string}
interface Package {name:string;version:string;archive:string;manifest:{source:string;digest:string};license:{source:string;digest:string};files:Member[]}

/** Build-only relocation. The compiler locates actual import/export literals;
 * it does not replace strings in program data, prune code or implement algebra.
 * Dynamic host ports retain their original expressions and authority checks.
 */
export function relocateImports(source:string,file:string,select:(name:string,types:boolean)=>string|undefined):string {
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.ESNext,true,file.endsWith('.d.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);
 const edits:{start:number;end:number;text:string}[]=[];
 const use=(literal:ts.Node|undefined)=>{
  if(!literal||!ts.isStringLiteral(literal))return;
  const target=select(literal.text,file.endsWith('.d.ts'));if(!target)return;
  const module=file.endsWith('.d.ts')&&target.endsWith('.d.ts')?target.slice(0,-5)+'.js':target;
  let name=relative(dirname(file),module).split('\\').join('/');if(!name.startsWith('.'))name='./'+name;
  edits.push({start:literal.getStart(tree),end:literal.getEnd(),text:JSON.stringify(name)});
 };
 const visit=(node:ts.Node):void=>{
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))use(node.moduleSpecifier);
  else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments.length===1)use(node.arguments[0]);
  else if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument))use(node.argument.literal);
  ts.forEachChild(node,visit);
 };
 visit(tree);
 for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
 return source;
}

/** All archive-owned code is retained. This is vendoring, not a certificate that
 * the host's world-loading port is a closed static ESM program. */
export function vendorBuild(root:string):readonly string[]{
 const pins=JSON.parse(readFileSync(join(root,'vendor/dependencies.json'),'utf8'));
 const check=(source:string|Uint8Array,digest:string)=>{if(sha256(source)!==digest)throw Error('Vendor build bytes differ')};
 for(const member of [pins.syntax,pins.syntax.license])check(readFileSync(join(root,'vendor',member.file)),member.digest);
 const bytes=readFileSync(join(root,'vendor',pins.sources.path));check(bytes,pins.sources.digest);
 const held=JSON.parse(bytes.toString());if(held.format!=='pinned-package-sources/1')throw Error('Vendor source format differs');
 const packages=held.packages as Package[],targets=new Map<string,{pkg:Package;manifest:Record<string,unknown>;base:string}>();
 const generated:string[]=[];
 for(const pkg of packages){
  const pin=pins.packages.find((p:{name:string})=>p.name===pkg.name);
  if(!pin||pin.version!==pkg.version||pin.digest!==pkg.archive||targets.has(pkg.name))throw Error('Vendor package selection differs');
  check(pkg.manifest.source,pkg.manifest.digest);check(pkg.license.source,pkg.license.digest);
  const manifest=JSON.parse(pkg.manifest.source);
  if(manifest.name!==pkg.name||manifest.version!==pkg.version||manifest.type!=='module')throw Error('Vendor manifest identity differs');
  const base=join(root,'dist/vendor',pkg.archive.slice('sha256:'.length));
  const seen=new Set<string>();
  for(const member of pkg.files){
   archiveCoordinate(member.coordinate);if(!member.coordinate.startsWith('dist/')||seen.has(member.coordinate))throw Error('Vendor coordinate differs');
   seen.add(member.coordinate);check(member.source,member.digest);
   const at=join(base,member.coordinate);mkdirSync(dirname(at),{recursive:true});writeFileSync(at,member.source);
   if(at.endsWith('.d.ts'))generated.push(relative(root,at));
  }
  mkdirSync(base,{recursive:true});writeFileSync(join(base,'LICENSE'),pkg.license.source);
  targets.set(pkg.name,{pkg,manifest,base});
 }
 if(targets.size!==pins.packages.length)throw Error('Vendor package absent');
 const select=(name:string,types:boolean):string|undefined=>{
  const owner=[...targets.keys()].sort((a,b)=>b.length-a.length).find(n=>name===n||name.startsWith(n+'/'));if(!owner)return;
  const one=targets.get(owner)!,subpath=name===owner?'.':'./'+name.slice(owner.length+1),offered=(one.manifest.exports as Record<string,unknown>)?.[subpath];
  if(offered&&typeof offered==='object'&&Object.keys(offered).some(k=>!['types','source','default'].includes(k)))throw Error('Vendor export conditions unsupported '+name);
  const value=typeof offered==='string'?offered:offered&&typeof offered==='object'?(offered as Record<string,unknown>)[types?'types':'default']:undefined;
  if(typeof value!=='string'||!value.startsWith('./'))throw Error('Vendor export absent '+name);
  const coordinate=posix.normalize(value.slice(2));archiveCoordinate(coordinate);
  const at=join(one.base,coordinate);if(!existsSync(at))throw Error('Vendor export bytes absent '+name);return at;
 };
 const relocations=[];
 for(const coordinate of readdirSync(join(root,'dist'),{recursive:true}) as string[]){
  if(!coordinate.endsWith('.js')&&!coordinate.endsWith('.d.ts'))continue;
  const at=join(root,'dist',coordinate),source=readFileSync(at,'utf8'),next=relocateImports(source,at,select);
  if(next!==source){writeFileSync(at,next);relocations.push({coordinate:'dist/'+coordinate,original:sha256(source),relocated:sha256(next)})}
 }
 writeFileSync(join(root,'dist/vendor/sources.json'),JSON.stringify({format:'relocated-package-sources/1',sources:pins.sources.digest,packages:pins.packages.map((p:{name:string;digest:string})=>({name:p.name,archive:p.digest})),relocations})+'\n');
 return generated;
}
