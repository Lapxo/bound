# @lapxo/bound

![license MIT](https://img.shields.io/badge/license-MIT-6b7280)

Declare what must hold. Read what does. Keep the evidence

```bash
npx @lapxo/bound@0.1.3 fold --as help
npx @lapxo/bound@0.1.3 fold
```

## How Bound reads a project

Bound reads a project's admitted statements and observations through its selected Topos, then renders the declared views and records their inputs in receipts. The example below explains the object; a file-fold alone does not calculate its intervals.

## A meeting everyone can understand

Ana is available from 10 to 14, Luis from 12 to 16, and the room from 10 to 13. Their common availability is 12 to 13. A boss available from 18 to 20 makes the encounter incompatible. Withdrawing that exact reading restores the overlap; Ana, Luis and the room remain.

With an interval form, those are object operations: observe independent claims, meet them, withdraw by id, and read the state. A narrower compatible meet is not a fork. Folding a file of declarations alone does not calculate meeting availability.

The same pattern applies to a delivery window, a sensor's allowed range, or an agreed performance budget. The chosen topos determines the units and how evidence is obtained. Bound does not supply a meeting-specific rule.

## See how information holds together

![Cells, travelling bounds and a local join](https://raw.githubusercontent.com/Lapxo/bound/2053bb6d6188f04538114eae6a0add5166944ed3/docs/readme-assets/atlas.svg)

A travelling ceiling on B reaches C and G through their declared rest. A local join widens B alone. D is independent. The figure shows those relations; point size and camera distance do not measure information.

| State | Meaning |
| --- | --- |
| REQUIRED | Compatible bounds, fewer than two independent origins. |
| FREE | Independent origins meet and their encounter fits the bounds. |
| CONFLICT | Bounds conflict, or eligible claims have no common encounter. |
| FORBIDDEN | An inhabited encounter does not fit the bounds. |

Bounds are checked before origins and claims. A receipt is evidence of a reading, not another origin. Duplicating one does not add freedom.

## Change a project without erasing evidence

Work in the project's directory. Use an existing admitted key identifier and its matching private key stored outside every repository. The admitted key also names its signer with `keys/<who> measure=signer value=file`; `signer/timeout` and `signer/response-bytes` declare its limits. Your public key and coverage belong to the authority contract; possession of a private key alone does not authorize a scope.

```sh
export BOUND_KEY_ID='your-admitted-key-id'
export BOUND_KEY_FILE="$HOME/Private/keys/your-device.pem"
lot_dir="$(mktemp -d)"
```

Have the selected view produce a proposal at `$lot_dir/proposal.bound`, or prepare the project's permitted lines there for review. Unsigned proposals use `by=target`, without a preassigned epoch or `sig`. Lots stay outside the repository; the committed bound files are only `TARGET.bound` and `receipts.bound`.

```sh
npx @lapxo/bound@0.1.3 sign "$lot_dir/proposal.bound" \
  --key "$BOUND_KEY_ID" --key-file "$BOUND_KEY_FILE" \
  > "$lot_dir/signed.bound" &&
npx @lapxo/bound@0.1.3 land "$lot_dir/signed.bound" &&
npx @lapxo/bound@0.1.3 fold
```

`sign` assigns the admitted epoch and writes the signed lot to stdout. `land` validates the whole lot before admission. A refusal is evidence to inspect; it is not success. Do not proceed after a failed signature or admission. The key file is a PKCS8 private key matching the admitted public key; do not put it in the lot, source tree, package or CI artifacts.

For typed object withdrawals, `takes` names the exact claim or mark id. Removing a local join leaves the travelling sign live. For untyped configuration, use the wire's exact withdrawal selectors; do not combine withdrawal and replacement with identical selectors in one lot. Wire alphabet updates supersede by epoch.

[Authority, withdrawals, receipts and PR review](https://github.com/Lapxo/bound/blob/2053bb6d6188f04538114eae6a0add5166944ed3/docs/usage.md).

## Select a topos by what it declares

`sources/<name>` says where a world can be obtained. An admitted `uses/<name>` names the digest of that topos's folded standing: canonical live claims in wire byte order, excluding signature envelopes and host shape. Re-signing the same standing preserves the pin. A changed live form, class, view or offer changes it.

`restsOn` closes artifact bytes separately. A capsule is one offer. Forms, classes and views need no capsule merely to be selected. Runtime and packing do not define standing identity. npm dependency ranges remain package metadata; they are not standing pins.

| Responsibility | Owner |
| --- | --- |
| Meet, state, live acts and rest | Obligations |
| Wire, forms, classes, views and offer contracts | Topos |
| Admission, folding and evidence | Bound |
| Domain measurement and representation | Selected topos |
| Storage, transport and execution | Host |

Cell `restsOn` is the object's relation. Directory prefixes and file summaries are host coordinates, not object rest. Wire tokens are protocol constants, not organization, host, path or key literals.

## Repository rules

Commit `TARGET.bound`, `receipts.bound` and the outputs the forge reads. Ignore `.bound/` from the first line of `.gitignore`. Keep proposals, signed lots, keys, ledgers, caches and dependency blobs outside the published tree.

The lock is the project's own contract and pins. Read a dependency's declarations from its selected standing; do not copy its lines into your lock. README, package metadata and workflows must be renders of admitted declarations. A scan is an observation, not permission to lower a ceiling.

A PR proposes lines and the leaf changes they render. The judge uses the team's accepted contract independently of the proposed revision. Preserve refusals, conflicting origins and unpaid demands. [Repository and contribution rules](https://github.com/Lapxo/bound/blob/2053bb6d6188f04538114eae6a0add5166944ed3/docs/usage.md#repository-and-pr-review).

## An atlas you can question

Information can share a history without sharing a single presentation. The same admitted cells can support a compact status view, a spatial view of their relations, or a focused reading of one disagreement. Each view asks for a region and resolution; its selected topos determines the representation.

This makes changes inspectable. A local act can remain local, travelling bounds can reach dependent cells, and a receipt can name the inputs of the reading you saw. You can ask what changed and what depends on it without turning a drawing into the algebra.

A pin names standing, not a download URL or runtime entry. Its declared artifact dependencies close the bytes needed for an offered operation. The boundary lets a form or view remain meaningful even when it has no executable capsule.

Use Bound where independently attributed observations must be judged against an accepted contract: compatibility between components, operational limits, or a team's project requirements. The selected topos must supply the actual measurements; a digest identifies the evidence without declaring it true.

[Contribute a counterexample or a proposed lot](CONTRIBUTING.md).
