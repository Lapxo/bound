# @lapxo/bound

Bound admits signed statements, keeps their origins and contradictions, and projects the views selected by a place. Topos supplies the wire and interpretation contracts; Obligations supplies the unchanged constraint algebra.

The pure engine projects already admitted, effectively ordered records. Reference inspection verifies a carrier against an independently accepted host context. A digest identifies content; it grants neither authority nor permission to reuse an answer as current.

```sh
npm install @lapxo/bound@0.2.1
```

Your host supplies the reference and its accepted trust context: signer grants and epoch, selected form, policy, byte/record bounds, content and cryptographic ports. The carrier cannot choose those inputs. This function uses the public reference inspector and the same pure engine as the CLI:

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

Native hosts can export a signed carrier and open with an explicitly selected ESM or WASM backend through [`/reference/native`](docs/contracts/reference-export.md). The installed WASM adapter covers the published object projection; admission, effects and the whole CLI do not run inside WASM. Opening never commits an act. Cross-machine evidence (L6) remains pending.

[Host ports](docs/contracts/host-ports.md) are injected by the host. Byte retention is explicit and creates no admission or current-answer receipt. [Complete standing](docs/contracts/standing.md), [refusal codes as lines](docs/contracts/refusals.bound), [backend contract](docs/contracts/reference-backend.md), [usage](docs/usage.md).

The underlying object is described in [Two-Sided Constraints on a Valued Lattice](https://doi.org/10.5281/zenodo.21858428), DOI `10.5281/zenodo.21858428`. [Topos](https://github.com/Lapxo/topos) · [Obligations](https://github.com/Lapxo/obligations).
