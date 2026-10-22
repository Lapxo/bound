# Native probes

`prepareNativeProbe` reads an explicit local `lines` or `evidence` form. Its result names the same identity and returns the same captured text as `prepareNativeViewIdentity`; it never falls back to folding an unsupported form. Expected identities use the existing native view identity contract. Foreign evidence without a transport snapshot refuses.

The consumer supplies a port coordinate, finite `probes` and `responseBytes` limits, an optional cancellation signal, and a counter `{used: new Map()}`. The consumer owns that counter and keeps it for the entire operation, sharing it across calls on the same port. Different ports have independent counts. Bound persists no counter, receipt, cache, memo or other probe state. Resetting a counter begins a new consumer operation; the counter is operational accounting, not a grant of authority.

Each attempted captured reading consumes one probe even if identity validation or response size later refuses. Invalid forms, invalid limits, exhausted counters and already cancelled calls consume none. The place's admitted `reading-identity/probes` limit further reduces each port's available probes; the existing admitted byte and file budgets constrain the capture. The response byte limit covers the complete JSON fact. Cancellation is checked before capture and before returning its result. Capture is synchronous; cancellation from another event-loop task cannot preempt a synchronous capture.

Repeated probes with unchanged committed inputs preserve the native view identity and every persisted byte. A consumer can verify this without deriving another identity: compare the supplied public native identity before and after its operation, and compare persisted byte inventories. Newly admitted evidence remains subject to the existing identity contract.

## Declared native case inputs and outputs

The published yes/no JSON files are actual parameters read by `test/native-probes.test.ts`. Each native procedure retains its semantic assertions and unrelated disposable places. The vector invokes that procedure through the existing Node test reader. The input JSON declares exact case source strings and negative argument values; generated source, output and receipt bytes are read and checked by that same procedure. These public parameter fixtures contain no retained private authority history. Passing test output is not a real Root receipt or permission to admit a lot.
