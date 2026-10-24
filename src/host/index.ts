/** Native host boundary. Uses the same admission and projection as the CLI. */
export {readRootStandingInProcess} from './in-process.ts';
export type {RootStandingHostContext,RootStandingHostResult} from './in-process.ts';
export {readContextualStandingInProcess} from './in-process-context.ts';
export {landPlaceActInProcess,recoverPlaceActInProcess} from './in-process-act.ts';
export type {PlaceActHostContext,PlaceActHostPorts} from './in-process-act.ts';
export {landRootLotInProcess,recoverRootActInProcess,rootLotSnapshot} from './in-process-root.ts';
export type {RootLotContext,RootLotPorts} from './in-process-root.ts';
export {nativeHostInstrument,installedHostInstrument,nativePlaceActReceiver} from './native-receiver.ts';
export type {NativeHostInstrument} from './native-receiver.ts';
export type {HostInstrumentRuntime} from './call-context.ts';
export {nativePlaceActPersistence} from './ports/place-act.ts';
export type {PlaceActTrust,PlaceActBudget} from './ports/place-act.ts';
export type {PlaceActPersistence} from './place-act-transaction.ts';
export type {PublicationStorage} from './ports/publication.ts';
export {prepareNativeReadingIdentity,prepareNativeViewIdentity,prepareNativeViewIdentities} from './reading-identity.ts';
export type {NativeReadingIdentityContext,NativeReadingIdentityResult,ReadingPreparationLimits,ReadingPreparationResult,PreparedReading,NativeViewIdentityContext,NativeViewIdentityResult,NativeViewIdentitiesContext,NativeViewIdentitiesResult} from './reading-identity.ts';

export {prepareNativeProbe} from './native/probes.ts';
export type {NativeProbeForm,NativeProbeCounter,NativeProbePort,NativeProbeContext,NativeProbeResult} from './native/probes.ts';
export {physicalLinesRegions,readPlacePhysicalLines,authenticatePhysicalLinesWitness,judgePhysicalLines} from './physical-lines.ts';
export type {PhysicalLinesRegion,PhysicalLinesPolicy,PhysicalLinesPlaceInput,PhysicalLinesReading,ReadingProducerPolicy,PhysicalLinesWitnessAuthority} from './physical-lines.ts';
export {composeProfile,profileDigest,releaseCategoryPins} from './profile-composition.ts';
export type {ProfileCompositionRequest,ProfileFieldBinding,ReleaseCategory} from './profile-composition.ts';
export {installedPackageIdentity} from './native/installed-package.ts';
export type {InstalledPackageRequest,InstalledPackageMember,InstalledPackagePin} from './native/installed-package.ts';
export {prepareNativeAuthorityCard,answerNativeAuthorityCard,nativeAuthorityRequestIdentity,parseNativeAuthorityCardRequest} from './native/authority-card.ts';
export type {NativeAuthorityAction,NativeAuthorityCardContext,NativeAuthorityJudgment,NativeAuthorityCardValue,NativeAuthorityCardRequest} from './native/authority-card.ts';
export {nativeAuthorityCardView} from './native/authority-card-view.ts';
export {startNativeHost,nativeHostEnvironment} from './persistent-host.ts';
export type {NativeCommandHost,NativeHostOptions,NativeHostLimits,NativeCommand,NativeCommandResult} from './persistent-host.ts';

export type {HTTPReceiverPolicy,HTTPHop} from './adapters/transport/http.ts';
