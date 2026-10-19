import {wireLine} from '../fold/wire.ts';
import {fieldOf} from '../fold/claims.ts';

/** Pure signature vocabulary; no instrument discovery for diagnostics. */
export function signatureEraOf(standing: readonly string[]): { readonly admitted: readonly string[]; readonly era: string } {
  const said = wireLine(standing, 'signature-algorithms');
  const admitted = (said === undefined ? [] : fieldOf(said, 'value').split('|')).filter(Boolean);
  const current = wireLine(standing, 'era');
  const era = (current === undefined ? undefined : admitted.find((one) => one.endsWith(`:${fieldOf(current, 'value')}`))) ?? admitted.find((one) => one.includes(':'));
  if (era === undefined) throw new Error(`REFUSE·runtime the lock names no signature algorithm by digest: nothing can be signed here`);
  return { admitted, era };
}
