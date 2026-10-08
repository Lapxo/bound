## Typed cell, claim and mark records

The object profile is selected by admitted `wire/object/*` claims in a historical wire snapshot. The epoch of `wire/object/types` is its activation E; a typed record must have epoch >= E. An older record keeps the older grammar. Merely adding object words to `wire/fields` does not admit a typed profile.

`fromLine` selects grammar before validating required fields: a record without `type` remains configuration, retaining its required `at`, `role`, `form`, `measure` and `value`; a typed record selects its exact required/allowed row. Configuration cannot carry object-only fields. An incomplete typed record receives no configuration defaults. The parse result distinguishes configuration from cell/claim/mark. `sign=+1|-1` is an object act, `sig` its signature envelope, and a host sign operation produces that envelope.

The common object envelope is `type`, `scope`, `id`, `epoch`, `by`, `sig`. Object records reject `at`: epoch orders acts, and `widens` names a local join witness. The following is the declared reference profile. The admitted row alphabets, not this table or a host decoder, are the source of required/allowed field permission.

| Row | Fields in addition to the common envelope | Meaning |
| --- | --- | --- |
| cell | form, measure, params, restsOn, topos | Define a cell and its selected form/context. |
| claim/positive | sign, origin, value | Observe an encoded span, sign=+1. |
| claim/negative | sign, takes | Withdraw an exact claim ID, sign=-1. |
| mark/travelling | sign, pole, reach, value | Ceiling sign: sign=+1, pole=ceiling, reach=travels. |
| mark/local | sign, pole, reach, value, widens | Local join: sign=+1, pole=ceiling, reach=local; another mark, retaining the travelling sign. |
| mark/floor-travelling | sign, pole, reach, value | Travelling require: sign=+1, pole=floor, reach=travels; no widens. |
| mark/negative | sign, takes | Withdraw an exact mark ID, sign=-1; no pole/reach/widens. |

Each row has both `wire/object/required/<row>` and `wire/object/allowed/<row>`. Unknown keys, missing required keys, floor/local, floor+widens, and travelling widening refuse without coercion. A configuration demand is unrelated to a floor mark. `by` authenticates a signing key; it is not an independent observation origin.

For a cell, `restsOn=none` represents no parents; otherwise it is a canonical byte-ordered alphabet of coordinates. Several parents are permitted. Only declared cell-coordinate edges form object rest; a directory prefix, a configuration artifact digest, and a host source location do not. Context validation rejects reachable cycles before algebraic parts are requested.

The cell's `topos` names folded standing, and its `params` identifies declared parameter bytes. A selected provider decodes values and supplies origin/witness authorization from admitted evidence. A host does not infer interval endpoints, map a key to an origin, or accept widens as its own witness. Missing pin, artifact, decoder, origin or witness refuses by cause. Cell definitions and pins are immutable in this profile; migration is not inferred.

`objectHistory` preserves typed history separately from configuration; `validateObjectContext` checks IDs, cell ownership, exact takes, witness order and declared rest under the selected context. Exact redelivery is idempotent; one ID with different canonical content refuses. Signature-envelope differences never bypass verification.

After admission, the instrument projects the acts into Obligations. Sign and require travel along declared rest; a witnessed join is local. Descendants inherit travelling marks without local widening. Live exact-ID withdrawals remain confined to their authenticated history. Keys, snapshots, signing devices and repeated receipts do not create independent origins. Compatible meets are not forks. Object states and their precedence come from Obligations; configuration folds do not compute object encounters.
