<p align="center"><img src="docs/readme-assets/atlas.svg" alt="Bound: a folded cell with its origin at the crease" width="96"></p>

<h1 align="center">@lapxo/bound</h1>

<p align="center"><b>Keep who said what. Name what is still missing.</b></p>

<p align="center">
<a href="https://www.npmjs.com/package/@lapxo/bound"><img src="https://img.shields.io/badge/version-0.2.7-475569" alt="Version 0.2.7"></a>
<img src="https://img.shields.io/badge/runtime_dependencies-0-15803d" alt="Zero runtime dependencies">
<img src="https://img.shields.io/badge/Node-%3E%3D22.15-475569" alt="Node 22.15 or later">
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-475569" alt="MIT license"></a>
<a href="https://doi.org/10.5281/zenodo.21858428"><img src="https://img.shields.io/badge/DOI-10.5281%2Fzenodo.21858428-475569" alt="The mathematical foundation"></a>
</p>

Bound folds signed statements, observations and requirements into a place you can
inspect. Every declaration keeps its origin. Incompatible declarations stay
visible; missing evidence stays missing. Rendering a page does not pay a requirement.

## See it

In an existing place with admitted declarations and valid public receipts:

```sh
npx @lapxo/bound@0.2.7 fold --check
```

Captured from the verified checkout:

```text
PASS     closed · 1 places · 1836 ms
```

A check validates the current bytes against retained receipts. It does not run the
external readers again. Changed inputs reopen the readings that depend on them;
absent or altered selected outputs cannot pass as closed.

The installed reference example also captures two independently admitted fixture
places and refuses an altered carrier in each:

```text
README sensor · REQUIRED · altered carrier refused
README editorial · REQUIRED · altered carrier refused
```

## Quick start

```sh
npm install @lapxo/bound@0.2.7
```

A **place** is a folder with `TARGET.bound`: its declarations, selected readers
and renderers, and the rules under which changes can be admitted. Start inside
such a place; installation alone does not create authority or a closed place.

```sh
npx bound fold                 # read declared inputs and render selected views
npx bound fold --check         # validate retained evidence against current bytes
npx bound fold --as lines      # inspect one selected view
```

To change a place, prepare a proposal, sign with a key already covered by the
place, admit the signed lot, then fold and inspect the result. Signing and
admission do not themselves pay a requirement. The [usage guide](docs/usage.md)
covers keys, coverage, proposals, exact withdrawals and release policy.

## What the fold keeps

- **Declarations and origins.** Who supports each statement remains available for
  explanation and exact withdrawal; a later value does not silently erase a conflict.
- **Requirements and evidence.** A reader supplies observations for its domain.
  Bound applies the admitted forms and constraints; it does not invent missing evidence.
- **Views and receipts.** Selected views have declared inputs. Unchanged regions
  can retain valid receipts; a receipt records a reading in its context.
- **Refusals.** Machine-readable codes name the failed condition and its next step.
  Human diagnostics are not parsed as authority.

A digest identifies content; it grants neither authority nor network permission.
A receipt does not prove that a source is true or independent. Two signing keys
are not evidence of two independent people.

## Embed the engine

The CLI and applications use the same implementation. The pure engine projects
already admitted object records in effective order:

```js
import { objectFold } from '@lapxo/bound/engine';
import { inspectAuthenticatedReference } from '@lapxo/bound/reference';

export async function openAndProject(reference, trust) {
  const opened = await inspectAuthenticatedReference(reference, trust);
  return objectFold(opened.records, trust.objects);
}
```

Your host supplies the independently accepted trust context, selected form,
policy, bounded content and cryptographic ports. The carrier cannot choose them.
`objectFold` itself does not fetch content, verify signatures, choose authority,
commit acts or write storage.

For native effects, `/host` provides a persistent host with explicitly bound
signers and a pinned instrument. Host document requests refuse by name rather
than returning an unrelated successful view. Digest-pinned redirects check the
receiver's network policy before each connection; integrity never grants access.
See [host transport and refusals](docs/contracts/host-document-targets.md) and
[receiver policy](docs/contracts/bounded-redirects.md).

## Public entry points

| Import | Responsibility |
| --- | --- |
| `/engine` | Pure projection of already admitted records. |
| `/reference` | Inspect an authenticated carrier against accepted host context. |
| `/reference/native` | Export and open signed carriers from an admitted place. |
| `/host` | Native host, view identities and text, probes, authority preflight. |
| `/physical-lines` | Physical lines under declared selectors, with a reading witness. |
| `/profiles` | Digest-pinned composition and exact release categories. |
| `/package/native` | Content identity of a verified installed inventory. |
| `/closure/native` | Verify and deliver a declared module closure. |
| `/wasm` | Optional WASM adapter for object projection. |
| `/refusals`, `/standing-contract` | Machine-readable interpretation contracts. |
| `/conformance`, `/determinism`, `/parity` | Published acceptance contracts and neutral vectors. |

A view identity can be requested with its text without running a fold. Its cost
includes checking current input bytes; it is not constant in place size. Probes
persist no counter or marker; the consumer owns its count. Authority cards are
preflight results, and an eventual act still checks current authority.

The optional WASM adapter covers object projection, not admission, native effects
or the whole CLI. Independent physical-machine verification remains pending.

## Read further

[Usage](docs/usage.md) · [Host ports](docs/contracts/host-ports.md) ·
[Standing](docs/contracts/standing.md) · [Refusals](docs/contracts/refusals.md) ·
[Authority preflight](docs/contracts/authority-preflight.md) ·
[View identities](docs/contracts/native-view-batch.md) ·
[Probes](docs/contracts/native-probes.md) ·
[Physical lines](docs/contracts/physical-lines.md) ·
[Profiles](docs/contracts/profile-composition.md) ·
[Installed identity](docs/contracts/installed-package.md) ·
[Neutral parity](docs/contracts/native-parity.md).

Built on [Topos](https://github.com/Lapxo/topos) for wire and interpretation
contracts, and [Obligations](https://github.com/Lapxo/obligations) for constraint
algebra. Domain readers supply their own observations; Bound is not a source of truth.

The underlying object is described in Ochoa, N. (2026),
[*Two-Sided Constraints on a Valued Lattice*](https://doi.org/10.5281/zenodo.21858428),
DOI `10.5281/zenodo.21858428`.

MIT.
