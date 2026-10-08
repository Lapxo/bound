export function unpipe(value) {
    const out = [];
    let at = '';
    for (let i = 0; i < value.length; i++) {
        const c = value[i];
        if (c === '\\') {
            const next = value[i + 1];
            if (next !== '|' && next !== '\\')
                return null;
            at += next;
            i += 1;
        }
        else if (c === '|') {
            out.push(at);
            at = '';
        }
        else {
            at += c;
        }
    }
    out.push(at);
    return out;
}
const OPEN = '*';
const num = (s) => {
    if (!/^-?\d+(\.\d+)?$/.test(s))
        return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
};
/**
 * A number as the wire writes it, the only spelling it reads: decimal digits, a minus when negative and a fraction
 * when it has one, never an exponent, a hex prefix, a leading dot or padding. The digits are the shortest that read
 * back to the number, so a second head in any language writes the same bytes; a number that is not finite has none.
 */
export function decimal(n) {
    if (!isFinite(n))
        throw new Error(`REFUSE·wire decimal: \`${n}\` is not a finite number`);
    const got = /^(-?)(\d)(?:\.(\d+))?e([+-])(\d+)$/.exec(String(n));
    if (got === null)
        return String(n);
    const [, sign = '', lead = '', rest = '', ahead = '', exp = '0'] = got;
    return ahead === '+' ? `${sign}${lead}${rest}${'0'.repeat(Number(exp) - rest.length)}` : `${sign}0.${'0'.repeat(Number(exp) - 1)}${lead}${rest}`;
}
/**
 * The forms this reader parses, each with the grammar that reads its value. The alphabet of forms is what these
 * implement — never a list kept beside them, which the lock could move and the list could not.
 */
const GRAMMARS = {
    interval: (value) => {
        const at = value.indexOf('..');
        if (at < 0)
            return null;
        const lo = value.slice(0, at);
        const hi = value.slice(at + 2);
        const l = lo === OPEN ? null : num(lo);
        const h = hi === OPEN ? null : num(hi);
        if ((lo !== OPEN && l === null) || (hi !== OPEN && h === null))
            return null;
        return { kind: 'interval', lo: l, hi: h };
    },
    alphabet: (value) => {
        const values = unpipe(value);
        return values === null ? null : { kind: 'enumerated', values };
    },
    ladder: (value) => {
        const parts = unpipe(value);
        if (parts === null || parts.length !== 2)
            return null;
        return { kind: 'band', floor: parts[0] ?? '', ceiling: parts[1] ?? '' };
    },
};
export function boundOf(form, value, grammars) {
    const extra = Array.isArray(grammars) ? grammars.find((g) => g.form === form) : undefined;
    if (extra)
        return extra.parse(value);
    return GRAMMARS[form]?.(value) ?? null;
}
export const BOUND_FORMS = Object.keys(GRAMMARS);
export const REF_RELATIONS = ['within', 'copies', 'derives'];
