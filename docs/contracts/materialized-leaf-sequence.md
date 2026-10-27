# Materialized leaf receipt sequence

A consumer may admit a version or prose change, request only `fold --as receipts`, then request `fold --check`. Receipt-only rendering must not certify a previously rendered README or manifest against the newly admitted source. The existing native receipt renderer checks each required ordinary view against its current semantic render before issuing region counts and byte seals. A valid byte digest alone does not establish semantic freshness.

The focal vector `test/materialized-leaf-sequence.test.ts` runs that exact sequence in two unrelated disposable places. It installs an actual content-addressed capsule that renders Markdown and a JSON manifest from admitted version and prose claims. Bootstrap and edits use the existing real file signing port with disposable fixture authority. No normal fold, fresh leaf renderer invocation, output copy or byte reseal is inserted between the admitted edit and the receipt-only/check sequence.

The stale outputs remain unchanged during the receipt-only request, and the immediately following check refuses closure. A normal subsequent fold renders the updated leaves and recovers closure. An altered or absent README or manifest also cannot pass closure after a receipt-only request.

The delivery scope is explicit. The default receipt guard requires all ordinary outputs declared for the source. A delivery explicitly selecting only README may omit an unrelated source-only manifest; absence never chooses that subset implicitly. Removing a selected README refuses the selected seal as well. The focal vector checks this binding once per place and leaves the broader delivery mutation matrix to the existing `pass-receipt-order` vector.

This is a consumer conformance vector for the existing materialized-output guard. It adds no evaluator, rendering implementation, admission authority or runtime exemption. Passing the vector establishes the tested native behavior, not owner authorization, publication or final release closure.

## Declared native case inputs and outputs

The published yes/no JSON files are actual parameters read by `test/materialized-leaf-sequence.test.ts`. Each native procedure retains its semantic assertions and unrelated disposable places. The vector invokes that procedure through the existing Node test reader. The input JSON declares exact case source strings and negative argument values; generated source, output and receipt bytes are read and checked by that same procedure. These public parameter fixtures contain no retained private authority history. Passing test output is not a real Root receipt or permission to admit a lot.


## Public receipt projection

`publication-lines` and `publication-receipts` are read-only native views. They
select the admitted delivery inventory and reuse the existing receipt sealer;
they do not compile, copy files, write archives, or grant authority. Compilation
uses the fixed TypeScript, esbuild and declaration-generator commands. npm packs
the selected closed tree once with lifecycle scripts disabled.

The inventory is a UTF-8 JSON array of unique canonical relative coordinates,
including `TARGET.bound` and `receipts.bound`. Its bytes are admitted at
`publish/receipt-members` with the file coordinate in `shape`. The intervals at
`publish/receipt-files` and `publish/receipt-bytes` bound every read. Missing,
changed, symbolic, duplicate or over-budget members refuse the projection.
Selected materialized leaves must equal their current native renderings; a
missing, stale or changed selected leaf cannot obtain a closure seal. A leaf
outside the delivery selection does not become a required delivery member.

The historical projection can omit only explicitly selected, non-consumed
historical status notices. It cannot omit a bound or a consumed declaration.
The original configuration, receipts and evidence remain unchanged. Their
content digests name separate `bound-lock/1` history records at the admitted
`sources/receipt-history` location. This location grants no network permission
and cannot contain credentials, a query or fragment. Existing public history
references survive re-export. History records are evidence, never authority.

The generated vendor declarations and all ten public declaration entries are
checked together by the strict standard TypeScript command with library checks
enabled. Disabling the generators' duplicate checks does not disable this
check; an invalid public type is a required negative. Compiler readers may
reuse a successful compilation only after freshly validating the retained
toolchain and hashing the complete snapshot, current output bytes and runtime
context. This bounded in-process reuse neither supplies missing bytes nor
authorizes changed outputs.

## Inventory projections

An inventory projection reuses the same native receipt implementation. The default
`publication-receipts` region selects `publish/receipt-members`; a region named
`publication-receipts/<profile>` selects `publish/receipt-members/<profile>`.
The profile is a canonical opaque coordinate, and its declaration pins the
inventory bytes and their coordinate. Every selected member is covered by a
whole-inventory seal, including members not consumed by a semantic reader.
The existing file and byte limits apply to every profile.

A live place uses its completed fold only while current bytes, readings and the
instrument still match. A public source with no local admission ledger is a
historical snapshot: its byte closure and native carrier must verify before it
can be reprojected. That operation preserves historical observations and history
references; it neither runs the producer again nor asserts authority or a new
execution on the receiving host. Changed source bytes, configuration, absent
selected members and stale output bytes refuse. Ordinary receipt rendering
continues to reject a new admitted source paired with an old rendered leaf.

Compiler caches may be declared foreign by their producer. This affects only
unconsumed maintenance: a foreign file explicitly handed to a reader remains
part of that reading's byte identity.

Inventory byte seals name their selection declaration and its manifest coordinate. Every owned member must be selected; explicitly selected foreign inputs remain byte inputs. Unselected foreign maintenance is not certified as source. The same selection validator governs production and verification.

Portable receipts include the exact selected contract standings by digest, encoded in existing content records. Verification checks their bytes with the instrument's admitted digest algorithm and decodes them through Topos's standing reader. The selected wire contracts must still agree. An altered attachment is refused rather than replaced from a cache. This transports contract bytes and historical observations; it grants no authority.
