export function formatSignature(algorithm, raw) {
    return `${algorithm}:${raw}`;
}
export function parseSignature(value) {
    const colon = value.lastIndexOf(':');
    if (colon <= 0 || colon === value.length - 1)
        return null;
    return { algorithm: value.slice(0, colon), raw: value.slice(colon + 1) };
}
/** The fields a signature covers: every field but the signature itself, with the signer named. */
export function signedFieldsOf(fields, signer) {
    const covered = { ...fields, by: signer };
    delete covered['sig'];
    return covered;
}
