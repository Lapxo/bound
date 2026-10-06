# Contributing to Bound

Bring a counterexample, an observation or a proposed lot. Include the inputs and the output that led you to it. A signature establishes who was authorized to speak; it does not make their result true.

## Set up a working copy

Clone the repository and use the Node version supported by package.json. If package-lock.json is present, run npm ci; otherwise use npm install --ignore-scripts --no-package-lock. Then run:

```sh
npm run build
npm test
```

These are development checks, not project acceptance. For a place with admitted trust context and native receipts, run the product judgement as well:

```sh
npx @lapxo/bound@0.1.0 fold --check
```

Preserve a refusal and its exit status in your report. Do not borrow a neighbouring checkout's ledger or substitute local bytes for a named pin.

## Make the smallest useful change

Bound owns admission, folding and evidence. Topos owns grammar, forms, classes, views and their contracts. A selected topos owns domain measurement. Obligations owns the algebra. Keep each change in its layer; do not put a domain decoder, path-based inference or a fallback for a missing pin into Bound.

An algebra change needs an independent oracle and a counterexample. A host change needs evidence for authentic bytes, failure propagation or reuse. A view change needs its declared region and implementation identity. A test should fail for a plausible incorrect implementation, not assert a source string or repeat the same expression on both sides.

Keep regressions for changed signatures, unauthorized coverage, exact-id withdrawal, conflicting evidence, local versus travelling acts, corrupt content and duplicate delivery. Consolidate repeated setup and duplicate scenarios without removing distinct falsifiers.

## Propose and admit

Keep proposal and signed-lot files outside the repository. Use the current admitted wire, by=target, and no preassigned epoch or signature. The team's admitted key signs the lot; Bound admits it under scope coverage. The [usage guide](docs/usage.md) explains the transaction and external key-file requirements.

Send the proposed lines with the leaf changes they render. A hand-edited render is evidence of the intended change, not an admitted contribution. Do not edit the accepted TARGET to make a test or ceiling pass. If a render disagrees with the lock, fix the proposed lines and re-render it.

Commit only the project's TARGET.bound and native receipts.bound as bound files. The first .gitignore line excludes .bound/. Do not commit keys, stores, ledgers, caches, capsules, archives or vendored dependencies.

## Submit a pull request

Explain the concrete behavior before and after the change, the affected layer, and the checks you ran. Include stdout, stderr and exit status for a CLI case. State which reader and input bytes produced the evidence; a source harness is not an installed-package proof.

Policy changes receive explicit team review separately from measurements of the proposed source. Keep incompatible readings and their origins visible. Never remove a failing test or weaken a ceiling to obtain acceptance. Withdraw statements through their admitted history; do not rewrite prior signatures, tags or releases.

Documentation and workflows follow the same review: propose their lines and include the rendered changes.
