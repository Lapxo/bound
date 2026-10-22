# Reading witness admission

`readingWitnessAdmission(root, proposed, selectedStanding, vocabulary, place)` is an admission hook for explicitly selected reading-witness policy. It returns `allow` with verified evidence identities, `ask` with `reading-witness/<scope>` needs, or `refuse` with the public `reading-witness` code and a diagnostic cause. The shared native admission path consumes this result before its existing widening rule. The hook neither signs nor lands a lot.

Selection is opt-in. The current admitted Root vocabulary selects `wire/reading-witness-admission = bound-reading-witness-admission@1`. Policy records have role `writes`, measure `reading-witness`, value `lock`, and canonical JSON in `about`. A policy has these fields:

```json
{
  "profile": "bound-reading-witness-policy@1",
  "scope": "core/lines",
  "place": ".",
  "unit": "physical-lines/utf8-lf@1",
  "inventory": ["src"],
  "selectors": ["src/*.txt"],
  "producer": "device",
  "port": "port/physical",
  "readerMapping": "reader/capsule/physical/port",
  "byteBudget": "65536",
  "rowBudget": "65536",
  "entryBudget": 32,
  "evidenceBytes": 4194304,
  "receiptRows": 512,
  "authorityBytes": 1048576,
  "authorityLines": 2048
}
```

The scope, place, inventory, selectors, producer and port are declarations, not application names compiled into the runtime. `place` is `.` for Root or a relative child place. Shared admission supplies the actual selected place separately, so a Root `core/lines` policy cannot apply to a child merely because its local scope has the same spelling. Other readings and ceilings retain their existing rules. A matching policy never falls back to prefix-only witnessing.

A selected widening names `at=witness:sha256:...`. The digest addresses a bounded local CAS blob containing canonical JSON followed by one LF:

```json
{
  "profile": "bound-reading-witness-proof@1",
  "witness": "topos-reading-witness/1 ...",
  "authorization": "bound-lock/1 ...",
  "receipts": ["bound-lock/1 ..."]
}
```

The Topos witness uses `authentication=key-covered`. The authorization is an original signed Bound record at the policy scope, with role `writes`, form `alphabet`, measure `reading-witness`, value equal to the SHA-256 of `readingWitnessStatementBytes(witness)`, and `restsOn` equal to the digest of the canonical policy JSON plus LF. The witness evidence digest names the exact signed authorization line plus LF. Its coverage digest names the current producer's declared coverage array. Existing Bound authority evaluation verifies signature, admitted algorithm, window, scope coverage and current producer eligibility. No caller-supplied success callback establishes this authority.

The current native port and signed reader mapping must remain admitted. Their selected archive and native member references must match the retained canonical reading context. Inline native receipt carriers are checked by the existing `verifiedReadingReceipts` path, including canonical `reading-context@1` identity and reading receipt identity. The witness `run` names that exact receipt unit scope. All file inputs must match the explicit inventory by name and digest.

The physical reading is then made again from the declared local inventory by the existing Topos physical reader through Bound's adapter. The exact model, parameters, selection, unit, scale, resolution, reader, implementation, context, result and reading identities must agree with the signed witness. The native output must contain the same measured line count at the policy scope. Missing selectors, stray files, links, incomplete inventories, altered inputs, withdrawn ports, old mappings and invalid evidence cannot authorize widening. Proof processing reads only its declared local CAS blob and inventory; it does not resolve arbitrary foreign evidence paths or CI URLs.

The native consumer vector first enables the optional selector and policy through an ordinary act on an existing native place. It records an actual over-ceiling physical reading, refuses absent and forged proof, then attempts a real widening transaction with a signed authorization and retained native evidence. The prior inscription is explicitly withdrawn in the same batch, so a successful act must leave exactly the new effective ceiling. This tests admission and its real act receipt, rather than interpreting a local judge result as a landing.

The previous native preflight root-lock refusal remains preserved in the evidence packet. Native evidence inspection requires the existing Root authority lease; the shared prospective admission and authority-card paths acquire that real lease. This contract adds no bypass flag and does not weaken current protection.
