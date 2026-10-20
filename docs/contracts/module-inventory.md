# Verified module inventory

`moduleInventory` from `@lapxo/bound/closure/native` projects the already verified executable delivery through the existing closure verifier. Its unit is a module, not a symbol. It neither compiles nor executes the offered code and introduces no second traversal or dependency parser.

The receiver supplies exact delivery bytes, their expected SHA-256 digest, the existing finite member/source/response-byte limits, declaration context (`scope`, `by`, `at`) and exactly one source/version declaration for each reached snapshot. Source and version are receiver declarations; the snapshot identifies bytes and does not authenticate a publisher's version claim.

Each reached module becomes an existing canonical wire line. Its digest is `value`; `about` contains the `module-inventory-record/1` profile: `unit`, `source`, `version`, `snapshot`, `module`, `digest`, and `reachedFrom`. `reachedFrom` identifies the verified closure which reached the module, not an immediate importing module. The output also names the exact delivery and closure identities. No new wire fields or fixed application regions are introduced.

An unreachable module does not enter the executable closure. A different source-envelope identity may change provenance and the inventory receipt even if the executable sources remain equal. Missing or altered module digests and changed carrier bytes refuse through the existing delivery verifier; they are integrity failures, not forks. Incomplete or duplicate source declarations refuse without a partial inventory.

## Native quartet

Two unrelated carriers, field notes and water levels, contain two reached modules and one excluded module. The native publication process vector imports the compiled public API, compares the exact canonical inventory with its captured `.bound` sample, verifies repetition and rejects changed carrier bytes, missing module digests and absent source declarations. Declared case inputs commit the positive carrier, expected inventory and negative carrier. The two cases run under the existing publication instrument and its unchanged budgets.

The contract is rendered by the existing selected text renderer from a prospective public text declaration. Owner admission, final Root receipts, the release archive and another-machine portability remain separate obligations.
