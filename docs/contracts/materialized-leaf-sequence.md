# Materialized leaf receipt sequence

A consumer may admit a version or prose change, request only `fold --as receipts`, then request `fold --check`. Receipt-only rendering must not certify a previously rendered README or manifest against the newly admitted source. The existing native receipt renderer checks each required ordinary view against its current semantic render before issuing region counts and byte seals. A valid byte digest alone does not establish semantic freshness.

The focal vector `test/materialized-leaf-sequence.test.ts` runs that exact sequence in two unrelated disposable places. It installs an actual content-addressed capsule that renders Markdown and a JSON manifest from admitted version and prose claims. Bootstrap and edits use the existing real file signing port with disposable fixture authority. No normal fold, fresh leaf renderer invocation, output copy or byte reseal is inserted between the admitted edit and the receipt-only/check sequence.

The stale outputs remain unchanged during the receipt-only request, and the immediately following check refuses closure. A normal subsequent fold renders the updated leaves and recovers closure. An altered or absent README or manifest also cannot pass closure after a receipt-only request.

The delivery scope is explicit. The default receipt guard requires all ordinary outputs declared for the source. A delivery explicitly selecting only README may omit an unrelated source-only manifest; absence never chooses that subset implicitly. Removing a selected README refuses the selected seal as well. The focal vector checks this binding once per place and leaves the broader delivery mutation matrix to the existing `pass-receipt-order` vector.

This is a consumer conformance vector for the existing materialized-output guard. It adds no evaluator, rendering implementation, admission authority or runtime exemption. Passing the vector establishes the tested native behavior, not owner authorization, publication or final release closure.

## Declared native case inputs and outputs

The published yes/no JSON files are actual parameters read by `test/materialized-leaf-sequence.test.ts`. Each native procedure retains its semantic assertions and unrelated disposable places. The vector invokes that procedure through the existing Node test reader. The input JSON declares exact case source strings and negative argument values; generated source, output and receipt bytes are read and checked by that same procedure. These public parameter fixtures contain no retained private authority history. Passing test output is not a real Root receipt or permission to admit a lot.
