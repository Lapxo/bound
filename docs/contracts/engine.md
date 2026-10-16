# Pure object projection

`@lapxo/bound/engine` exports `objectFold` and the existing `ObjectReading`, `ObjectRecord` and `ObjectContext` types. The CLI and receipt paths use that same implementation. Its Obligations 0.3.5 algebra is unchanged.

The input is authenticated and context-admitted effective history with selected deterministic forms and parameters. This function does not admit records, verify signatures, resolve content, run commands, select clocks or write storage. Applications must perform preparation before projection.

Within each epoch, a cell declaration precedes its uses in effective order. A same-epoch act before its cell refuses in preparation by name: `object context: cell not declared before <act-id>`. Lower-epoch cell declarations remain eligible even when their envelope arrives later. Effective sign/join order is preserved; transport arrival does not authorize arbitrary semantic reordering. The consumed Topos contract must be published before this export is admitted for release.

Outputs preserve existing attributed origins, local and travelling marks, exact withdrawals, floor and ceiling parts and REQUIRED/FREE/FORBIDDEN/CONFLICT decisions. Raw object JSON is not a new canonical identity. Byte identity requires the existing declared reading projection.

Malformed or unauthenticated records are outside this pure projector's input contract. Refusal, authority and interrupted-admission vectors exercise the host boundary; they do not claim cryptographic admission inside WASM. No host callback calculates an algebraic result in a WASM comparison.

## Public conformance samples

`samples/engine-interval` and `samples/engine-alphabet` are formed places: TARGET.bound, receipts.bound, package.json, the declared reader.js and inputs/sample.json. The instrument exercises the same projector against prepared fixtures; its reader is not a command users invoke. `fold <sample-directory> --check` verifies each portable receipt. Cold native `fold --as receipts` recomputes the declared conformance reading without a private store.

`samples/no/engine-interval.json` and `samples/no/engine-alphabet.json` are negative data fixtures. Their captured native preparation refusal is `cell not declared before s-B`; no closed receipts are asserted for refusing input. The actual CLI vector is `vectors/engine-object.cli.json`. This conformance reader does not authenticate arbitrary signatures, coverage or clocks.


## Optional WASM host adapter

The optional `@lapxo/bound/wasm` entry evaluates the existing pure projection in QuickJS WASM. It performs no admission, signature verification, state calculation of its own, transport, key discovery or effects. Host authentication must finish before records become projection inputs. A valid digest identifies bytes; it grants no authority or confinement guarantee.

The host supplies the trusted runtime/WASM/module digests, exact byte lengths, entry, aliases and limits. These expectations must come from its accepted configuration, independently of fetched place bytes. Closed request metadata and exact lengths are checked before copying, hashing or worker handoff. Shared assets refuse. Every supplied byte is verified and copied before execution; the closed runtime bundle has no imports and receives the already verified WASM binary. Guest imports resolve only within the verified module map. No second fetch occurs.

`runWasmRequest` returns declared text, without inventing a JSON canonicalization or number policy. The caller's declared entry chooses the serialization contract. Memory and stack limits govern the guest; they do not describe total host/WASM initialization memory. Guest memory, stack and execution budgets are explicit host inputs. Initialization and execution times are separate readings, not a speed guarantee.

`evaluateWasm` runs in a host worker. It accepts an AbortSignal and an explicit worker lifetime. Cancellation, timeout, malformed messages, failed serialization and worker errors terminate the worker and return no successful result. Guest state remains provisional until success; no host write port is supplied. A terminated computation produces no successful receipt. The direct `runWasmRequest` entry has deadline interruption but cannot asynchronously receive an external abort while synchronously executing; callers needing that contract use `evaluateWasm`.


### Native optional WASM projection

The existing object view consumes an optional, authenticated live declaration `engine/object form=alphabet measure=id value=wasm@1`. With no selector it retains the ESM projection; a conflicting or unknown selector refuses. This profile selects only the explicit object view, not every other view of the place. The host admits and folds configuration with the existing authority and withdrawal rules before selecting execution.

The place declares five interval limits: `engine/wasm/memory`, `engine/wasm/stack` and `engine/wasm/response` in bytes; `engine/wasm/execution` and `engine/wasm/worker-lifetime` in milliseconds. Missing, ambiguous or invalid limits refuse; there is no inferred fallback. The installed instrument binds the guest module and supported form standings to their context implementation artifacts. A place cannot choose another verifier or executable through this selection; an unsupported form or different implementation refuses.

Context initialization is measured before place execution. If observed initialized guest memory exceeds the declared memory budget, the operation refuses without running place code. Host initialization memory is outside that guest execution limit; the worker lifetime bounds the entire attempt. During execution the unchanged declared memory, stack and execution limits apply. SIGINT reaches the worker cancellation port; cancellation or failure emits no successful object result.

For the opt-in `wasm@1` profile, the host verifies the selected context implementation before importing it. Every SHA-256 member declared by the context offer’s `restsOn` is checked by digest, and the existing `moduleClosure` validates the imported closure. Missing, altered, undeclared or unresolved imported members refuse before context code executes. This establishes content identity and import closure, not correctness, authority or sandbox confinement. Admission still precedes projection, and this check grants no permission to reuse a retained answer as current.
