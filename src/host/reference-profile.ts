/** reference-profile@1: platform URL parsing, no authority or transport effects. */
export interface StandingReference {readonly class:'standing';readonly algorithm:'sha256';readonly digest:string;readonly blob:string;readonly source:string}
interface InspectionPort {readonly maxBytes:number;readonly readSemanticStanding:(bytes:string)=>readonly string[];readonly semanticStandingBytes:(lines:readonly string[])=>string;readonly digestBytes:(bytes:Uint8Array)=>string}

const hex = /^[0-9a-f]{64}$/;
const refuse = (cause:string):never => { throw Error(`REFUSE·reference ${cause}`); };
const keys = ['class', 'algorithm', 'digest', 'blob', 'source'] as const;
function check(reference:StandingReference):StandingReference {
  if (Object.keys(reference).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(reference, key))) refuse('fields');
  if (reference.class !== 'standing') refuse('unknown class');
  if (reference.algorithm !== 'sha256') refuse('unknown algorithm');
  if (!hex.test(reference.digest) || !/^sha256:[0-9a-f]{64}$/.test(reference.blob)) refuse('digest');
  let source: URL;
  try { source = new URL(reference.source); } catch { return refuse('source URL'); }
  if (source.username || source.password || source.hash) refuse('source credentials or fragment');
  if (source.href !== reference.source) refuse('noncanonical source URL');
  return reference;
}
export function encodeReference(reference:StandingReference):string {
  check(reference);
  return '#bound:1?' + keys.map(key => key + '=' + encodeURIComponent(reference[key])).join('&');
}
export function decodeReference(fragment:string):StandingReference {
  if (!fragment.startsWith('#bound:1?')) refuse('profile');
  const parameters = new URLSearchParams(fragment.slice('#bound:1?'.length));
  if ([...parameters].length !== keys.length || new Set(parameters.keys()).size !== keys.length) refuse('duplicate or missing field');
  const reference = check(Object.fromEntries(parameters) as unknown as StandingReference);
  if (encodeReference(reference) !== fragment) refuse('noncanonical encoding');
  return Object.freeze(reference);
}
export function inspectReferenceBytes(reference:StandingReference,bytes:Uint8Array,{maxBytes,readSemanticStanding,semanticStandingBytes,digestBytes}:InspectionPort) {
  if (bytes.byteLength > maxBytes) refuse('bytes budget');
  if (digestBytes(bytes) !== reference.blob.slice(7)) refuse('blob integrity');
  let document;
  try { document = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); } catch { refuse('document'); }
  if (document === null || typeof document !== 'object' || document.profile !== 'semantic-standing@1' || typeof document.standing !== 'string' || Object.keys(document).length !== 2) refuse('document profile');
  if (new TextDecoder('utf-8', {fatal:true}).decode(bytes) !== JSON.stringify({profile:document.profile,standing:document.standing})) refuse('noncanonical document wrapper');
  const lines = readSemanticStanding(document.standing);
  const semantic = semanticStandingBytes(lines);
  if (digestBytes(new TextEncoder().encode(semantic)) !== reference.digest) refuse('standing identity');
  return {reference, lines, standing:semantic, authentication:'not demonstrated; inspect only'};
}
