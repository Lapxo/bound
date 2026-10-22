# Profile composition and release categories

`composeProfile` prepares an authenticated lot without admission or persistence. It reads Topos `topos-profile-composition/1` records, resolves every parent from its exact SHA-256 digest and delegates form composition to Topos. The digest preimage is the canonical profile line followed by one newline.

A parent record supplies declarations, never authority. Each inherited and local field requires exactly one original signed statement whose scope, role, form, measure and value match its selected binding and whose `restsOn` names the exact profile digest containing it. The current consumer lock supplies admitted signers, signature algorithms, windows and region coverage through Bound's existing authority evaluator. No parent can grant a signer coverage.

Narrowing and additions require those signatures. Interval and alphabet widening use Bound's existing widening judge: the authorized statement must carry the witness-class `at` selected by the consumer's wire. A parsed Topos reading-witness record alone does not satisfy this rule. This is the existing admission witness convention, not independent verification of scientific provenance. Preparation does not pay inertness, observations, admission gates or owner receipts; ordinary admission remains required.

`releaseCategoryPins` selects exact artifact lines by declared category, class, scope, role and digest measure. It accepts only alphabet digest bindings. It never selects a numeric code ceiling, and has no package-family prefix list. `composeProfile` selects category lines from the same authenticated statement set. Callers of the standalone selector must supply already authenticated standing. Dependency, vocabulary and source archive categories can each declare their own exact scopes.

Missing and ambiguous categories refuse as `release/category-missing` and `release/category-ambiguous`; absent, ambiguous and mismatched artifact bindings refuse as `release/pin-missing`, `release/pin-ambiguous` and `release/pin-integrity`. A class mismatch refuses as `release/category-class`. Profile authority, widening and unresolved parents refuse as `profile/authority-required`, `profile/widening-witness-required` and `profile/missing-parent`. Topos record/integrity refusals preserve their existing named causes.

The returned lines retain inherited evidence and local statements; they are a preparation result, not a claim that an authorized widening erased an ancestor's meet constraint. Topos' declared composition remains authoritative for the effective intersection. Applications that intend a revision must use the ordinary admission flow to revise standing explicitly.

## Declared native case inputs and outputs

The published yes/no JSON files are actual parameters read by `test/profile-composition.test.ts`. Each native procedure retains its semantic assertions and unrelated disposable places. The vector invokes that procedure through the existing Node test reader. The input JSON declares exact case source strings and negative argument values; generated source, output and receipt bytes are read and checked by that same procedure. These public parameter fixtures contain no retained private authority history. Passing test output is not a real Root receipt or permission to admit a lot.
