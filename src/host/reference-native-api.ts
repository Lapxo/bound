/** Native host boundary. The platform-free reference inspector remains /reference. */
export {openAuthenticatedReference} from './reference-native.ts';
export {exportAuthenticatedReference} from './reference-export.ts';
// Inspect uses the same bounded transport and unauthenticated interpretation
// as the CLI; it neither folds encounters nor grants trust to the carrier.
export {inspectReference} from './reference.ts';
