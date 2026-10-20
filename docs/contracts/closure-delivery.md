# Verified executable closure delivery

Needs are arbitrary declared names, not a kernel profile enumeration.

All requested entries share the existing moduleClosure traversal; no second walker, parser or algebra.

Host requires already authenticated snapshot identities; a bundle digest establishes content identity, not authority or correctness.

Delivery preserves each reached JS/JSON member and explicitly pinned notices byte for byte. Separate digests identify the closure manifest and the exact UTF-8 JSON container.

Canonical delivery sorts needs, reached modules, library bindings and notices; duplicate needs do not duplicate code; unsupported executable forms refuse by name.

Mandatory member, source byte and response byte budgets apply before delivery. Pre-aborted or observed cancellation refuses. Synchronous work is not a preemptible execution sandbox.

Portable ESM delivery refuses host builtins, runtime loader access, CommonJS loads, calculated/escaped loader expressions and unsupported URL spellings before entry execution.

Consumer verifies the expected container digest and repeats the same closure preflight over exactly the delivered members. Derived import maps are never trusted as authority.

The host must verify actual mounted bytes again before execution; the test host demonstrates this but is not a public browser host.

Native, program and worker custody remains in force. A pinned syntax analyzer detects unsupported loading expressions before execution; Node inventories and links the executable modules. Authenticated world loads require a declared closure and verified mounted bytes. This preflight is not a JavaScript execution sandbox.

No external fetch or general demand resolver is introduced. Missing bytes remain outside completed delivery and must be resolved by the existing host contract.
