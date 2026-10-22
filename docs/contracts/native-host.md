# Native in-process host

The public `@lapxo/bound/host` entry offers authenticated Root and contextual standing reads, Root-lot and contextual-act admission, historical recovery, and explicit native instrument and receiver adapters. Node is required for this native host. The pure `/engine` and reference backends retain their separate contracts.

## Classic Root lot

`landRootLotInProcess(context, ports)` accepts LF-framed, canonical, unsigned target configuration records. The receiver supplies the admitted place, exact history snapshot, implementation runtime, reading identity, byte/record/time bounds, content port and canonical-line signer. The lot cannot choose those capabilities. It calls the same admission judges and atomic result implementation as the CLI; a signed line is not automatically an admitted line.

The snapshot is checked before acquisition and before admission. Coverage is checked before invoking the signer. A change while signing refuses instead of rebasing. A fresh repeated held lot does not acquire another signature. `rootLotSnapshot` names complete admission history; it is not a signature or permission.

## Effects and recovery

Cancellation before visibility leaves no partial act. A publication error whose visibility is unknown returns `uncertain` with the native act identity. A failure after commit retains that identity and reports incomplete conformance, not rollback. `recoverRootActInProcess` authenticates the historical result without signing or reviving current grants. Root and contextual admission remain distinct operations; the latter consumes already signed contextual originals and acquires receiver receipts.

The host selects context explicitly on every call. Calls do not interpret consumer argv or print to its console. Diagnostics are bounded returned data. Native storage shares the CLI exclusion protocol. Returned reading commitments are unsigned data and do not pay release demands.

## Public quartet

The two positive places are a seed accession library and a coastal tide survey. Each installs the public host boundary, bootstraps disposable fixture authority through the real CLI, admits a domain-specific Root lot, compares native result recovery and repeats the held lot without signing again. Negatives alter bytes, remove signer coverage, cancel before commit and offer a noncanonical lot; no negative may create a visible act. Test keys are created only for the disposable fixture, never shipped.

The executable vector captures the instrument output. The quartet proves this declared public boundary; it does not certify all remaining host views, another machine, a release policy or an owner admission. Algebra, wire and ceilings retain their existing contracts.

## Consumer-owned persistent native host

`await startNativeHost({place, instrument, expectedInstrument, limits, environment, signers?, scratchParent?})` starts one native dispatcher for one explicit place. `request({verb, args, signer?, inputs?}, signal?)` accepts `fold`, `sign` and `land`. It calls the same dispatcher, signer protocol, admission judges, exclusion and atomic publication as the CLI. A carrier never supplies a verifier, trust anchor or capability registry. `close()` aborts the active request and waits for cleanup. IPC disconnect also closes the host when the consumer dies; no daemon is installed.

The queue is finite. `requestBytes` bounds the aggregate queued request data, `queuedRequests` bounds request count, `responseBytes` bounds each response and `timeoutMs` bounds startup and triggers request cancellation. `heapMiB` selects Node's old-generation heap limit; it is not a claim about total operating-system RSS. Native file, capture and execution bounds remain those already declared by the place. The host refuses another instance for the same canonical place in one consumer; every act retains the existing cross-process CLI exclusion protocol. Calls never change the consumer's environment, cwd, arguments, console or exit status.

`nativeHostEnvironment` removes all `NODE_` and `UV_` controls from the explicitly supplied environment. The fixed memory flag and actual sanitized environment belong to reading identity. CLI comparisons use that same boundary, rather than pretending that different execution environments have one identity. The host starts once; a query does not start another dispatcher.

An injected signer is selected by receiver key and declared mechanism name. Its callback remains in the consumer, receives only the canonical signing lot and cancellation signal, and uses the existing bounded signing port and signature verification. Signing never grants admission. Lost application responses are recovered by the original committed act identity; redelivery does not create another act.

`inputs` contains uniquely named UTF-8 request files. Arguments name these files as `@input/<name>`. They are staged only in an owned request directory and removed after success, refusal or cancellation. Caller-owned places and arbitrary caller files are never deleted as scratch. Shutdown removes the owned host scratch directory. Before visibility, cancellation publishes no partial act; after visibility, the committed native identity remains historical evidence and is never represented as a rollback.

The response retains raw stdout, stderr and exit status. Identity/text, signatures, refusal catalog records and recovered canonical act records are compared byte for byte with CLI vectors. Independently measured elapsed-time diagnostics are retained as operational evidence, not normalized or presented as byte-identical measurements. Fresh verification is proportional to consumed bytes. The separate consumer acceptance measurement reports 1x, 10x and 100x, ten samples plus one warm-up, real clock/load, elapsed milliseconds per decimal MB and persistent growth; no constant-time property is claimed.

Every persistent request rereads current file and ledger bytes, including externally edited bytes with unchanged size and timestamps. The receiver-selected public instrument lock is checked again before dispatch; retained parsing never grants authority to a later request.

## Installed pin, signer registry and foundation

`installedHostInstrument(request, entry)` reuses `installedPackageIdentity` and returns the instrument with its installed-byte digest. Startup requires `expectedInstrument`, selected by the receiver from its admitted package pin. It verifies those bytes before and after child startup. Neither the archive digest nor a physical pathname substitutes for the installed identity; identical installations have the same digest.

`signers` is a receiver-owned map indexed by key ID, with no fixed key count. Every signing request explicitly names its `signer`. The selected binding must match the lot key: a mismatch refuses with `host/signer-mismatch`, while a missing binding refuses with `host/unbound-signer`. Neither acquires another key or admits any record. The former single-binding option only registers that binding; it never selects a signer implicitly and does not limit the registry.

Cross-process land semantics are `serialize`: admitted-place requests acquire the existing native tree exclusion before preparing a lot. Two consumer processes commit in that order with consecutive epochs. There is no automatic rebase or retry, and the CLI uses the same native exclusion protocol.

A birth directory containing only its public birth lock may be founded through `land`, using the classic bootstrap implementation and injected signer. Other operations refuse with `host/foundation-required` until foundation. An existing empty or unauthenticated store refuses with `host/foundation-state`; it is never overwritten or founded again. The executable vectors use two unrelated disposable places and compare signatures, founder ledgers and subsequent native closure with the CLI.

Act-cost accounting starts separately for each request and includes all work in that request. Client idle time and earlier requests do not accumulate into a later act; no declared execution or observation is omitted from its own accounting.
