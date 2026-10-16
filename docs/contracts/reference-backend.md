# Authenticated native reference opening

`@lapxo/bound/reference/native` exports `exportAuthenticatedReference` and `openAuthenticatedReference`. This is the Node host boundary. The platform-free inspector stays in `/reference`; the pure projector stays in `/engine`.

The receiver admits one `engine/object` declaration: `esm@1` or `wasm@1`. Missing, ambiguous and unknown selections refuse. WASM never falls back to ESM. The native route shares one context preparation, authenticates the received original records, then calls the existing selected projector. It introduces no algebra or alternate interpreter.

The host admits `reference/snapshot`, `reference/epoch`, `reference/proof-scope`, `reference/policy`, `reference/form-implementation`, `reference/records`, and the standing/refusal contract digests. The policy is the independently accepted export policy, not a policy invented from the received carrier. The prepared form implementation must match the admitted expectation, and both interpretation contracts must match the installed bytes. A carrier's accompanying context is public data, not an authority anchor.

Content goes through the declared transport and its existing byte/time limits. The snapshot binds the declared public context, including resource budgets. The native opener accepts an AbortSignal and checks interruption before download and projection; the WASM worker uses its existing cancellation and lifetime contract. This does not claim cancellation of an in-flight native download, browser persistence or arbitrary browser capsules.

WASM uses the installed asset manifest, runtime, guest and exact supported form standings. The caller cannot replace that manifest with a convenient fixture. Its memory, stack, execution, worker-lifetime and response budgets remain explicit admitted interval lines. A form outside that installed closure refuses by name.

The positive fixture uses the previously published native reader archive named in `samples/reference-backend/world-fixture.json`, or the same supported standing and closed modules already laid by digest. Preparation verifies every byte before timed opening. The fixture archive is fetched or retained outside opening measurements; no private store or checkout path identifies it. No provider code executes during archive preparation.

The native quartet opens one signed reference in two unrelated places, once through each explicitly selected backend. It compares authenticated standing, records and canonical projection bytes. Authority-context identity describes authentication, not an execution receipt: equal outputs never authorize reuse of a receipt across implementations. Neither opening signs or commits an act.

Captured semantic markers:

```text
WASM water-level-reference · authenticated download · same standing · same records · byte-equal ESM projection · altered carrier refused · no commit
WASM editorial-reference · authenticated download · same standing · same records · byte-equal ESM projection · altered carrier refused · no commit
```

The no sample changes the carrier while retaining its reference. Integrity refuses before projection. Existing vectors also retain unknown-backend, unsupported-form, byte-budget, authority and cancellation boundaries. The quartet descriptor is `reference-backend.publication.json`; installed-archive release acceptance and L6 remain separate obligations.
