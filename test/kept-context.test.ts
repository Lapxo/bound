import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {canonical} from '@lapxo/topos/wire';
import {land,landShard} from '../src/land/ledger.ts';
import {keepFold,keptPlace} from '../src/fold/kept.ts';
import type {PlaceFold} from '../src/cli/place.ts';

test('a completed reader invalidates the cached verdict without changing project leaves',()=>{
 const root=mkdtempSync(join(tmpdir(),'fold-journal-')),store=join(root,'.bound');
 try {
  mkdirSync(store);writeFileSync(join(root,'leaf.txt'),'unchanged');
  const pair=generateKeyPairSync('ed25519');
  const signed=(scope:string,measure:string,value:string)=>{
   const fields={scope,measure,value,form:'alphabet',role:'writes',at:'policy:fixture',by:'device',epoch:'1'};
   return canonical({...fields,sig:'ed25519:fixture:'+sign(null,Buffer.from(canonical(fields)),pair.privateKey).toString('base64')});
  };
  land(store,'device',[signed('keys/observer','class','read'),signed('wire/digest-algorithms','id','sha256')]);
  // A private fold-cache fixture, never a receipt or payment certificate.
  const fold={standing:[],observed:[],grey:[],refused:[],demands:[],paid:[],missing:[],history:[],orphans:[],signed:new Map(),claims:1} as unknown as PlaceFold;
  keepFold(store,'before',fold,['place .']);
  assert.equal(keptPlace(store)?.claims,1);
  land(store,'unrelated',[signed('unrelated/note','id','present')]);
  assert.equal(keptPlace(store)?.claims,1,'an unrelated journal cannot invalidate reader context');
  const reading=canonical({scope:'measurement/x',measure:'count',value:'0..0',form:'interval',role:'reads',at:'place:x',by:'observer'});
  landShard(store,'observer','sector', [reading]);
  assert.equal(keptPlace(store),undefined,'new native reading must not retain an earlier verdict');
  keepFold(store,'after',fold,['place .']);
  assert.equal(keptPlace(store)?.claims,1);
  landShard(store,'observer','sector', [reading]);
  assert.equal(keptPlace(store)?.claims,1,'redelivery leaves the journal and cache unchanged');
 } finally {rmSync(root,{recursive:true,force:true});}
});
