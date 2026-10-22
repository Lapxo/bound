# Physical lines and reading witnesses

The host adapter `readPlacePhysicalLines` reads every regular file inside explicitly named inventory boundaries. It has no implicit exclusions. Files outside every selected region are returned by name in `stray`. Missing selectors remain unmeasured by scope and selector, including a missing selector beside another selector that matched. Links, special files, incomplete inventories and exhausted resources cannot produce a complete reading.

Counts, selectors and finite region valuation delegate to Topos `readPhysicalLines`. Empty files contain zero physical lines. Blank and comment lines count; LF and CRLF delimit lines; an unterminated final line counts. Isolated carriage returns and invalid UTF-8 refuse. Overlapping regions retain Topos overlap evidence and are never certified disjoint by this adapter.

`physicalLinesRegions` projects selectors from the consuming place's already admitted standing. A `core/lines` interval reads the `region/core` coordinates declaration. Other region names follow the same rule. No application or directory family is built into the adapter. The caller must choose and authorize the finite inventory boundaries and resource policy.

`judgePhysicalLines` delegates interval thresholds to the existing Bound `foldCeilings` and policy widening to `widenedWithoutWitness`. It accepts `lines` and `file-lines`; file observations retain their actual coordinate. Over-ceiling observations or unauthenticated widening produce `BLOCK`. Missing selection or stray files produce `UNMEASURED`. No declared line ceiling produces `UNMEASURED`.

Reading witness syntax is Topos `topos-reading-witness/1`. Every reading, model, input, selection, unit, scale, resolution, reader, implementation, context, run and result field must match this actual reading. Actual reading handles are immutable and local to the host process; parsing a serialized reading cannot recreate a trusted handle.

The consuming host supplies `PhysicalLinesWitnessAuthority` from its admitted current producer policy and evidence verifier. Key evidence must match the declared key and coverage. CI evidence must match repository, commit, workflow, run and attempt before proof verification is invoked. The proof port must authenticate evidence over the exact Topos statement bytes. Neither a URL nor valid syntax establishes authority. The adapter supplies no default trust rule, key store, network provenance lookup, admission, persistence, signing or publication.

After successful proof verification, `authenticatePhysicalLinesWitness` returns the exact `attest:sha256:...` coordinate that a proposed widening must name. A coordinate with the right prefix, without verified matching evidence, remains blocked. Integrating the adapter into an owner-authorized landing transaction remains the consuming host's responsibility; `READY` is a native judgment, not a persisted landing or admission.

## Declared native case inputs and outputs

The published yes/no JSON files are actual parameters read by `test/physical-lines-place.test.ts`. Each native procedure retains its semantic assertions and unrelated disposable places. The vector invokes that procedure through the existing Node test reader. The input JSON declares exact case source strings and negative argument values; generated source, output and receipt bytes are read and checked by that same procedure. These public parameter fixtures contain no retained private authority history. Passing test output is not a real Root receipt or permission to admit a lot.
