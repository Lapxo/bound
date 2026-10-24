# Digest-bound content redirects

The receiver selects network capabilities; a location and its expected digest do not grant permission to connect. Extend the existing content transport port rather than add a fetch interpreter.

Before the initial connection and every redirect, validate the parsed URL, scheme, origin, DNS answers and the actual address used for the connection. Validation followed by a separate unrestricted resolution does not satisfy this contract. Private, loopback, link-local and reserved destinations are denied unless the receiver explicitly grants internal access. Address normalization must cover IPv4, IPv6 and equivalent encodings.

Without an expected digest or explicit redirect policy, refuse redirects. This policy permits HTTPS-to-HTTPS only. Three redirects is its declared maximum, not an engine cardinality. A stricter receiver limit remains effective. Reject credentials in URLs, invalid or missing Location, unsupported redirect statuses/schemes, downgrade, loops and forbidden destinations. Resolve relative Location against the current URL.

Use a single total deadline, transfer-byte budget and bounded header/hop work for the chain. Dispose intermediate bodies on success, refusal and cancellation. Never reset the budget at a hop. Do not forward Authorization, Proxy-Authorization, cookies or consumer secret headers; the content request does not acquire ambient credentials.

Verify final bytes before acceptance, execution or admission. A digest mismatch never becomes accepted content. A public hop record contains a safe destination projection, status and outcome, never raw credentials, query, fragment or a secret-bearing path. Full diagnostics are not persisted by default. A hash of a secret URL is not by itself a confidentiality guarantee.

The HTTPS test fixture uses explicit test trust and isolated loopback permission. Global TLS verification disablement is forbidden. No implementation-specific hostname, dataset, port or URL is a policy constant. If the pinned form cannot carry a proposed persistent field, leave that producer dependency open or use an explicit receiver host option; do not invent a Bound wire form.

## Acceptance

The language-independent vectors are in `vectors/contracts/bounded-redirects.json`. They specify required observations and effects; they do not certify the baseline implementation. Native runtime conformance requires separately captured execution evidence in two unrelated places. Existing valid evidence is retained, and no zero demand is created by publishing this contract.
