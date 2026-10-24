# Receipt materialization selection

Receipt-only publication and the native full fold use the same declared selection of materialized outputs. A view explicitly declared not to materialize a leaf is outside that leaf guard, or refuses by name if that selection is unsupported.

A renderer returning no output because of failure, invalid inputs, unavailable content or exhausted resources is not a declaration that the view does not materialize. No guard may silently skip an expected leaf on that basis.

A legitimately nonmaterializing view permits PASS closed only when all other obligations are paid. An expected selected leaf that is absent, altered, stale or failed to render must not pass closed. Preserve the existing byte-corruption and stale-output negatives. Do not remove views, rewrite history or enlarge a ceiling to make the check pass.

Keep one output-selection implementation for fold and receipts. The neutral fixtures specify selection and effects, not a second renderer or a new form.

## Acceptance

The language-independent vectors are in `vectors/contracts/receipt-output-selection.json`. They specify required observations and effects; they do not certify the baseline implementation. Native runtime conformance requires separately captured execution evidence in two unrelated places. Existing valid evidence is retained, and no zero demand is created by publishing this contract.
