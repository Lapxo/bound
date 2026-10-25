import type {ReadingIdentityContext} from '@lapxo/topos/contract';
export interface ReadingPreparationLimits {readonly bytes:number;readonly files:number;readonly readings:number;readonly probes:number;readonly signal?:AbortSignal}
export type PreparedReading={readonly scope:string;readonly kind:'ready';readonly identity:string;readonly context:ReadingIdentityContext;readonly receipt?:string}|{readonly scope:string;readonly kind:'needs';readonly needs:readonly string[]};
export type ReadingPreparationResult={readonly kind:'fact';readonly readings:readonly PreparedReading[];readonly probes:number;readonly verifiedBytes:number;readonly retained:number}|{readonly kind:'needs';readonly needs:readonly string[]}|{readonly kind:'refuse';readonly code:string;readonly diagnostic:string};
