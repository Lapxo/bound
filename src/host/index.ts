/** Native host boundary. Uses the same admission and projection as the CLI. */
export {readRootStandingInProcess} from './in-process.ts';
export type {RootStandingHostContext,RootStandingHostResult} from './in-process.ts';
export {readContextualStandingInProcess} from './in-process-context.ts';
export {landPlaceActInProcess,recoverPlaceActInProcess} from './in-process-act.ts';
export type {PlaceActHostContext,PlaceActHostPorts} from './in-process-act.ts';
export {landRootLotInProcess,recoverRootActInProcess,rootLotSnapshot} from './in-process-root.ts';
export type {RootLotContext,RootLotPorts} from './in-process-root.ts';
export {nativeHostInstrument,nativePlaceActReceiver} from './native-receiver.ts';
export type {NativeHostInstrument} from './native-receiver.ts';
export type {HostInstrumentRuntime} from './call-context.ts';
export {nativePlaceActPersistence} from './ports/place-act.ts';
export type {PlaceActTrust,PlaceActBudget} from './ports/place-act.ts';
export type {PlaceActPersistence} from './place-act-transaction.ts';
export type {PublicationStorage} from './ports/publication.ts';
export {prepareNativeReadingIdentity} from './reading-identity.ts';
export type {NativeReadingIdentityContext,NativeReadingIdentityResult,ReadingPreparationLimits,ReadingPreparationResult,PreparedReading} from './reading-identity.ts';
