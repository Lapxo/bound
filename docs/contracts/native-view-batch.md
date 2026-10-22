# Native view identities in one observation

`prepareNativeViewIdentities` from `@lapxo/bound/host` accepts an explicit place, receiver-selected native instrument, distinct supported view names and optional expected identities. It returns each view's identity and text together. The CLI exposes the same operation as `bound fold --as reading-identities@lines+evidence`.

The native projections currently supported are `lines` and `evidence`. An empty, repeated or unsupported selection refuses by name. This is a finite implementation capability, not a list of possible application regions. Executable and foreign-transport views retain their separate contracts.

Each identity names that view's consumed inputs, current committed inventory, selected implementation, instrument configuration, environment and day boundary. The existing `native-view-inputs@1` framing is retained. Request order and the presence of another selected view do not alter a view's identity. A different execution environment can produce a different identity even when the text is identical.

Within one synchronous call, native preparations share captured source bytes and independently retain each view's input membership and admitted byte/file budgets. Every source is freshly verified before return. The admitted reading count bounds the selection. A batch does not persist a cache, execute an observed reader, call the general fold or acquire Root exclusion. Later calls capture their sources again.

An unsupported selection, exceeded budget, changed input, changed committed inventory or mismatched expected identity returns one typed refusal and no partial view results. Identity and text belong to the same successful observation. Existing single-view host and CLI routes remain available.

The native vector checks two unrelated admitted places, both public projections, request reordering, stable repetition, expected-identity refusal, source invalidation, writer exclusion and a complete persisted-byte inventory. A changed source during shared capture refuses before return. Performance is measured separately; this contract promises no constant-time query or unmeasured speed ratio.

## Declared native case inputs and outputs

The published yes/no JSON files are actual parameters read by `test/native-view-batch.test.ts`. Each native procedure retains its semantic assertions and unrelated disposable places. The vector invokes that procedure through the existing Node test reader. The input JSON declares exact case source strings and negative argument values; generated source, output and receipt bytes are read and checked by that same procedure. These public parameter fixtures contain no retained private authority history. Passing test output is not a real Root receipt or permission to admit a lot.
