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

The executable vector captures the instrument output. The quartet proves this declared public boundary; it does not certify all remaining host views, another machine, a release policy or an owner admission. Head, browser hosts, algebra, wire and ceilings are outside this change.
