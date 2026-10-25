import type {PlaceFold} from './place.ts';
import {foldCeilings, ceilingSummary} from '../fold/ceilings.ts';
import {currentActReadings} from '../fold/own.ts';
import {placedReadings} from '../fold/observed.ts';
import {placesIn} from '../fold/places.ts';
import {releasePolicy, releaseFaults} from '../fold/release-policy.ts';
import {attestationObservations} from '../fold/evidence.ts';
import {topos_wire_parse as parse} from "../../vendor/library.js";
import {obligations_field_point as point, obligations_field_region as region, obligations_field_within as within} from "../../vendor/library.js";

/** A verified semantic fold can be reused. Its previous act's measurements cannot.
 * Keep history intact and judge current measurements with the ordinary interpreters.
 */
export function refreshRetainedJudgment(prior: PlaceFold, ceilings: readonly string[], current: Readonly<Record<string, number>> = currentActReadings(prior.under)): PlaceFold {
  const own = {...prior.own, ...current};
  const readings = foldCeilings({standing: prior.standing, ceilings, observed: prior.observed,
    own, epoch: prior.epoch, ...(prior.under ? {under: prior.under, places: new Set(placesIn(prior.root))} : {})});
  const standing = prior.standing.filter(line => !prior.grey.includes(line) && !prior.refused.includes(line));
  const shared = new Set(prior.under ? placedReadings(prior.observed)
    .filter(reading => !within(point(reading.place.replace(/\/\*$/, '')), region(prior.under!)))
    .map(reading => reading.question) : []);
  return {...prior, kept: true, own, ceilings: ceilingSummary(readings, ceilings.length, shared),
    release: releasePolicy({standing, demands: prior.demands, paid: prior.paid, ceilings, readings,
      faults: releaseFaults(prior),
      verdicts: attestationObservations(standing.map(line => {const got = parse(line); return got.kind === 'fact' ? got.value.fields : {}; }), prior.second),
      snapshot: {fold: prior.key, instrument: prior.instrument}})};
}
