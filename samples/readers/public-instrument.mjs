import {mkdtempSync,mkdirSync,linkSync,readdirSync,renameSync,readFileSync,writeFileSync,existsSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {publicationOf,parse} from '@lapxo/topos/wire';

/** Test the public instrument's standing, not the authorship ledger of the build checkout.
 * Dry runs link verified content-addressed implementation bytes; they never copy an instrument tree or node_modules. Library resolution shares installed dependencies for this source conformance vector.
 * Content lives only for this client's lifetime and is removed on close or failure.
 * This is not installed-package acceptance; that witness uses the exact npm archive.
 */
function overlay(bytes,to,content){const hex=createHash('sha256').update(bytes).digest('hex'),from=join(content,hex);mkdirSync(content,{recursive:true});if(!existsSync(from)){const next=from+'.'+process.pid;writeFileSync(next,bytes,{mode:0o444});renameSync(next,from);}if(!readFileSync(from).equals(bytes))throw Error('REFUSE·sample content digest differs '+hex);mkdirSync(dirname(to),{recursive:true});linkSync(from,to);}
function overlayTree(from,to,content){for(const entry of readdirSync(from,{withFileTypes:true})){const a=join(from,entry.name),b=join(to,entry.name);if(entry.isDirectory())overlayTree(a,b,content);else if(entry.isFile())overlay(readFileSync(a),b,content);else throw Error('REFUSE·sample non-file implementation member');}}
export async function publicInstrument(reader) {
 const source=dirname(dirname(dirname(reader))),parent=mkdtempSync(join(tmpdir(),'bound-public-instrument-')),root=join(parent,'instrument'),content=join(parent,'content');
 try {
  mkdirSync(root);
  const {ownLock,ownStore}=await import(pathToFileURL(join(source,'dist/observe/runner.js')).href);
  const published=publicationOf(ownLock());
  overlayTree(join(source,'dist'),join(root,'dist'),content);
  overlayTree(join(source,'vendor','syntax'),join(root,'vendor','syntax'),content);
  writeFileSync(join(root,'TARGET.bound'),published.join('\n')+'\n');
  overlay(readFileSync(join(source,'package.json')),join(root,'package.json'),content);
  overlay(readFileSync(join(source,'docs/contracts/refusals.bound')),join(root,'docs/contracts/refusals.bound'),content);
  symlinkSync(join(source,'node_modules'),join(root,'node_modules'),'dir');
  const store=join(root,'.bound');mkdirSync(join(store,'ledger'),{recursive:true});mkdirSync(join(store,'cas/blobs'),{recursive:true});
  const wanted=new Set(published.map(parse).filter(p=>p.kind==='fact'&&p.value.fields.scope.startsWith('dep/')&&p.value.fields.value.includes(':')).map(p=>p.value.fields.value));
  for(const digest of wanted){const [algorithm,hex]=digest.split(':');const from=join(ownStore(),'cas/blobs',hex);// Preserve absence: the product CLI still resolves and refuses a missing named dependency if it asks for it.
   if(!existsSync(from))continue;const bytes=readFileSync(from);if(createHash(algorithm).update(bytes).digest('hex')!==hex)throw Error('REFUSE·sample instrument blob mismatch '+digest);overlay(bytes,join(store,'cas/blobs',hex),content);}
  const entry=join(root,'dist/cli/verb.js');if(!readFileSync(entry).equals(readFileSync(reader)))throw Error('REFUSE·sample instrument reader bytes differ');
  return {reader:entry,close:()=>rmSync(parent,{recursive:true,force:true})};
 }catch(error){rmSync(parent,{recursive:true,force:true});throw error;}
}
