# Public reading identity

`prepareNativeReadingIdentity` from `@lapxo/bound/host` prepares the adopted input-projection readings of an authenticated place. `fold --as reading-identity` calls that same operation. This contract covers adopted input-projection readings; other reading forms refuse.

The receiver supplies the place, explicit native instrument, optional adopted reader selector, finite resource limits and cancellation signal. The place must declare one interval `0..N` for each of `reading-identity/bytes`, `/files`, `/readings` and `/probes`. Caller limits can reduce these bounds. They count handed UTF-8 input bytes, handed files, projected reading plans and input-projection requests across the selected readers; native image, response and execution limits also remain in force. The projection request is a probe, even when its implementation reuses a valid result. It is separate from final reading execution.

A fact contains preparations with ready reading identities or named unpaid receipt dependencies. Each ready entry gives its scope, canonical `reading-context@1` and digest. When a verified existing carrier is available it also gives the `reading-receipt@1` digest. A missing physical input produces `needs`; a dependent reading without its predecessor's verified receipt stays open. No complete digest is invented for an unpaid dependency. These names are supplied by the selected world's projection; application region names are not built into Bound.

Preparation uses the same projection, dependency order, contextual framing, transitive instrument inputs, policy, effective environment and carrier verification as execution. It can run the declared input projection under its native port. It never runs the final reading, signs, admits an act, renders public receipts or renews a reading receipt. Operational image/cache maintenance is separate. A subsequent execution under identical inputs and context commits the same identity; preparation does not reserve that identity or authorize a future answer.

Instrument, implementation, policy, transitive inputs and the actual environment participate under the existing Topos contracts. Current-answer authorization also retains the existing principal, grant, snapshot and freshness checks when that profile is selected. Retained evidence grants no current authority. Environment values are committed by digest, not exposed as secret strings. Receipt identity and typed-content identity remain distinct.

Relevant input or dependency changes produce another identity. Unconsumed maintenance does not. Bytes stored under a digest must verify; altered selected bytes or carriers refuse rather than becoming an alternative identity. The existing execution path may recompute an invalid retained answer; public inspection refuses a corrupt carrier. Missing bytes and failed integrity are different outcomes.

Refusals are typed data from the public API: `reading-identity/context`, `/budget`, `/selection`, `/projection`, `/integrity`, `/failed`, and the existing `host/context`, `/budget`, `/cancelled`. A non-projection reader is unsupported, not silently executed. Cancellation and handed-input budgets are checked before the projection; native process budgets remain authoritative during execution. Synchronous projection cannot observe a JavaScript abort callback while it occupies the host thread; its declared native timeout still bounds that work.

## Quartet

The native test forms two unrelated disposable admitted places, counts and catalogue. Counts reads a physical file. Catalogue adds a dependent aggregate. Both use receiver-selected native images and the real CLI; a separate consumer imports the compiled public `/host` export. Preparation leaves final reading receipts absent; execution commits the same identity; subsequent preparation verifies existing receipts without changing the public receipt file. Catalogue's aggregate is open until the leaf receipt exists.

The negative places retain a receipt but withdraw the current native grant, and alter the archive bytes under their selected digest. Both refuse. Focused vectors also cover missing physical input, changed dependency, stale handed bytes, cancellation, resource exhaustion and unrelated maintenance. Existing environment, authority and descendant-receipt vectors remain applicable and are reused.

Two places on this Mac do not establish another-machine portability. L6 stays pending. This quartet neither admits Root's new reader bindings nor certifies the full 0.2.5 release.
