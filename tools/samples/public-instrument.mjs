import {mkdtempSync,mkdirSync,linkSync,readdirSync,renameSync,readFileSync,writeFileSync,existsSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {publicationOf,parse} from '@lapxo/topos/wire';

/** Test the public instrument's standing, not the authorship ledger of the build checkout.
 * Dry runs link verified content-addressed implementation bytes; they never copy an instrument tree or node_modules. Library resolution shares installed dependencies for this source conformance vector.
 * This is not installed-package acceptance; that witness uses the exact npm archive.
 */
const content=join(tmpdir(),'bound-sample-content');
function overlay(bytes,to){const hex=createHash('sha256').update(bytes).digest('hex'),from=join(content,hex);mkdirSync(content,{recursive:true});if(!existsSync(from)){const next=from+'.'+process.pid;writeFileSync(next,bytes,{mode:0o444});renameSync(next,from);}if(!readFileSync(from).equals(bytes))throw Error('REFUSE·sample content digest differs '+hex);mkdirSync(dirname(to),{recursive:true});linkSync(from,to);}
function overlayTree(from,to){for(const entry of readdirSync(from,{withFileTypes:true})){const a=join(from,entry.name),b=join(to,entry.name);if(entry.isDirectory())overlayTree(a,b);else if(entry.isFile())overlay(readFileSync(a),b);else throw Error('REFUSE·sample non-file implementation member');}}
export async function publicInstrument(reader) {
 const source=dirname(dirname(dirname(reader))),root=mkdtempSync(join(tmpdir(),'bound-public-instrument-'));
 try {
  const {ownLock,ownStore}=await import(pathToFileURL(join(source,'dist/observe/runner.js')).href);
  const published=publicationOf(ownLock());
  overlayTree(join(source,'dist'),join(root,'dist'));
  writeFileSync(join(root,'TARGET.bound'),published.join('\n')+'\n');
  overlay(readFileSync(join(source,'package.json')),join(root,'package.json'));
  symlinkSync(join(source,'node_modules'),join(root,'node_modules'),'dir');
  const store=join(root,'.bound');mkdirSync(join(store,'ledger'),{recursive:true});mkdirSync(join(store,'cas/blobs'),{recursive:true});
  const wanted=new Set(published.map(parse).filter(p=>p.kind==='fact'&&p.value.fields.scope.startsWith('dep/')&&p.value.fields.value.includes(':')).map(p=>p.value.fields.value));
  for(const digest of wanted){const [algorithm,hex]=digest.split(':');const from=join(ownStore(),'cas/blobs',hex);// Preserve absence: the product CLI still resolves and refuses a missing named dependency if it asks for it.
   if(!existsSync(from))continue;const bytes=readFileSync(from);if(createHash(algorithm).update(bytes).digest('hex')!==hex)throw Error('REFUSE·sample instrument blob mismatch '+digest);overlay(bytes,join(store,'cas/blobs',hex));}
  const entry=join(root,'dist/cli/verb.js');if(!readFileSync(entry).equals(readFileSync(reader)))throw Error('REFUSE·sample instrument reader bytes differ');
  return {reader:entry,close:()=>rmSync(root,{recursive:true,force:true})};
 }catch(error){rmSync(root,{recursive:true,force:true});throw error;}
}
