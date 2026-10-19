# Public refusal catalog

Source of truth: `refusals.bound` (`bound-refusals@1`), read through the existing wire parser. `readRefusalCatalog` and `describeRefusal` are exported from `/reference`; resolve `@lapxo/bound/refusals` for the published lines. The digest of these exact lines is bound into the authenticated reference context.

`BoundRefusal.code` is stable; diagnostic text is not a code. Native CLI refusals retain the diagnostic and emit a `bound-refusal@1` JSON record with code, category, meaning, next and catalog digest. Recommendations grant no authority and execute nothing. If the installed catalog cannot be read or validated, the CLI emits `catalog/invalid` with metadata explicitly `unmeasured`; it never fabricates a catalog digest or recursively formats that failure. A consumer checks the catalog bytes against its independently accepted context digest before parsing; parsing alone proves no authority. Legacy operations without a specific public code use `operation/failed`; no diagnostic is classified by regex. This does not claim a distinct code for every historical diagnostic. Successful four-state results remain results, never refusal codes.

| Code | Class | Meaning | Suggested next |
| --- | --- | --- | --- |
| reference-export/source | input | The source URL is not a canonical standing-reference location. | check-source |
| reference-export/context | interpretation | Required admitted export policy or exact contract bytes are missing or conflicting. | inspect-standing |
| reference-export/budget | resource | The export exceeds or lacks its explicitly declared record or byte budget. | inspect-resource-lines |
| reference-export/authority | authority | The selected key is not authorized for the snapshot proof at this epoch. | inspect-authority |
| reference-export/signer | host | The selected signer failed or returned a signature that does not verify. | inspect-signer |
| reference-export/history | authority | The current carrier profile cannot represent this historical authority; no original is silently removed. | inspect-standing-contract |
| catalog/invalid | interpretation | The refusal catalog is malformed, duplicated or incomplete. | resolve-catalog |
| reference/format | input | The reference has an unsupported or noncanonical shape. | check-reference |
| standing/view | interpretation | The place has not declared the public standing view. | declare-standing-view |
| standing/query | input | Standing accepts only the local committed projection. | query-local-standing |
| reference-export/usage | input | Reference export requires exactly one source and explicit signing options. | check-export-arguments |
| authenticated-reference/context | interpretation | The supplied interpretation context or snapshot binding is inconsistent. | resolve-public-context |
| authenticated-reference/budget | resource | The declared record or byte budget is invalid or exceeded. | inspect-resource-lines |
| authenticated-reference/transport | host | The content port failed or returned shared mutable bytes. | inspect-content-port |
| authenticated-reference/integrity | integrity | Carrier bytes or the snapshot commitment differ from their declared digest. | resolve-exact-bytes |
| authenticated-reference/framing | input | The carrier is not the canonical supported UTF-8 frame. | check-carrier |
| authenticated-reference/wire | input | An original record is not canonical supported wire. | check-original-records |
| authenticated-reference/authority | authority | The proof or an original lacks admitted authority under the supplied context. | inspect-authority |
| authenticated-reference/history | interpretation | This carrier profile cannot authenticate configuration withdrawal history. | request-admitted-standing |
| authenticated-reference/object-context | interpretation | The existing object validator refused the declared form or context. | inspect-object-context |
| authenticated-reference/identity | integrity | The semantic standing differs from the reference identity. | resolve-standing |
| operation/failed | host | An operation failed without a more specific public code; details are diagnostic only. | inspect-diagnostic |
| operation/usage | input | The command arguments do not describe a supported public operation. | check-arguments |
| reference/backend | interpretation | The host did not select a supported explicit reference backend. | select-reference-backend |
| reference/cancelled | host | The opening was interrupted before a complete result. | inspect-interruption |
| host-port/budget | resource | A host port lacks a valid finite budget or exceeds its byte bound. | inspect-resource-lines |
| host-port/cancelled | host | A host operation was cancelled before a complete result. | inspect-interruption |
| host-port/timeout | host | A host operation exceeded its declared lifetime. | inspect-host-port |
| host-port/failed | host | A declared host callback failed; no successful result is returned. | inspect-host-port |
| host-port/integrity | integrity | Content bytes differ from the requested SHA-256 identity. | resolve-exact-bytes |
| host-port/response | host | A host response has an unsupported shape or shared mutable bytes. | inspect-host-port |
| reading-identity/context | interpretation | The reading lacks its complete declared execution context. | inspect-reading-context |
| reading-identity/budget | resource | The place lacks one finite declared preparation limit. | inspect-resource-lines |
| reading-identity/selection | interpretation | The requested reader is not adopted by this place. | inspect-reader-selection |
| reading-identity/projection | interpretation | The adopted reader has no supported input projection. | declare-input-projection |
| reading-identity/integrity | input | Current input or retained carrier bytes differ from their committed bytes. | resolve-verified-bytes |
| reading-identity/failed | operation | The existing native preparation boundary refused; the diagnostic retains its cause. | inspect-native-diagnostic |

Native quartet: `refusals.publication.json`. `vectors/native/refusals.vector.json` checks the wire catalog, its derived page, duplicate/missing records, and real export/inspection refusals in two places. No failed operation becomes a successful receipt. The captured semantic marker is:

```text
REFUSALS lines · unique codes · exact metadata · duplicate refused
```

Specific producers cover reference syntax, standing query/view, native export usage/source/context/budget/authority/signer/history, and authenticated inspection context/budget/transport/integrity/framing/wire/authority/history/object-context/identity. Numeric CLI usage and uncoded legacy failures use the explicitly generic codes above; diagnostics remain unclassified. B2/B5 may add codes only by changing these versioned contract bytes and their vectors.
