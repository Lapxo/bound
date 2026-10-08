import {randomUUID} from 'node:crypto';
import {closeSync,fsyncSync,mkdirSync,openSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {requireEffects} from '../read-only.ts';

export interface PublicationStorage {publish(staged: string, committed: string): void}
const syncDirectory = (path: string): void => {
  const fd=openSync(path,'r');try{fsyncSync(fd)}finally{closeSync(fd)}
};
export const nativePublicationStorage: PublicationStorage = {
  publish(staged,committed){renameSync(staged,committed);syncDirectory(dirname(committed))},
};

/** Publish prepared bytes as one directory. No identity, grammar or authority
 * is inferred here. Readers address the committed name, never staging files.
 * A failure after rename is not evidence of rollback: the caller must retain
 * the uncertainty and allow a verified read of the committed name.
 */
export function publishBundle(committed: string, files: Readonly<Record<string,string>>,
  storage: PublicationStorage = nativePublicationStorage): void {
  requireEffects('atomic publication');
  const entries=Object.entries(files);
  if(!entries.length || entries.some(([name])=>!name || name==='.' || name==='..' || /[\\/\0]/.test(name))) {
    throw Error('REFUSE·commit invalid publication members');
  }
  const root=dirname(committed);
  const created=mkdirSync(root,{recursive:true});
  // Persist newly created directory entries up to their existing parent too.
  if(created!==undefined)for(let at=root;;at=dirname(at)){
    syncDirectory(at);if(at===dirname(created))break;
  }
  const staged=join(root,'.stage-'+randomUUID());
  mkdirSync(staged,{mode:0o700});
  try {
    for(const [name,bytes] of entries){
      const fd=openSync(join(staged,name),'wx',0o600);
      try{writeFileSync(fd,bytes);fsyncSync(fd)}finally{closeSync(fd)}
    }
    syncDirectory(staged);
    storage.publish(staged,committed);
  } finally {rmSync(staged,{recursive:true,force:true})}
}
