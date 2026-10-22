# Public refusal catalog

Source of truth: `refusals.bound` (`bound-refusals@1`), read through the existing wire parser. `readRefusalCatalog` and `describeRefusal` are exported from `/reference`; resolve `@lapxo/bound/refusals` for the published lines. The digest of these exact lines is bound into the authenticated reference context.

`BoundRefusal.code` is stable; diagnostic text is not a code. Native CLI refusals retain the diagnostic and emit a `bound-refusal@1` JSON record with code, category, meaning, next and catalog digest. Recommendations grant no authority and execute nothing. If the installed catalog cannot be read or validated, the CLI emits `catalog/invalid` with metadata explicitly `unmeasured`; it never fabricates a catalog digest or recursively formats that failure. A consumer checks the catalog bytes against its independently accepted context digest before parsing; parsing alone proves no authority. Legacy operations without a specific public code use `operation/failed`; no diagnostic is classified by regex. This does not claim a distinct code for every historical diagnostic. Successful four-state results remain results, never refusal codes.

Producer is read from the existing `by` field in each catalog code record: `bound` names Bound and `topos` names Topos. These are source declarations, not signature or admission grants. The two Topos card result codes retain their native next actions; no consumer application producer is inferred.

| Code | Class | Meaning | Suggested next | Producer |
| --- | --- | --- | --- | --- |
| reference-export/source | input | The source URL is not a canonical standing-reference location. | check-source | bound |
| reference-export/context | interpretation | Required admitted export policy or exact contract bytes are missing or conflicting. | inspect-standing | bound |
| reference-export/budget | resource | The export exceeds or lacks its explicitly declared record or byte budget. | inspect-resource-lines | bound |
| reference-export/authority | authority | The selected key is not authorized for the snapshot proof at this epoch. | inspect-authority | bound |
| reference-export/signer | host | The selected signer failed or returned a signature that does not verify. | inspect-signer | bound |
| reference-export/history | authority | The current carrier profile cannot represent this historical authority; no original is silently removed. | inspect-standing-contract | bound |
| catalog/invalid | interpretation | The refusal catalog is malformed, duplicated or incomplete. | resolve-catalog | bound |
| reference/format | input | The reference has an unsupported or noncanonical shape. | check-reference | bound |
| standing/view | interpretation | The place has not declared the public standing view. | declare-standing-view | bound |
| standing/query | input | Standing accepts only the local committed projection. | query-local-standing | bound |
| reference-export/usage | input | Reference export requires exactly one source and explicit signing options. | check-export-arguments | bound |
| authenticated-reference/context | interpretation | The supplied interpretation context or snapshot binding is inconsistent. | resolve-public-context | bound |
| authenticated-reference/budget | resource | The declared record or byte budget is invalid or exceeded. | inspect-resource-lines | bound |
| authenticated-reference/transport | host | The content port failed or returned shared mutable bytes. | inspect-content-port | bound |
| authenticated-reference/integrity | integrity | Carrier bytes or the snapshot commitment differ from their declared digest. | resolve-exact-bytes | bound |
| authenticated-reference/framing | input | The carrier is not the canonical supported UTF-8 frame. | check-carrier | bound |
| authenticated-reference/wire | input | An original record is not canonical supported wire. | check-original-records | bound |
| authenticated-reference/authority | authority | The proof or an original lacks admitted authority under the supplied context. | inspect-authority | bound |
| authenticated-reference/history | interpretation | This carrier profile cannot authenticate configuration withdrawal history. | request-admitted-standing | bound |
| authenticated-reference/object-context | interpretation | The existing object validator refused the declared form or context. | inspect-object-context | bound |
| authenticated-reference/identity | integrity | The semantic standing differs from the reference identity. | resolve-standing | bound |
| operation/failed | host | An operation failed without a more specific public code; details are diagnostic only. | inspect-diagnostic | bound |
| operation/usage | input | The command arguments do not describe a supported public operation. | check-arguments | bound |
| reference/backend | interpretation | The host did not select a supported explicit reference backend. | select-reference-backend | bound |
| reference/cancelled | host | The opening was interrupted before a complete result. | inspect-interruption | bound |
| host-port/budget | resource | A host port lacks a valid finite budget or exceeds its byte bound. | inspect-resource-lines | bound |
| host-port/cancelled | host | A host operation was cancelled before a complete result. | inspect-interruption | bound |
| host-port/timeout | host | A host operation exceeded its declared lifetime. | inspect-host-port | bound |
| host-port/failed | host | A declared host callback failed; no successful result is returned. | inspect-host-port | bound |
| host-port/integrity | integrity | Content bytes differ from the requested SHA-256 identity. | resolve-exact-bytes | bound |
| host-port/response | host | A host response has an unsupported shape or shared mutable bytes. | inspect-host-port | bound |
| reading-identity/context | interpretation | The reading lacks its complete declared execution context. | inspect-reading-context | bound |
| reading-identity/budget | resource | The place lacks one finite declared preparation limit. | inspect-resource-lines | bound |
| reading-identity/selection | interpretation | The requested reader is not adopted by this place. | inspect-reader-selection | bound |
| reading-identity/projection | interpretation | The adopted reader has no supported input projection. | declare-input-projection | bound |
| reading-identity/integrity | input | Current input or retained carrier bytes differ from their committed bytes. | resolve-verified-bytes | bound |
| reading-identity/failed | operation | The existing native preparation boundary refused; the diagnostic retains its cause. | inspect-native-diagnostic | bound |
| engine/input | input | The object byte request is not a supported canonical profile. | inspect-request | bound |
| engine/context | interpretation | The receiver-selected context does not admit the requested object history. | inspect-context | bound |
| computation/context | interpretation | The question, implementation, policy, input or result does not match the receiver-selected computation context. | inspect-context | bound |
| computation/budget | resource | The computation lacks or exceeds its declared byte or execution budget. | inspect-resource-lines | bound |
| computation/signature | authority | The computation signature does not verify with the receiver-selected signer. | inspect-signer | bound |
| computation/authority | authority | The selected computation signer is absent, retired or outside coverage. | inspect-authority | bound |
| conformance/context | interpretation | The receiver supplied missing or invalid suite, implementation or contract identities. | inspect-context | bound |
| conformance/budget | resource | The suite exceeds its declared byte or case budget. | inspect-resource-lines | bound |
| conformance/coverage | interpretation | The suite omits a required rule or refusal, or names undeclared coverage. | complete-suite | bound |
| conformance/integrity | integrity | The supplied suite bytes do not match the digest chosen by the receiver. | verify-suite-bytes | bound |
| conformance/suite | input | The suite is malformed, empty, duplicated or uses an unsupported byte profile. | inspect-suite | bound |
| reference/transport | host | The receiver transport policy does not admit this origin, redirect or scheme. | inspect-transport-policy | bound |
| reader/response | host | The declared reader failed or returned an unsupported response envelope. | inspect-reader-response | bound |
| admission/clock | interpretation | Existing admission evidence requires an explicit valid clock. | inspect-admission-clock | bound |
| admission/evidence | host | The existing admission evidence boundary failed with a retained native diagnostic. | inspect-diagnostic | bound |
| admission/inert | interpretation | No existing admitted reading meets the proposed ceilings. | fold-declared-inputs | bound |
| admission/takes | authority | The existing native demand judgment refuses the proposed admission. | inspect-demand-judgment | bound |
| admission/withdraw | authority | An existing declared reader still consumes the file proposed for removal. | inspect-file-consumers | bound |
| authority-card/budget | resource | The authority card request lacks finite admitted limits or exceeds them. | inspect-resource-lines | bound |
| authority-card/content | input | The admitted authority request content is unavailable through the bounded content store. | supply-selected-content | bound |
| authority-card/integrity | integrity | Selected authority request bytes differ from their admitted digest or text encoding. | inspect-request-bytes | bound |
| authority-card/selection | interpretation | The authority card request lacks one explicit admitted digest selection. | inspect-admitted-selection | bound |
| authority-preflight/budget | resource | The authority preflight exceeds its finite action, record or byte budget. | inspect-resource-lines | bound |
| authority-preflight/context | interpretation | The explicit authority epoch, clock or record context is invalid. | inspect-authority-context | bound |
| authority-preflight/context-changed | integrity | Authenticated history or selected place bytes changed during authority preparation. | refresh-authority-context | bound |
| authority-preflight/failed | host | The authority preflight failed without a more specific native cause. | inspect-diagnostic | bound |
| authority-preflight/place | input | The requested relative authority place is not a valid coordinate. | inspect-place-coordinate | bound |
| authority-preflight/request-action | input | The request action is unsupported or its exact records are malformed. | inspect-request-actions | bound |
| authority-preflight/request-budget | resource | The request lacks valid finite action or byte limits or exceeds its record budget. | inspect-resource-lines | bound |
| authority-preflight/request-clock | interpretation | The explicit request clock and horizon do not agree or contain the requested time. | inspect-request-clock | bound |
| authority-preflight/request-context | interpretation | The request context fields or explicit epoch, horizon and resources are inconsistent. | inspect-request-context | bound |
| authority-preflight/request-format | input | The authority request does not follow the exact public request profile. | inspect-request-format | bound |
| authority-preflight/request-integrity | integrity | Authority request bytes differ from the exact digest or exceed the receiving byte limit. | inspect-request-bytes | bound |
| authority-preflight/stale-epoch | authority | The requested authority epoch differs from the current authenticated history. | refresh-authority-context | bound |
| host/budget | resource | A host operation exceeds or lacks its declared finite resource budget. | inspect-resource-lines | bound |
| host/cancelled | host | The caller cancelled the current operation. | retry-if-required | bound |
| host/context | interpretation | The required host context or operation-scoped capability is missing or malformed. | inspect-host-context | bound |
| installed/cancelled | host | The caller cancelled the installed package reading. | retry-if-required | bound |
| installed/export | interpretation | The requested package export selector does not name a supported explicit member. | inspect-package-exports | bound |
| installed/external-member | integrity | A selected package member is a link, special file or path outside the physical inventory. | inspect-package-members | bound |
| installed/inventory | input | The complete package member inventory has an invalid coordinate, duplicate or digest. | inspect-package-inventory | bound |
| installed/manifest | interpretation | The admitted shape manifest is missing, invalid or outside the supported ESM contract. | inspect-package-manifest | bound |
| installed/member-integrity | integrity | Installed member bytes differ from their declared digest. | refresh-installed-inventory | bound |
| installed/missing-member | integrity | A required installed member or selected export is absent. | restore-declared-member | bound |
| installed/pin | interpretation | A declared dependency binding conflicts or fails to name its selected snapshot. | inspect-dependency-pins | bound |
| installed/resources | resource | The installed package reading exceeds or lacks its declared finite resources. | inspect-resource-lines | bound |
| installed/text-member | input | A declared executable text member is not valid UTF-8. | inspect-member-bytes | bound |
| installed/uninventoried-member | integrity | An installed regular file has no entry in the complete expected inventory. | refresh-installed-inventory | bound |
| physical-lines/context | interpretation | The explicit physical inventory, resource policy or reading coordinates are invalid. | inspect-physical-reading | bound |
| physical-lines/failed | host | The physical reading failed with a retained native diagnostic. | inspect-diagnostic | bound |
| physical-lines/integrity | integrity | Physical inventory bytes or witness bindings changed or differ from the actual reading. | refresh-physical-reading | bound |
| physical-lines/selection | interpretation | The line ceiling lacks a unique declared region or selector set. | inspect-region-declarations | bound |
| physical-lines/witness | authority | The actual reading handle, witness record or admitted proof verification is unavailable or invalid. | inspect-reading-witness | bound |
| profile/ambiguous-authority | authority | More than one admitted statement claims the same profile field binding. | select-exact-statement | bound |
| profile/ambiguous-field | interpretation | More than one selected field binding names the same contract. | inspect-field-bindings | bound |
| profile/authority-required | authority | No current admitted statement binds the exact field and source profile digest. | supply-covered-statement | bound |
| profile/declaration | interpretation | The Topos profile declaration or pinned parent bytes failed the selected contract. | inspect-profile-declaration | bound |
| profile/incompatible | interpretation | Selected profile fields have no compatible inhabited composition. | inspect-profile-composition | bound |
| profile/missing-parent | input | A digest-pinned parent profile has no supplied bytes. | supply-pinned-parent | bound |
| profile/undeclared-field | interpretation | A profile field has no matching selected contract and coordinate. | declare-selected-field | bound |
| profile/widening-witness-required | authority | A widened inherited constraint has no witness accepted by the existing native judge. | supply-valid-witness | bound |
| reading-witness | authority | The admitted reading-witness evidence is required or failed its native proof and policy checks. | inspect-reading-witness | bound |
| release/category-ambiguous | interpretation | A release category or requested pin is declared more than once. | select-one-category | bound |
| release/category-class | interpretation | The requested release pin class or digest algorithm differs from its declared category. | inspect-category-class | bound |
| release/category-missing | interpretation | A requested release pin has no declared category. | declare-release-category | bound |
| release/pin-ambiguous | interpretation | More than one artifact line matches the exact release category. | select-exact-artifact | bound |
| release/pin-integrity | integrity | The selected artifact digest differs from the requested category pin. | inspect-artifact-pin | bound |
| release/pin-missing | input | No authenticated artifact line matches the requested release category. | supply-covered-artifact | bound |
| card-stale | authority | The authority card is outside its accepted horizon or no longer matches the verified current context. | refresh-card | topos |
| not-in-card | authority | The requested action identity is absent from the verified authority card. | request-card-entry | topos |
| host/busy | host | A native host already owns the selected place or has an active request. | reuse-or-close-existing-host | bound |
| host/closed | host | The consumer-owned native host ended before this request could complete. | recover-act-or-start-host | bound |
| host/timeout | resource | The native host did not establish its declared startup boundary before the deadline. | inspect-resource-lines | bound |
| host/signer-mismatch | host | The selected signer does not match the prepared signing lot. | inspect-signer | bound |
| host/unbound-signer | host | The receiver has no binding for the selected signer. | inspect-host-port | bound |
| host/foundation-state | host | An existing store is empty or does not authenticate as an admitted place. | inspect-standing | bound |
| host/foundation-required | host | The birth lock must be founded before this operation. | found-birth-lock | bound |
| host/instrument-pin | host | The selected installed instrument bytes do not match the receiver pin. | inspect-artifact-pin | bound |

Each `next` record declares its named action in machine-readable `about` data (`bound-refusal-action@1`), inside these same catalog lines. Equal action names have equal descriptions. Actions are advisory: none supplies a key, changes authority or retries an act automatically.
