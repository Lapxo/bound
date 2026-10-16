# Public host ports

`/engine` and `/reference` export `readContent`, `retainContent` and `invokeSigningPort`, with `ContentReadPort`, `PersistencePort`, `SigningPort`, `DigestPort` and `PortLimits`. There is no default network, store, account or signer. `objectFold` remains pure and never calls a port.

Every operation takes an explicit positive safe-integer `timeoutMs` and `maxBytes`, and an optional AbortSignal. Invalid limits and pre-cancellation refuse before the callback. Acquisition, digest calculation and retention share the operation lifetime. A timeout aborts the supplied signal and returns no successful result. This is a cooperative host boundary, not preemption of synchronous JavaScript or sandbox confinement.

`readContent(source, digest, ports, limits, signal)` invokes the supplied read callback and SHA-256 callback, checks byte bounds before copying/hashing, rejects shared buffers, and verifies an owned snapshot against the requested digest. Location carries no authority.

`retainContent(digest, bytes, ports, limits, signal)` checks identity before calling the host's atomic byte-retention callback. Its acknowledgement contains only digest and byte count. It is not a signed receipt, admission or permission to reuse a response. The host must implement atomic retention and cooperate with cancellation. A callback that ignores cancellation may finish retaining bytes after the caller has refused; no success, act or authority follows from those bytes. Opening and projection never retain automatically.

`invokeSigningPort(lot, sign, limits, signal)` uses the existing Topos signing request/response framing. It acquires protocol-shaped signatures; it does not decide authority or certify them cryptographically. Native export can receive `hostSigner: {name, sign}` through `/reference/native`. The name must match the admitted signer selection, and cannot be combined with a key-file override. The existing consent path verifies every returned signature against the admitted key, era, scope and epoch before returning a carrier. No key material enters the engine.

Native opening accepts `content: {name, read}`. Its name must match the admitted transport selection, with that selection's existing byte and lifetime bounds. The host callback cannot be chosen by a carrier, reference or repository. The existing inspector verifies the returned carrier again and the selected backend projects only verified records. There is no backend fallback.

Public port failures use the machine refusal catalog: `host-port/budget`, `cancelled`, `timeout`, `failed`, `integrity`, `response`. Native acquisition failures retain their enclosing reference refusal. Host diagnostics are not returned as authority or parsed as codes.

Native vector output, in two real admitted places:

```text
PORTS owned content · verified retention · signer content persistence failures · budget integrity cancellation timeout refused
HOST host-sensor · declared signer and content injected · real signature verified · wrong binding refused · no commit
HOST host-editorial · declared signer and content injected · real signature verified · wrong binding refused · no commit
```
