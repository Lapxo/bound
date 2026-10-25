# Canonical host lifetime and owned scratch

A consumer owns one native host for each canonical place in that consumer process. Aliases resolve to the same reservation. Separate consumer processes retain the existing native serialization protocol; this contract does not create another lock or admission path.

close() is asynchronous and idempotent. The place remains busy until the child and its streams have closed and owned cleanup completes. Failed scratch creation or child startup releases its reservation. Existing cancellation, consumer-disconnect cleanup and startup budgets remain applicable.

The receiver selects the scratch parent. Only directories created by this host and its requests are removed. Consumer files and sibling directories survive success, refusal, cancellation and shutdown. Signer bindings have no fixed semantic cardinality; finite request, queue, heap and response budgets remain mandatory. There is no promise of unlimited resources.

The acceptance vectors reuse existing startup, cancellation and consumer-death procedures, plus canonical aliases, failed scratch creation and close/reopen sequencing. No cross-process semantics are reopened.
