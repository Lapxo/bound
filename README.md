# @lapxo/bound

Bound turns signed statements, observations and requirements into a place you can inspect. It keeps who said what, preserves incompatible declarations, and projects the views selected by that place. Missing evidence stays missing; a rendered page is not proof that every requirement has been met.

The same pure engine is available to applications and to the CLI. Topos supplies the wire and interpretation contracts; Obligations supplies the constraint algebra. Bound adds admission, authenticated reading, retained receipts and declared host operations around that core.

## A place, its readings and its receipts

A place declares its rules and selected worlds in `TARGET.bound`. Worlds supply readers and renderers for their own domains. A fold reads the declared inputs, applies the admitted constraints, and renders the selected views. `receipts.bound` carries the public evidence needed to check the resulting files; private admission history stays in the local `.bound/` store.

Unchanged regions can retain valid receipts. A changed input reopens the regions it affects, while incompatible admitted statements remain visible. A digest identifies content; it grants neither authority nor permission to reuse an old answer as current. A receipt records a reading under its declared context, rather than establishing the truth or independence of its sources.

## Install and use

```sh
npm install @lapxo/bound@0.2.7
```

In a place with admitted declarations and closed public receipts, check the existing evidence without running its readers again:

```sh
npx @lapxo/bound@0.2.7 fold --check
```

For a change, prepare a proposal, sign with a key already covered by the place, admit the signed lot, then fold and inspect the result. Signing and admission do not by themselves pay a requirement. The [usage guide](docs/usage.md) covers keys, coverage, proposals, withdrawals and release policy.

## Embed the engine

`objectFold` projects already admitted records in effective order. It does not acquire content, verify signatures, choose authority, commit an act or write storage. Those preparation steps belong to the host.

For an authenticated reference, your host supplies the independently accepted trust context: signer grants and epoch, selected form, policy, byte and record bounds, content and cryptographic ports. The carrier cannot choose those inputs. This example verifies the carrier through `/reference`, then uses the same `/engine` projection as the CLI:

```js
import { objectFold } from '@lapxo/bound/engine';
import { inspectAuthenticatedReference } from '@lapxo/bound/reference';

export async function openAndProject(reference, trust) {
  const opened = await inspectAuthenticatedReference(reference, trust);
  return objectFold(opened.records, trust.objects);
}
```

Captured on a clean installed consumer, with two independently admitted fixture places and an altered carrier in each:

```text
README sensor · REQUIRED · altered carrier refused
README editorial · REQUIRED · altered carrier refused
```

Opening and projecting a reference never commit an act. The authenticated context binds the standing contract and refusal catalog by digest, so consumers can identify the contracts used to interpret the result.

## Public boundaries

| Entry | Responsibility |
| --- | --- |
| `/engine` | Pure projection of admitted object records; optional, explicitly injected host ports. |
| `/reference` | Inspect a carrier against the host's accepted context and verify its content and authority. |
| `/reference/native` | Export a signed carrier from a real admitted place and open it with an explicitly selected backend. |
| `/wasm` | Load the optional WASM adapter for the published object projection. |
| `/refusals` and `/standing-contract` | Read the machine-readable contracts bound into authenticated exports. |

Native opening selects **ESM or WASM explicitly**; an unsupported selection refuses rather than falling back. The WASM adapter covers the published object projection. Admission, effects and the whole CLI do not run inside WASM. Independent physical-machine verification remains pending.

The host supplies bounded [signer, content and persistence ports](docs/contracts/host-ports.md). Their identities and limits are explicit. Retaining bytes is an explicit operation: it grants no admission or permission to reuse a response. The existing authority path verifies signatures before returning an authenticated carrier.

[Complete standing](docs/contracts/standing.md) covers declared key classes and committed local acts, preserving attribution, exact withdrawals and conflicts. [Refusals](docs/contracts/refusals.md) have machine-readable codes, meanings and suggested next steps; human diagnostics are not parsed as authority.

## Native consumer operations

Applications can query `prepareNativeViewIdentities` from `/host` for `lines` and `evidence` in one read-only observation. Each result includes its own identity and the text captured under that identity. The CLI uses the same implementation:

```sh
bound fold --as reading-identities@lines+evidence
bound fold --as probe@lines
```

A probe is a bounded reading attempt. The consumer owns its counter; Bound does not persist probe markers. Admitted input and response limits still apply. See [native view identities](docs/contracts/native-view-batch.md) and [probes](docs/contracts/native-probes.md).

`/physical-lines` counts physical UTF-8 lines under declared selectors and binds a reading witness to its exact inputs. It delegates threshold and widening decisions to Bound's existing judges. `/profiles` prepares digest-pinned composition and selects exact release categories; preparation does not admit a change. `/package/native` produces a content identity for a verified installed inventory and its reached modules. That identity is distinct from the compressed archive digest.

See [physical lines](docs/contracts/physical-lines.md), [profile composition](docs/contracts/profile-composition.md), [installed package identity](docs/contracts/installed-package.md) and [materialized outputs](docs/contracts/materialized-leaf-sequence.md).

`await prepareNativeAuthorityCard(context)` from `/host` returns `allow`, `ask` or `deny` for exact configuration actions using current native authority and admission checks. The caller supplies an explicit clock, epoch and bounded ports. `fold --as authority-card@<scope>` reads a bounded request selected by admitted lines; the request cannot supply a trust anchor or select an instrument. A card is a preflight, and each eventual act still checks its signatures and current authority. See the [authority card contract](docs/contracts/authority-preflight.md).

## Contracts and foundations

- [Native authenticated export](docs/contracts/reference-export.md) and [reference backends](docs/contracts/reference-backend.md).
- [Pure engine](docs/contracts/engine.md), [host ports](docs/contracts/host-ports.md) and [CLI usage](docs/usage.md).
- [Topos](https://github.com/Lapxo/topos): wire, interpretation and identity contracts.
- [Obligations](https://github.com/Lapxo/obligations): the unchanged constraint algebra.

The underlying object is described in [Two-Sided Constraints on a Valued Lattice](https://doi.org/10.5281/zenodo.21858428), DOI `10.5281/zenodo.21858428`.

## Native parity vectors

The [neutral byte vectors](docs/contracts/native-parity.json) cover standing folds, exact withdrawals, regional aggregation and module inventory. They use the existing receiver-pinned conformance verifier; a passing native baseline does not certify another implementation or independent construction. See the [parity contract](docs/contracts/native-parity.md).
