# Native authenticated reference export

`bound sign --as reference <source-url> --key <key-id>` exports a public snapshot from an admitted local place. The selected host signer is the place's existing signer port. File signing additionally requires its explicitly supplied `--key-file`; command signing uses the host registry. There is no implicit signer, network fetch or private export runner.

The command prints one JSON value with profile `reference-export@1`, a `reference`, the exact `carrier` text and a public `context`. It neither lands the proof nor advances the place's epoch. It does not publish, write an output directory or alter TARGET, ledgers or receipts. The caller chooses where to deliver these bytes.

The place declares `reference/authentication=authenticated-standing@1`, `reference/proof-scope`, `reference/records`, and an interval `reference/export-bytes` measured in bytes. It also pins `reference/contracts/refusals` and `reference/contracts/standing` to the exact installed contract files. Missing, conflicting or unauthenticated declarations refuse. These are place declarations, not increased general ceilings.

The exporter uses Bound's authenticated Root standing and existing context preparation. It preserves typed effective history and applies the existing configuration projection; it does not implement another fold. If the current carrier profile cannot represent historical authority, it refuses as `reference-export/history` instead of dropping originals or forging a new admission. The separate B3 quartet covers complete public standing across declared classes and committed acts; this carrier still refuses historical authority it cannot represent.

The carrier retains `authenticated-standing@1` framing. Its proof commits to the original canonical signed lines. The proof's witness snapshot also commits, through `reference-export-context@1`, to semantic standing identity, epoch, proof scope, policy, form implementation, public signers, signature algorithms, the refusal-catalog digest, the standing-contract digest, and the declared byte and record budgets. Blob identity remains separate from semantic standing identity and source location.

The exported context is public data, not an authority anchor. A consumer independently accepts its keys, policy and interpretation contracts, then supplies these expectations to `inspectAuthenticatedReference`. When `contracts` is supplied, that existing API verifies the context snapshot before requesting bytes. Altering either contract digest or a resource budget invalidates that snapshot. Existing callers without the new context retain their 0.2.0 inspection contract; that compatibility does not assert verification of the added interpretation contracts.

`/engine` remains pure. Exporting a reference does not select WASM, and B1 does not claim B2's backend composition. Signature, authority and context checks precede projection. `next` recommendations from `refusals.bound` grant no permission to execute, repair or sign.

## Conformance quartet

- Positive data: `samples/reference-export/yes.json`. The native test bootstraps a real Root with a disposable key and admits its cell and claim through `bound land`. It then executes this public signing command and verifies the result through the public reference API and unchanged engine.
- Negative data: `samples/reference-export/no.json`. Changing a carrier byte refuses on blob integrity before projection.
- Vector: `vectors/native/reference-export.vector.json`. It runs the tracked conformance test, which invokes the actual CLI for bootstrap, admission and export. No private runner or pre-signed fixture stands in for those operations.
- Additional boundaries: changed contract identities, changed byte budget, invalid source, unauthorized key and invalid signer response. Export and refusal leave the real Root's TARGET and complete ledger inventory unchanged.

Captured semantic markers from the native run:

```text
EXPORT real-admission · contracts-bound · signatures-verified · REQUIRED · no commit
REFUSE altered-carrier · blob integrity
```

Keys are generated outside the repository and discarded by the test. Captures contain no private key, local path or successful receipt for a failed export. Fixture preparation and each CLI invocation have their own existing bounds; the enclosing conformance runner's lifetime is not a cost claim for any individual reading. Release admission, portable release receipts and exact-artifact acceptance remain separate from this quartet.
