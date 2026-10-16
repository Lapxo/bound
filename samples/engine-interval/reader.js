// work/bound-0.1.9/repository/node_modules/@lapxo/topos/dist/wire/outcome.js
var fact = (value) => ({ kind: "fact", value });
var abstain = (why) => ({ kind: "abstain", why });
var refuse = (why, named) => ({ kind: "refuse", why, ...named === void 0 ? {} : { named } });

// work/bound-0.1.9/repository/node_modules/@lapxo/topos/dist/wire/values.js
function unpipe(value) {
  const out = [];
  let at = "";
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\") {
      const next = value[i + 1];
      if (next !== "|" && next !== "\\")
        return null;
      at += next;
      i += 1;
    } else if (c === "|") {
      out.push(at);
      at = "";
    } else {
      at += c;
    }
  }
  out.push(at);
  return out;
}
var OPEN = "*";
var num = (s) => {
  if (!/^-?\d+(\.\d+)?$/.test(s))
    return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
};
function decimal(n) {
  if (!isFinite(n))
    throw new Error(`REFUSE\xB7wire decimal: \`${n}\` is not a finite number`);
  const got = /^(-?)(\d)(?:\.(\d+))?e([+-])(\d+)$/.exec(String(n));
  if (got === null)
    return String(n);
  const [, sign2 = "", lead = "", rest = "", ahead = "", exp = "0"] = got;
  return ahead === "+" ? `${sign2}${lead}${rest}${"0".repeat(Number(exp) - rest.length)}` : `${sign2}0.${"0".repeat(Number(exp) - 1)}${lead}${rest}`;
}
var GRAMMARS = {
  interval: (value) => {
    const at = value.indexOf("..");
    if (at < 0)
      return null;
    const lo = value.slice(0, at);
    const hi = value.slice(at + 2);
    const l = lo === OPEN ? null : num(lo);
    const h = hi === OPEN ? null : num(hi);
    if (lo !== OPEN && l === null || hi !== OPEN && h === null)
      return null;
    return { kind: "interval", lo: l, hi: h };
  },
  alphabet: (value) => {
    const values = unpipe(value);
    return values === null ? null : { kind: "enumerated", values };
  },
  ladder: (value) => {
    const parts2 = unpipe(value);
    if (parts2 === null || parts2.length !== 2)
      return null;
    return { kind: "band", floor: parts2[0] ?? "", ceiling: parts2[1] ?? "" };
  }
};
function boundOf(form2, value, grammars) {
  const extra = Array.isArray(grammars) ? grammars.find((g) => g.form === form2) : void 0;
  if (extra)
    return extra.parse(value);
  return GRAMMARS[form2]?.(value) ?? null;
}
var BOUND_FORMS = Object.keys(GRAMMARS);
var REF_RELATIONS = ["within", "copies", "derives"];

// work/bound-0.1.9/repository/node_modules/@lapxo/topos/dist/wire/line.js
var PROTOCOL = "bound-lock/1";
var NEEDS_QUOTE = /[ ="\n\\]/;
function escape(value) {
  if (!NEEDS_QUOTE.test(value))
    return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}
function unescape(token) {
  if (!token.startsWith('"'))
    return NEEDS_QUOTE.test(token) ? null : token;
  if (token.length < 2 || !token.endsWith('"'))
    return null;
  const body = token.slice(1, -1);
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "\\") {
      if (c === '"')
        return null;
      out += c;
      continue;
    }
    const next = body[i + 1];
    if (next === '"')
      out += '"';
    else if (next === "\\")
      out += "\\";
    else if (next === "n")
      out += "\n";
    else
      return null;
    i += 1;
  }
  return out;
}
var UTF8 = new TextEncoder();
function byBytes(a, b) {
  const x = UTF8.encode(a);
  const y = UTF8.encode(b);
  for (let i = 0; i < x.length && i < y.length; i++) {
    if (x[i] !== y[i])
      return x[i] - y[i];
  }
  return x.length - y.length;
}
var unwritten = (fields) => fields["form"] === "interval" && fields["value"] !== void 0 && fields["value"] !== "withdraw" && boundOf("interval", fields["value"]) === null;
function canonical(fields, version = "1") {
  if (unwritten(fields))
    throw new Error(`REFUSE\xB7wire canonical: \`${fields["value"]}\` is no interval the wire writes: two ends, each decimal or *`);
  const keys = Object.keys(fields).sort(byBytes);
  const tokens = keys.map((k) => `${k}=${escape(fields[k])}`);
  return [`${PROTOCOL.split("/")[0]}/${version}`, ...tokens].join(" ");
}
var ABSENT = "-";
function parse(text, options = {}) {
  if (text.includes("\n")) {
    return refuse("a line is one line \u2014 a newline in a value must be escaped as `\\n`");
  }
  const space = text.indexOf(" ");
  const envelope = space === -1 ? text : text.slice(0, space);
  const [name, version] = envelope.split("/");
  if (name !== PROTOCOL.split("/")[0] || !version) {
    return refuse(`no \`bound-lock/<v>\` envelope \u2014 found \`${envelope.slice(0, 24)}\``);
  }
  if (version !== PROTOCOL.split("/")[1]) {
    return abstain(`\`bound-lock/${version}\` is a version this reader does not know`);
  }
  const fields = {};
  const writtenKeys = /* @__PURE__ */ new Set();
  for (const token of tokensOf(space === -1 ? "" : text.slice(space + 1))) {
    if (token === null)
      return refuse("a quoted value is not closed");
    const at = token.indexOf("=");
    if (at <= 0)
      return refuse(`\`${token.slice(0, 24)}\` is not \`key=value\``);
    const key = token.slice(0, at);
    if (writtenKeys.has(key))
      return refuse(`\`${key}\` appears twice \u2014 one line, one value per key`);
    writtenKeys.add(key);
    const value = unescape(token.slice(at + 1));
    if (value === null)
      return refuse(`\`${key}\` has an escaping this format does not define`);
    if (value !== ABSENT)
      fields[key] = value;
  }
  if (unwritten(fields))
    return refuse(`\`${fields["value"]}\` is no interval the wire reads: two ends, each decimal or *`);
  return fact({ version, fields, ...options.preserveKeys ? { keys: [...writtenKeys] } : {} });
}
function* tokensOf(rest) {
  let at = 0;
  while (at < rest.length) {
    while (rest[at] === " ")
      at += 1;
    if (at >= rest.length)
      return;
    let end = at;
    let quoted = false;
    while (end < rest.length && (quoted || rest[end] !== " ")) {
      if (rest[end] === "\\" && quoted)
        end += 1;
      else if (rest[end] === '"')
        quoted = !quoted;
      end += 1;
    }
    if (quoted) {
      yield null;
      return;
    }
    yield rest.slice(at, end);
    at = end;
  }
}

// work/bound-0.1.9/repository/node_modules/@lapxo/topos/dist/wire/grammar.js
var [FORBID, EMPTY, MEMBER, PAIR, STEP, AT, EVERY, ESCAPE] = ["not:", "none", "|", "=", "/", "@", "*", "\\"];
var refuse2 = (grammar, why) => {
  throw new Error(`REFUSE\xB7wire ${grammar}: ${why}`);
};
function alphabet(given) {
  if (typeof given !== "string") {
    const written2 = given.members.map((one) => one.split(ESCAPE).join(ESCAPE + ESCAPE).split(MEMBER).join(ESCAPE + MEMBER)).join(MEMBER);
    if (given.polarity === "forbid")
      return FORBID + written2;
    return written2.startsWith(FORBID) || written2 === EMPTY ? refuse2("alphabet", "a permitted alphabet neither begins with not: nor is the one word none") : written2 || EMPTY;
  }
  const forbid = given.startsWith(FORBID);
  const body = forbid ? given.slice(FORBID.length) : given;
  const members = !forbid && body === EMPTY ? [] : unpipe(body) ?? refuse2("alphabet", "a backslash escapes only a pipe or itself");
  return { polarity: forbid ? "forbid" : "permit", members: members.filter((one) => one !== "") };
}

// work/bound-0.1.9/repository/node_modules/@lapxo/obligations/dist/lattice/errors.js
var UnitError = class _UnitError extends Error {
  code;
  detail;
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "UnitError";
    this.code = code;
    this.detail = Object.freeze({ ...detail });
    Object.setPrototypeOf(this, _UnitError.prototype);
  }
};

// work/bound-0.1.9/repository/node_modules/@lapxo/obligations/dist/lattice/order.js
function build(levels, join2, meet) {
  const n = levels.length;
  for (let i = 0; i < n; i++) {
    if (levels.indexOf(levels[i]) !== i) {
      throw new UnitError("DUPLICATE_LEVEL", `the level \`${levels[i]}\` is declared twice`, {
        level: levels[i]
      });
    }
  }
  const index = new Map(levels.map((l, i) => [l, i]));
  const leq = (a, b) => join2[a][b] === b;
  const total = levels.every((_, i) => levels.every((__, j) => join2[i][j] === i || join2[i][j] === j));
  let simple = true;
  for (let x = 0; x < n && simple; x++) {
    for (let y = 0; y < n && simple; y++) {
      for (let z = 0; z < n; z++) {
        if (meet[x][join2[y][z]] !== join2[meet[x][y]][meet[x][z]]) {
          simple = false;
          break;
        }
      }
    }
  }
  const all = [...levels.keys()];
  const bottomIx = all.find((i) => all.every((j) => leq(i, j))) ?? 0;
  const topIx = all.find((i) => all.every((j) => leq(j, i))) ?? n - 1;
  const joinIrr = all.filter((j) => j !== bottomIx && all.filter((x) => x !== j && leq(x, j)).reduce((acc, x) => join2[acc][x], bottomIx) !== j);
  const meetIrr = all.filter((m) => m !== topIx && all.filter((x) => x !== m && leq(m, x)).reduce((acc, x) => meet[acc][x], topIx) !== m);
  const seen = /* @__PURE__ */ new Set();
  const allDebits = [];
  for (const x of [...joinIrr, ...meetIrr]) {
    if (!seen.has(x)) {
      seen.add(x);
      allDebits.push(x);
    }
  }
  return {
    levels,
    isLadder: total,
    isSimple: simple,
    bottomIx,
    topIx,
    bottom: levels[bottomIx],
    top: levels[topIx],
    leq,
    higher: (a, b) => join2[a][b],
    lower: (a, b) => meet[a][b],
    rank(level) {
      const r = index.get(level);
      if (r === void 0) {
        throw new UnitError("UNKNOWN_LEVEL", `no level \`${level}\` in this scale`, {
          level,
          levels
        });
      }
      return r;
    },
    stateOf(floor, ceiling) {
      if (!leq(floor, ceiling))
        return "CONFLICT";
      if (floor !== bottomIx)
        return "REQUIRED";
      if (ceiling !== topIx)
        return "FORBIDDEN";
      return "FREE";
    },
    joins: () => joinIrr.slice(),
    limits: () => meetIrr.slice(),
    debits: () => allDebits.slice(),
    intervalHeight(lo, hi) {
      if (!leq(lo, hi))
        return null;
      const inside = all.filter((x) => leq(lo, x) && leq(x, hi));
      const covers = (x) => inside.filter((y) => y !== x && leq(x, y) && !inside.some((z) => z !== x && z !== y && leq(x, z) && leq(z, y)));
      const long = /* @__PURE__ */ new Map([[lo, 0]]);
      const short = /* @__PURE__ */ new Map([[lo, 0]]);
      const walk = [...inside].sort((a, b) => inside.filter((z) => leq(z, a)).length - inside.filter((z) => leq(z, b)).length);
      for (const x of walk) {
        const lx = long.get(x);
        const sx = short.get(x);
        if (lx === void 0 || sx === void 0)
          continue;
        for (const y of covers(x)) {
          long.set(y, Math.max(long.get(y) ?? lx + 1, lx + 1));
          short.set(y, Math.min(short.get(y) ?? sx + 1, sx + 1));
        }
      }
      const l = long.get(hi);
      return l !== void 0 && l === short.get(hi) ? l : null;
    }
  };
}
function chain(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new UnitError("EMPTY_CHAIN", "a chain needs at least one level");
  }
  const n = levels.length;
  const grid = (f) => [...Array(n)].map((_, i) => [...Array(n)].map((__, j) => f(i, j)));
  return build(levels, grid(Math.max), grid(Math.min));
}
function order(levels, leq) {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new UnitError("EMPTY_CHAIN", "an order needs at least one level");
  }
  const n = levels.length;
  const bound = (a, b, up) => {
    const bs = [...Array(n).keys()].filter((x) => up ? leq[a][x] && leq[b][x] : leq[x][a] && leq[x][b]);
    const least = bs.filter((x) => bs.every((y) => up ? leq[x][y] : leq[y][x]));
    if (least.length !== 1) {
      throw new UnitError("MALFORMED", `\`${levels[a]}\` and \`${levels[b]}\` have ${least.length} ${up ? "lowest common" : "highest common"} bounds, so this is not a usable scale`, { levels: [levels[a], levels[b]] });
    }
    return least[0];
  };
  const grid = (up) => [...Array(n)].map((_, i) => [...Array(n)].map((__, j) => bound(i, j, up)));
  return build(levels, grid(true), grid(false));
}

// work/bound-0.1.9/repository/node_modules/@lapxo/obligations/dist/debit/unit.js
function unit(subject, bounds) {
  return { subject, floor: bounds.floor, ceiling: bounds.ceiling };
}
var permitAll = (c, subject) => unit(subject, { floor: c.bottom, ceiling: c.top });
function state(c, u) {
  return c.stateOf(c.rank(u.floor), c.rank(u.ceiling));
}
function band(c, units, from, onFloor, onCeiling) {
  let floor = from.floor;
  let ceiling = from.ceiling;
  for (const u of units) {
    floor = onFloor(floor, c.rank(u.floor));
    ceiling = onCeiling(ceiling, c.rank(u.ceiling));
  }
  return { subject: units[0].subject, floor: c.levels[floor], ceiling: c.levels[ceiling] };
}
function fuse(c, units) {
  if (units.length === 0)
    return permitAll(c, "");
  return band(c, units, { floor: c.bottomIx, ceiling: c.topIx }, (a, b) => c.higher(a, b), (a, b) => c.lower(a, b));
}
function entails(c, a, b) {
  const [af, ac] = [c.rank(a.floor), c.rank(a.ceiling)];
  const [bf, bc] = [c.rank(b.floor), c.rank(b.ceiling)];
  return c.leq(bf, af) && c.leq(ac, bc);
}

// work/bound-0.1.9/repository/node_modules/@lapxo/obligations/dist/debit/packed.js
var WIDTH = 32;

// work/bound-0.1.9/repository/node_modules/@lapxo/obligations/dist/debit/masks.js
function chunkCount(n) {
  if (n <= 0)
    return 0;
  return Math.ceil(n / WIDTH);
}
var WideMask = class _WideMask {
  words;
  width;
  constructor(width, words) {
    this.width = width;
    this.words = words ?? new Uint32Array(chunkCount(width));
  }
  static fromTokens(tokens, allowed) {
    const m = new _WideMask(tokens.length);
    tokens.forEach((t, i) => {
      if (allowed.has(t))
        m.set(i);
    });
    return m;
  }
  set(bit) {
    if (bit < 0 || bit >= this.width) {
      throw new UnitError("MALFORMED", `bit ${bit} is outside a mask of width ${this.width}`, {
        bit,
        width: this.width
      });
    }
    this.words[bit >> 5] |= 1 << (bit & 31);
  }
  has(bit) {
    if (bit < 0 || bit >= this.width)
      return false;
    return (this.words[bit >> 5] & 1 << (bit & 31)) !== 0;
  }
  and(other) {
    const w = Math.max(this.width, other.width);
    const out = new _WideMask(w);
    const n = Math.min(this.words.length, other.words.length);
    for (let i = 0; i < n; i++)
      out.words[i] = this.words[i] & other.words[i];
    return out;
  }
  or(other) {
    const w = Math.max(this.width, other.width);
    const out = new _WideMask(w);
    for (let i = 0; i < out.words.length; i++) {
      out.words[i] = (this.words[i] ?? 0) | (other.words[i] ?? 0);
    }
    return out;
  }
  difference(other) {
    const w = Math.max(this.width, other.width);
    const out = new _WideMask(w);
    for (let i = 0; i < out.words.length; i++) {
      out.words[i] = (this.words[i] ?? 0) & ~(other.words[i] ?? 0);
    }
    const spare = w % 32;
    if (spare !== 0 && out.words.length > 0) {
      out.words[out.words.length - 1] &= (1 << spare) - 1;
    }
    return out;
  }
  subsetOf(other) {
    const n = Math.max(this.words.length, other.words.length);
    for (let i = 0; i < n; i++) {
      const a = this.words[i] ?? 0;
      const b = other.words[i] ?? 0;
      if ((a & ~b) !== 0)
        return false;
    }
    return true;
  }
  size() {
    let n = 0;
    for (let i = 0; i < this.width; i++)
      if (this.has(i))
        n++;
    return n;
  }
  members(tokens) {
    return tokens.filter((_, i) => this.has(i));
  }
  static filled(width) {
    const m = new _WideMask(width);
    if (width <= 0)
      return m;
    m.words.fill(4294967295);
    const spare = width % 32;
    if (spare !== 0)
      m.words[m.words.length - 1] = (1 << spare) - 1;
    return m;
  }
};

// work/bound-0.1.9/repository/node_modules/@lapxo/obligations/dist/lattice/scale-lattice.js
function fromScale(c) {
  const inhabited = (x) => state(c, x) !== "CONFLICT";
  return {
    top: permitAll(c, ""),
    bottom: { subject: "", floor: c.levels[c.topIx] ?? "", ceiling: c.levels[c.bottomIx] ?? "" },
    leq: (a, b) => entails(c, a, b),
    meet: (a, b) => fuse(c, [a, b]),
    join: (a, b) => {
      if (!inhabited(a))
        return b;
      if (!inhabited(b))
        return a;
      return {
        subject: a.subject || b.subject,
        floor: c.levels[c.lower(c.rank(a.floor), c.rank(b.floor))] ?? a.floor,
        ceiling: c.levels[c.higher(c.rank(a.ceiling), c.rank(b.ceiling))] ?? a.ceiling
      };
    },
    show: (x) => `[${x.floor}, ${x.ceiling}]`,
    inhabited
  };
}
function subsets(tokens) {
  return {
    bottom: new WideMask(tokens.length),
    top: WideMask.filled(tokens.length),
    leq: (a, b) => a.subsetOf(b),
    meet: (a, b) => a.and(b),
    join: (a, b) => a.or(b),
    show: (x) => x.members(tokens).join(","),
    inhabited: (x) => x.size() > 0
  };
}

// work/bound-0.1.9/repository/node_modules/@lapxo/obligations/dist/lattice/forms.js
function intervals(lo, hi) {
  const low = Math.min(lo, hi);
  const high = Math.max(lo, hi);
  return {
    bottom: { lo: high, hi: low },
    top: { lo: low, hi: high },
    leq(a, b) {
      if (a.lo > a.hi)
        return true;
      if (b.lo > b.hi)
        return false;
      return b.lo <= a.lo && a.hi <= b.hi;
    },
    meet(a, b) {
      return { lo: Math.max(a.lo, b.lo), hi: Math.min(a.hi, b.hi) };
    },
    join(a, b) {
      if (a.lo > a.hi)
        return b;
      if (b.lo > b.hi)
        return a;
      return { lo: Math.min(a.lo, b.lo), hi: Math.max(a.hi, b.hi) };
    },
    show(x) {
      return x.lo > x.hi ? "empty" : `${x.lo}..${x.hi}`;
    },
    inhabited(x) {
      return x.lo <= x.hi;
    }
  };
}
function form(f) {
  const held = { lattice: f.lattice, parse: f.parse, emit: f.emit, count: f.count, show: f.show, points: f.points };
  const lacking = Object.entries(held).find(([, fn]) => typeof fn !== "function");
  if (lacking)
    throw new Error(`form \`${f.id}\` declared no ${lacking[0]}`);
  return f;
}
var rec = (x) => x !== null && typeof x === "object" ? x : {};
function strings(x) {
  return Array.isArray(x) ? x.map(String) : [];
}
var drawn = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = s + 1831565813 >>> 0;
    let t = Math.imul(s ^ s >>> 15, s | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};
var picked = (draw, xs) => xs[Math.floor(draw() * xs.length)];
function bandCount(levels, folded) {
  if (levels.length === 0)
    return { kind: "refused", why: "a ladder with no levels cannot be counted" };
  const c = chain(levels);
  const f = c.rank(folded.floor);
  const cl = c.rank(folded.ceiling);
  if (!c.leq(f, cl))
    return { kind: "finite", n: 0 };
  const n = levels.filter((_, i) => c.leq(f, i) && c.leq(i, cl)).length;
  return { kind: "finite", n };
}
var BAND = {
  parse(params, demand) {
    const L = this.lattice(params);
    const d = rec(demand);
    return {
      subject: String(d.subject ?? ""),
      floor: String(d.floor ?? L.top.floor),
      ceiling: String(d.ceiling ?? L.top.ceiling)
    };
  },
  emit(_params, value) {
    return { subject: value.subject, floor: value.floor, ceiling: value.ceiling };
  },
  count(folded, params) {
    return bandCount(strings(rec(params).levels), folded);
  },
  points(params, seed, n) {
    const L = this.lattice(params);
    const levels = strings(rec(params).levels);
    const draw = drawn(seed);
    const band2 = (floor, ceiling) => ({ subject: "", floor, ceiling });
    return Array.from({ length: n }, () => {
      const [a, b] = [picked(draw, levels), picked(draw, levels)];
      return [band2(a, b), band2(b, a)].find((x) => L.inhabited(x)) ?? band2(a, a);
    });
  }
};
var ladderForm = form({
  id: "ladder",
  lattice(params) {
    const levels = strings(rec(params).levels);
    if (levels.length === 0)
      throw new Error("ladder needs levels");
    return fromScale(chain(levels));
  },
  ...BAND,
  show(value) {
    return value.floor === value.ceiling ? value.floor : `${value.floor}..${value.ceiling}`;
  }
});
var alphabetForm = form({
  id: "alphabet",
  lattice(params) {
    return subsets(strings(rec(params).tokens));
  },
  parse(params, demand) {
    const tokens = strings(rec(params).tokens);
    const d = rec(demand);
    const want = d.want !== void 0 ? strings(d.want) : tokens;
    return WideMask.fromTokens(tokens, new Set(want));
  },
  emit(params, value) {
    return { want: value.members(strings(rec(params).tokens)) };
  },
  count(folded) {
    return { kind: "finite", n: folded.size() };
  },
  show(value) {
    return `${value.size()}`;
  },
  points(params, seed, n) {
    const tokens = strings(rec(params).tokens);
    const draw = drawn(seed);
    return Array.from({ length: n }, () => WideMask.fromTokens(tokens, new Set(tokens.filter(() => draw() < 0.5))));
  }
});
var continuousForm = form({
  id: "continuous",
  lattice(params) {
    const p = rec(params);
    return intervals(Number(p.lo ?? 0), Number(p.hi ?? 1));
  },
  parse(params, demand) {
    const L = this.lattice(params);
    const d = rec(demand);
    return {
      lo: d.lo === void 0 ? L.top.lo : Number(d.lo),
      hi: d.hi === void 0 ? L.top.hi : Number(d.hi)
    };
  },
  emit(_params, value) {
    return { lo: value.lo, hi: value.hi };
  },
  count() {
    return { kind: "refused", why: "a continuous band has no count; prefer not to exist over inventing one" };
  },
  show(value) {
    return value.lo > value.hi ? "empty" : `${value.lo}..${value.hi}`;
  },
  points(params, seed, n) {
    const p = rec(params);
    const lo = Number(p.lo ?? 0);
    const hi = Number(p.hi ?? 1);
    const draw = drawn(seed);
    const at = () => lo + Math.round(draw() * (hi - lo));
    return Array.from({ length: n }, () => ({ lo: at(), hi: at() }));
  }
});
var latticeForm = form({
  id: "lattice",
  lattice(params) {
    const p = rec(params);
    const levels = strings(p.levels);
    const leq = p.leq;
    if (levels.length && leq)
      return fromScale(order(levels, leq));
    throw new Error("lattice needs levels+leq");
  },
  ...BAND,
  show(value) {
    return `${value.floor}..${value.ceiling}`;
  }
});
var FORM_IMPLEMENTATIONS = [ladderForm, alphabetForm, continuousForm, latticeForm];
var FORMS = [...FORM_IMPLEMENTATIONS];

// work/bound-0.1.9/repository/node_modules/@lapxo/obligations/dist/field/field.js
function coordinate(name, steps = "/") {
  const at = name.split(new RegExp(`[${steps.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}]`)).filter((s) => s !== "");
  while (at[at.length - 1] === "*" || at[at.length - 1] === "**")
    at.pop();
  return at;
}

// work/bound-0.1.9/repository/node_modules/@lapxo/obligations/dist/lattice/obligatory.js
function cell(at, epoch = 0, seen = [], restsOn = []) {
  return { at: coordinate(at), epoch, seen, restsOn };
}
function mark(one) {
  if (one.widens !== void 0 && one.reach === "travels") {
    throw new UnitError("widening-travels", "obligations: REFUSE\xB7widening-travels a widening stands where it was witnessed and never travels to what rests there", { pole: one.pole });
  }
  return one.takes === void 0 ? one : { ...one, sign: -1 };
}
function live(lines) {
  const taken = new Set(lines.flatMap((line) => line.takes === void 0 ? [] : [line.takes]));
  return lines.filter((line) => line.takes === void 0 && (line.id === void 0 || !taken.has(line.id)));
}
function restOf(c, world = /* @__PURE__ */ new Map()) {
  const own = c.at.join("/");
  const out = [];
  const held = /* @__PURE__ */ new Set();
  const edge = [...c.restsOn];
  for (let i = 0; i < edge.length; i += 1) {
    const name = edge[i];
    if (name === own)
      throw new UnitError("rest-cycle", `obligations: REFUSE\xB7rest ${own} rests on itself: an order of rest with a cycle has no fold to reach`, { at: own });
    if (held.has(name))
      continue;
    held.add(name);
    out.push(name);
    edge.push(...world.get(name)?.restsOn ?? []);
  }
  return out;
}
function parts(L, c, world = /* @__PURE__ */ new Map()) {
  const rest = restOf(c, world);
  const above = rest.flatMap((name) => live(world.get(name)?.marks ?? []).filter((one) => one.reach === "travels" && one.widens === void 0));
  const marks = [...live(c.marks ?? []), ...above].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  let required = L.top;
  let signed = L.top;
  for (const one of marks) {
    if (one.pole === "floor")
      required = L.meet(required, one.span);
    else
      signed = one.widens === void 0 ? L.meet(signed, one.span) : L.join(signed, one.span);
  }
  const origins = live(c.seen);
  const held = origins.reduce((acc, claim) => L.meet(acc, claim.span), L.top);
  return { floor: L.meet(required, held), ceiling: L.meet(signed, held), origins, rest, required, signed };
}
function state2(L, c, world = /* @__PURE__ */ new Map()) {
  const { floor, ceiling, origins, required, signed } = parts(L, c, world);
  if (!L.inhabited(L.meet(required, signed)))
    return "CONFLICT";
  if (new Set(origins.map((claim) => claim.origin)).size < 2)
    return "REQUIRED";
  if (!L.inhabited(origins.reduce((acc, claim) => L.meet(acc, claim.span), L.top)))
    return "CONFLICT";
  return L.inhabited(L.meet(floor, ceiling)) ? "FREE" : "FORBIDDEN";
}

// work/bound-0.1.9/repository/node_modules/@lapxo/topos/dist/wire/object-record.js
function coordinateText(value) {
  return value !== "" && !/[\s\\|]/.test(value) && value.split("/").every((s) => s !== "" && s !== "." && s !== ".." && s !== "*" && s !== "**");
}
function restCoordinates(text) {
  try {
    const read = alphabet(text);
    if (read.polarity !== "permit" || read.members.some((one) => !coordinateText(one)))
      return void 0;
    const sorted = [...new Set(read.members)].sort(byBytes);
    if (alphabet({ polarity: "permit", members: sorted }) !== text)
      return void 0;
    return sorted;
  } catch {
    return void 0;
  }
}
var COMMON = ["type", "scope", "id", "epoch", "by", "sig"];
function objectFromFields(fields, keys, schema, globalFields, forms) {
  const bad = (why, key) => refuse(why, key);
  if (keys.includes("at"))
    return bad("object records carry no at: order is epoch and a local join witness is widens", "at");
  const type = fields.type;
  if (!schema.types.has(type ?? "") || !["cell", "claim", "mark"].includes(type ?? ""))
    return bad("an object record names a declared type: cell, claim or mark", "type");
  if (!/^(0|[1-9][0-9]*)$/.test(fields.epoch ?? "") || !Number.isSafeInteger(Number(fields.epoch)))
    return bad("an object record carries an exactly supported logical epoch", "epoch");
  if (Number(fields.epoch) < schema.activation)
    return bad(`an object epoch precedes typed-wire activation ${schema.activation}`, "epoch");
  let row;
  if (type === "cell")
    row = "cell";
  else if (fields.sign === "-1")
    row = `${type}/negative`;
  else if (fields.sign !== "+1")
    return bad("a claim or mark names sign=+1 or sign=-1", "sign");
  else if (type === "claim")
    row = "claim/positive";
  else if (fields.pole === "floor" && fields.reach === "travels" && fields.widens === void 0)
    row = "mark/floor-travelling";
  else if (fields.pole === "ceiling" && fields.reach === "travels" && fields.widens === void 0)
    row = "mark/travelling";
  else if (fields.pole === "ceiling" && fields.reach === "local")
    row = "mark/local";
  else
    return bad("a positive mark is ceiling/travels, ceiling/local with widens, or floor/travels without widens", "pole");
  const required = schema.required.get(row);
  const allowed = schema.allowed.get(row);
  if (!required || !allowed || schema.common.size === 0 || schema.configuration.size === 0 || [...schema.common].some((k) => !required.has(k) || !allowed.has(k)) || [...required].some((k) => !allowed.has(k)))
    return bad(`typed wire has no complete required/allowed contract for ${row}`, "type");
  for (const key of COMMON)
    if (fields[key] === void 0 || fields[key] === "")
      return bad(`an object record has no ${key}`, key);
  for (const key of keys)
    if (!globalFields.has(key) || !allowed.has(key))
      return bad(`\`${key}=\` is not allowed on ${row}`, key);
  for (const key of required)
    if (!allowed.has(key) || fields[key] === void 0 || fields[key] === "")
      return bad(`a ${row} record has no declared required \`${key}\``, key);
  if (!coordinateText(fields.scope))
    return bad("scope is a canonical cell coordinate", "scope");
  if (type === "cell") {
    if (!forms.has(fields.form))
      return bad("the cell names no admitted form", "form");
    if (restCoordinates(fields.restsOn) === void 0)
      return bad("cell restsOn is none or a canonical alphabet of coordinates", "restsOn");
  }
  return fact({ record: type, fields: { ...fields } });
}

// work/bound-0.1.9/repository/node_modules/@lapxo/topos/dist/wire/sig.js
function parseSignature(value) {
  const colon = value.lastIndexOf(":");
  if (colon <= 0 || colon === value.length - 1)
    return null;
  return { algorithm: value.slice(0, colon), raw: value.slice(colon + 1) };
}

// work/bound-0.1.9/repository/node_modules/@lapxo/topos/dist/wire/claimline.js
var ENVELOPE = /* @__PURE__ */ new Set(["sig", "expires", "repo", "by", "epoch"]);
var WITHDRAW = "withdraw";
var WIRE = "wire/";
var WAS = "audit/wire/";
function listOf(scope) {
  if (scope.startsWith(WAS))
    return scope.slice(WAS.length);
  if (scope.startsWith(WIRE))
    return scope.slice(WIRE.length);
  return void 0;
}
function epochOf(fields) {
  const value = fields["epoch"] ?? "";
  return /^\d+$/.test(value) ? Number(value) : 0;
}
function names(withdraw, line) {
  return Object.keys(withdraw).filter((k) => k !== "value" && !ENVELOPE.has(k)).every((k) => line[k] === withdraw[k]);
}
function wireAt(lines, epoch) {
  const mine = lines.filter((f) => listOf(f["scope"] ?? "") !== void 0 && epochOf(f) <= epoch);
  const withdrawals = mine.filter((f) => f["value"] === WITHDRAW);
  const candidates = /* @__PURE__ */ new Map();
  for (const f of mine) {
    if (f["value"] === WITHDRAW || withdrawals.some((w) => names(w, f)))
      continue;
    const key = (listOf(f["scope"] ?? "") ?? "") + "\0" + (f["by"] ?? "");
    const held = candidates.get(key) ?? [];
    const newest = held.length ? epochOf(held[0]) : -1;
    if (epochOf(f) > newest)
      candidates.set(key, [f]);
    else if (epochOf(f) === newest)
      candidates.set(key, [...held, f]);
  }
  const live2 = [...candidates.values()].flatMap((rows) => rows.some((f) => (f["scope"] ?? "").startsWith(WIRE)) ? rows.filter((f) => (f["scope"] ?? "").startsWith(WIRE)) : rows);
  const values = /* @__PURE__ */ new Map();
  for (const f of live2) {
    const key = listOf(f["scope"] ?? "") ?? "", prior = values.get(key);
    if (prior !== void 0 && prior !== f["value"])
      throw Error(`REFUSE\xB7wire wire/${key} has conflicting live declarations`);
    values.set(key, f["value"] ?? "");
  }
  const standing = /* @__PURE__ */ new Map();
  for (const f of mine) {
    const key = listOf(f["scope"] ?? "") ?? "";
    if (f["value"] === WITHDRAW || withdrawals.some((w) => names(w, f)))
      continue;
    const held = standing.get(key);
    const newer = held === void 0 || epochOf(f) > epochOf(held) || epochOf(f) === epochOf(held) && (f["scope"] ?? "").startsWith(WIRE) && (held["scope"] ?? "").startsWith(WAS);
    if (newer)
      standing.set(key, f);
  }
  if (!standing.size)
    return null;
  const ids = (name) => new Set((standing.get(name)?.["value"] ?? "").split("|").filter(Boolean));
  const formOf = new Map([...standing].filter(([name]) => name.startsWith("form/")).map(([name, f]) => [name.slice("form/".length), f["value"] ?? ""]));
  const lists = new Map([...standing.keys()].filter((name) => !name.includes("/")).map((name) => [name, ids(name)]));
  return {
    epoch,
    ...standing.has("object/types") ? { object: {
      activation: epochOf(standing.get("object/types")),
      types: ids("object/types"),
      common: ids("object/common"),
      reserved: ids("object/reserved"),
      configuration: ids("object/allowed/config"),
      required: new Map([...standing.keys()].filter((k) => k.startsWith("object/required/")).map((k) => [k.slice("object/required/".length), ids(k)])),
      allowed: new Map([...standing.keys()].filter((k) => k.startsWith("object/allowed/")).map((k) => [k.slice("object/allowed/".length), ids(k)]))
    } } : {},
    fields: ids("fields"),
    required: ids("required"),
    roles: ids("roles"),
    forms: ids("forms"),
    classes: ids("at-classes"),
    digests: new Set([...ids("digest-algorithms")].map((one) => one.split(":")[0])),
    signatures: ids("signature-algorithms"),
    formOf,
    lists
  };
}
function admittedDigest(value, wire) {
  const colon = value.indexOf(":");
  return colon > 0 && wire.digests.has(value.slice(0, colon)) && /^[0-9a-f]+$/i.test(value.slice(colon + 1));
}
function isRegion(need) {
  if (need.startsWith("/") || /[\s\\]/.test(need))
    return false;
  const steps = need.split("/").filter((step) => step !== "");
  return steps.length > 0 && steps.every((step, i) => step !== "." && step !== ".." && (!step.includes("*") || i === steps.length - 1));
}
var FIELD_FORMS = {
  region: (value) => value.split("|").filter(Boolean).every(isRegion),
  class: (value, wire) => {
    const colon = value.indexOf(":");
    if (colon <= 0 || !wire.classes.has(value.slice(0, colon)))
      return false;
    const rest = value.slice(colon + 1);
    return !/^[a-z0-9-]+:[0-9a-f]{16,}$/i.test(rest) || admittedDigest(rest, wire);
  },
  signature: (value, wire) => {
    const got = parseSignature(value);
    if (got === null || !wire.signatures.has(got.algorithm))
      return false;
    const era = got.algorithm.slice(got.algorithm.lastIndexOf(":") + 1);
    return admittedDigest(got.algorithm, wire) || got.algorithm.includes(":") && (wire.lists.get("era")?.has(era) ?? false);
  },
  count: (value) => /^\d+$/.test(value)
};
function debit(field, why) {
  return refuse(why, field);
}
function fromLine(text, wire, grammars) {
  const line = parse(text, { preserveKeys: true });
  if (line.kind !== "fact") {
    return line.kind === "abstain" ? abstain(line.why) : refuse(line.why, line.named);
  }
  const f = line.value.fields;
  const keys = line.value.keys;
  if (keys.includes("type")) {
    if (!wire?.object)
      return refuse("typed object grammar is not admitted at this epoch", "type");
    if (!wire.object.configuration.size || !wire.object.reserved.size || [...wire.object.reserved].some((k) => wire.object.configuration.has(k)))
      return refuse("typed wire has no closed configuration/object field contract", "type");
    const got = objectFromFields(f, keys, wire.object, wire.fields, wire.forms);
    if (got.kind !== "fact")
      return got;
    if (!FIELD_FORMS.signature(f.sig, wire))
      return refuse("object signature grammar is not admitted", "sig");
    if (got.value.record === "cell" && !admittedDigest(f.topos, wire))
      return refuse("cell topos is not an admitted digest", "topos");
    if (got.value.record === "cell" && (f.restsOn ?? "").split("|").some((name) => admittedDigest(name, wire)))
      return refuse("cell restsOn names coordinates, not byte digests", "restsOn");
    return got;
  }
  if (wire) {
    if (wire.object) {
      if (!wire.object.configuration.size || !wire.object.reserved.size || [...wire.object.reserved].some((k) => wire.object.configuration.has(k)))
        return refuse("typed wire has no closed configuration/object field contract", "type");
      const reserved = keys.find((k) => wire.object.reserved.has(k) || !wire.object.configuration.has(k));
      if (reserved)
        return refuse(`\`${reserved}=\` is an object-only field: untyped configuration cannot carry it`, reserved);
    }
    for (const k of Object.keys(f))
      if (!wire.fields.has(k))
        return debit(k, `\`${k}=\` is not a field of the wire at epoch ${wire.epoch}`);
    for (const k of wire.required)
      if (f[k] === void 0)
        return debit(k, `a claim with no \`${k}\``);
    for (const [k, form2] of wire.formOf) {
      const v = f[k];
      if (v === void 0)
        continue;
      const ids = wire.lists.get(form2);
      const reads = FIELD_FORMS[form2] ?? (ids ? (value) => ids.has(value) : void 0);
      if (!reads)
        return abstain(`\`${k}\` takes the form ${form2}, which this reader does not know`);
      if (!reads(v, wire))
        return debit(k, `\`${k}=${v}\` is not a ${form2} of the wire at epoch ${wire.epoch}`);
    }
    if (f.role !== void 0 && !wire.roles.has(f.role))
      return abstain(`\`role=${f.role}\` is a role this wire does not name`);
    if (!wire.forms.has(f.form ?? ""))
      return abstain(`\`form=${f.form}\` is a form this wire does not name`);
  }
  const listed = Array.isArray(grammars) ? grammars : void 0;
  const bound = f.value === WITHDRAW ? { kind: "enumerated", values: [WITHDRAW] } : boundOf(f.form ?? "", f.value ?? "", listed);
  if (bound === null) {
    const mine = BOUND_FORMS.includes(f.form ?? "") || (listed?.some((g) => g.form === f.form) ?? false);
    return mine ? debit("value", `\`${f.value}\` is not a ${f.form}`) : abstain(`\`form=${f.form}\` is a form this reader does not know`);
  }
  const role = f.role === "writes" ? "writes" : f.role === "demands" ? "demands" : "reads";
  const extra = {};
  for (const [k, v] of Object.entries(f)) {
    if (["scope", "measure", "form", "value", "by", "at", "role", "unit", "multiplicity", "epoch", "ref", "to", "ref_by"].includes(k))
      continue;
    extra[k] = v;
  }
  const rel = f.ref;
  const to = f.to === void 0 ? null : unpipe(f.to);
  const reference = rel && to && REF_RELATIONS.includes(rel) ? { rel, to, by: f.ref_by === "declared" ? "declared" : "inferred" } : null;
  return fact({
    scope: f.scope ?? "",
    measure: f.measure ?? "",
    bound,
    role,
    by: f.by ?? "",
    at: f.at ?? "",
    ...f.unit !== void 0 ? { unit: f.unit } : {},
    ...f.multiplicity === "one" || f.multiplicity === "many" || f.multiplicity === "unknown" ? { multiplicity: f.multiplicity } : {},
    ...f.epoch !== void 0 ? { epoch: f.epoch } : {},
    ...reference ? { reference } : {},
    extra
  });
}
var EPOCHS = intervals(-Infinity, Infinity);
var QUORUMS = intervals(1, Infinity);

// work/bound-0.1.9/repository/node_modules/@lapxo/topos/dist/wire/record-kind.js
function recordKind(text) {
  const got = parse(text, { preserveKeys: true });
  if (got.kind !== "fact")
    return got;
  if (!got.value.keys.includes("type"))
    return fact("config");
  const type = got.value.fields.type;
  return type === "cell" || type === "claim" || type === "mark" ? fact(type) : refuse("an explicit type names cell, claim or mark", "type");
}

// work/bound-0.1.9/repository/node_modules/@lapxo/topos/dist/wire/object-history.js
function objectHistory(lines) {
  const parsed = [];
  for (const text of lines) {
    const p = parse(text);
    if (p.kind !== "fact")
      return p;
    parsed.push(p.value.fields);
  }
  const objects = [], configuration = [];
  for (let i = 0; i < lines.length; i++) {
    const k = recordKind(lines[i]);
    if (k.kind !== "fact")
      return k;
    if (k.value === "config") {
      configuration.push(parsed[i]);
      continue;
    }
    const got = fromLine(lines[i], wireAt(parsed, Number(parsed[i].epoch)));
    if (got.kind !== "fact")
      return got;
    if (!("record" in got.value))
      throw Error("typed history returned configuration");
    objects.push(got.value);
  }
  return fact({ objects, configuration });
}

// work/topos-0.1.17/repository/dist/wire/outcome.js
var fact2 = (value) => ({ kind: "fact", value });
var refuse3 = (why, named) => ({ kind: "refuse", why, ...named === void 0 ? {} : { named } });

// work/topos-0.1.17/repository/dist/wire/values.js
function unpipe2(value) {
  const out = [];
  let at = "";
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\") {
      const next = value[i + 1];
      if (next !== "|" && next !== "\\")
        return null;
      at += next;
      i += 1;
    } else if (c === "|") {
      out.push(at);
      at = "";
    } else {
      at += c;
    }
  }
  out.push(at);
  return out;
}
var OPEN2 = "*";
var num2 = (s) => {
  if (!/^-?\d+(\.\d+)?$/.test(s))
    return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
};
var GRAMMARS2 = {
  interval: (value) => {
    const at = value.indexOf("..");
    if (at < 0)
      return null;
    const lo = value.slice(0, at);
    const hi = value.slice(at + 2);
    const l = lo === OPEN2 ? null : num2(lo);
    const h = hi === OPEN2 ? null : num2(hi);
    if (lo !== OPEN2 && l === null || hi !== OPEN2 && h === null)
      return null;
    return { kind: "interval", lo: l, hi: h };
  },
  alphabet: (value) => {
    const values = unpipe2(value);
    return values === null ? null : { kind: "enumerated", values };
  },
  ladder: (value) => {
    const parts2 = unpipe2(value);
    if (parts2 === null || parts2.length !== 2)
      return null;
    return { kind: "band", floor: parts2[0] ?? "", ceiling: parts2[1] ?? "" };
  }
};
function boundOf2(form2, value, grammars) {
  const extra = Array.isArray(grammars) ? grammars.find((g) => g.form === form2) : void 0;
  if (extra)
    return extra.parse(value);
  return GRAMMARS2[form2]?.(value) ?? null;
}
var BOUND_FORMS2 = Object.keys(GRAMMARS2);

// work/topos-0.1.17/repository/dist/wire/line.js
var PROTOCOL2 = "bound-lock/1";
var NEEDS_QUOTE2 = /[ ="\n\\]/;
function escape2(value) {
  if (!NEEDS_QUOTE2.test(value))
    return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}
var UTF82 = new TextEncoder();
function byBytes2(a, b) {
  const x = UTF82.encode(a);
  const y = UTF82.encode(b);
  for (let i = 0; i < x.length && i < y.length; i++) {
    if (x[i] !== y[i])
      return x[i] - y[i];
  }
  return x.length - y.length;
}
var unwritten2 = (fields) => fields["form"] === "interval" && fields["value"] !== void 0 && fields["value"] !== "withdraw" && boundOf2("interval", fields["value"]) === null;
function canonical2(fields, version = "1") {
  if (unwritten2(fields))
    throw new Error(`REFUSE\xB7wire canonical: \`${fields["value"]}\` is no interval the wire writes: two ends, each decimal or *`);
  const keys = Object.keys(fields).sort(byBytes2);
  const tokens = keys.map((k) => `${k}=${escape2(fields[k])}`);
  return [`${PROTOCOL2.split("/")[0]}/${version}`, ...tokens].join(" ");
}
function signedBytes(fields, version = "1") {
  const { sig: _sig, ...rest } = fields;
  return canonical2(rest, version);
}

// work/topos-0.1.17/repository/dist/wire/grammar.js
var [FORBID2, EMPTY2, MEMBER2, PAIR2, STEP2, AT2, EVERY2, ESCAPE2] = ["not:", "none", "|", "=", "/", "@", "*", "\\"];
var refuse4 = (grammar, why) => {
  throw new Error(`REFUSE\xB7wire ${grammar}: ${why}`);
};
function alphabet2(given) {
  if (typeof given !== "string") {
    const written2 = given.members.map((one) => one.split(ESCAPE2).join(ESCAPE2 + ESCAPE2).split(MEMBER2).join(ESCAPE2 + MEMBER2)).join(MEMBER2);
    if (given.polarity === "forbid")
      return FORBID2 + written2;
    return written2.startsWith(FORBID2) || written2 === EMPTY2 ? refuse4("alphabet", "a permitted alphabet neither begins with not: nor is the one word none") : written2 || EMPTY2;
  }
  const forbid = given.startsWith(FORBID2);
  const body = forbid ? given.slice(FORBID2.length) : given;
  const members = !forbid && body === EMPTY2 ? [] : unpipe2(body) ?? refuse4("alphabet", "a backslash escapes only a pipe or itself");
  return { polarity: forbid ? "forbid" : "permit", members: members.filter((one) => one !== "") };
}

// work/topos-0.1.17/repository/dist/wire/object-record.js
function coordinateText2(value) {
  return value !== "" && !/[\s\\|]/.test(value) && value.split("/").every((s) => s !== "" && s !== "." && s !== ".." && s !== "*" && s !== "**");
}
function restCoordinates2(text) {
  try {
    const read = alphabet2(text);
    if (read.polarity !== "permit" || read.members.some((one) => !coordinateText2(one)))
      return void 0;
    const sorted = [...new Set(read.members)].sort(byBytes2);
    if (alphabet2({ polarity: "permit", members: sorted }) !== text)
      return void 0;
    return sorted;
  } catch {
    return void 0;
  }
}

// work/bound-0.2.0/order-candidate/dist/wire/object-context.js
function validateObjectContext(records, context2) {
  const fail = (why) => refuse3(`object context: ${why}`);
  const ids = /* @__PURE__ */ new Map();
  for (const record of records) {
    if (!context2.admit(record))
      return fail(`signature or authority does not admit ${record.fields.id}`);
    const prior = ids.get(record.fields.id);
    if (prior && signedBytes(prior.fields) !== signedBytes(record.fields))
      return fail(`record ID collision ${record.fields.id}`);
    if (!prior)
      ids.set(record.fields.id, record);
  }
  const unique = [...ids.values()];
  const position = new Map(unique.map((record, index) => [record.fields.id, index]));
  const cells = /* @__PURE__ */ new Map();
  for (const record of unique.filter((r) => r.record === "cell")) {
    if (cells.has(record.fields.scope))
      return fail(`cell definition is not unique at ${record.fields.scope}`);
    cells.set(record.fields.scope, record);
  }
  const selected = /* @__PURE__ */ new Map();
  for (const [scope, record] of cells) {
    try {
      const got = context2.resolve(record);
      if (got.digest !== record.fields.topos || got.form.id !== record.fields.form)
        return fail(`selected digest/form does not match ${scope}`);
      got.form.lattice(got.params);
      selected.set(scope, got);
    } catch (error) {
      return fail(`codec/pin/decoder stop at ${scope}: ${String(error)}`);
    }
  }
  const edges = /* @__PURE__ */ new Map();
  for (const [scope, record] of cells) {
    const rest = restCoordinates2(record.fields.restsOn);
    if (rest === void 0)
      return fail(`invalid declared rest at ${scope}`);
    for (const parent of rest) {
      const ancestor = cells.get(parent);
      if (!ancestor)
        return fail(`missing rest target ${parent}`);
      if (Number(ancestor.fields.epoch) > Number(record.fields.epoch))
        return fail(`rest target ${parent} did not exist at cell declaration`);
      if (["topos", "form", "params", "measure"].some((k) => ancestor.fields[k] !== record.fields[k]))
        return fail(`incompatible rest component ${scope}/${parent}`);
    }
    edges.set(scope, rest);
  }
  const colour = /* @__PURE__ */ new Map();
  for (const scope of cells.keys()) {
    if (colour.get(scope) === 2)
      continue;
    const stack = [{ name: scope, exit: false }];
    while (stack.length) {
      const next = stack.pop();
      if (next.exit) {
        colour.set(next.name, 2);
        continue;
      }
      if (colour.get(next.name) === 1)
        return fail(`declared rest cycle reachable from ${scope}`);
      if (colour.get(next.name) === 2)
        continue;
      colour.set(next.name, 1);
      stack.push({ name: next.name, exit: true });
      for (const parent of [...edges.get(next.name)].reverse())
        stack.push({ name: parent, exit: false });
    }
  }
  for (const record of unique.filter((r) => r.record !== "cell")) {
    const f = record.fields;
    const own = cells.get(f.scope);
    if (!own || Number(own.fields.epoch) > Number(f.epoch) || Number(own.fields.epoch) === Number(f.epoch) && position.get(own.fields.id) > position.get(f.id))
      return fail(`cell not declared before ${f.id}`);
    if (f.sign === "-1") {
      const target = ids.get(f.takes);
      if (!target || target.record !== record.record || target.fields.scope !== f.scope || target.fields.sign !== "+1" || target.fields.by !== f.by || Number(target.fields.epoch) >= Number(f.epoch))
        return fail(`unauthorized or incompatible withdrawal target ${f.takes}`);
    } else {
      const codec = selected.get(f.scope);
      try {
        codec.form.parse(codec.params, f.value);
      } catch (error) {
        return fail(`span codec stop at ${f.id}: ${String(error)}`);
      }
      if (record.record === "claim" && !context2.origin(f.origin, f.by, f.scope))
        return fail(`origin is not attested for ${f.id}`);
      if (f.widens !== void 0 && !context2.witness(f.widens, f.by, f.scope))
        return fail(`join witness is not admitted for ${f.id}`);
    }
  }
  for (const scope of cells.keys()) {
    const rest = /* @__PURE__ */ new Set();
    const pending = [...edges.get(scope)];
    while (pending.length) {
      const name = pending.pop();
      if (rest.has(name))
        continue;
      rest.add(name);
      pending.push(...edges.get(name));
    }
    const marks = unique.filter((r) => r.record === "mark" && r.fields.sign === "+1" && r.fields.pole === "ceiling" && (r.fields.scope === scope || rest.has(r.fields.scope) && r.fields.reach === "travels"));
    const epochs = /* @__PURE__ */ new Map();
    for (const m of marks)
      epochs.set(m.fields.epoch, [...epochs.get(m.fields.epoch) ?? [], m]);
    for (const same of epochs.values())
      if (same.length > 1 && same.some((m) => m.fields.widens !== void 0))
        return fail(`ambiguous same-epoch ceiling acts at ${scope}`);
  }
  return fact2(unique);
}

// work/bound-0.1.9/repository/node_modules/@lapxo/obligations/dist/field/join.js
function join(L, c, span2, witness, at) {
  if (witness === "")
    throw new UnitError("join-unwitnessed", "obligations: REFUSE\xB7join a widening lands only with a witness or the signatures of whoever rests on the old bound");
  return { ...c, marks: [...c.marks ?? [], mark({ pole: "ceiling", reach: "local", span: L.meet(L.top, span2), widens: witness, ...at === void 0 ? {} : { at } })] };
}

// work/bound-0.1.9/repository/node_modules/@lapxo/obligations/dist/field/observe.js
function observe(c, claim, s = claim.takes === void 0 ? 1 : -1) {
  const takes = s === 1 ? void 0 : claim.takes ?? claim.id;
  if (s === 1 && claim.takes !== void 0)
    throw new UnitError("sign-mismatch", "obligations: REFUSE\xB7observe a claim that takes another back is observed at \u22121, never at +1");
  if (s === -1 && takes === void 0)
    throw new UnitError("withdrawal-unnamed", "obligations: REFUSE\xB7observe a withdrawal names the claim it takes back, never a value that looks like it");
  const line = takes === void 0 ? claim : { origin: claim.origin, span: claim.span, sign: -1, takes, ...claim.at === void 0 ? {} : { at: claim.at } };
  return { ...c, epoch: Math.max(c.epoch, claim.at ?? c.epoch), seen: [...c.seen, line] };
}

// work/bound-0.1.9/repository/node_modules/@lapxo/obligations/dist/field/require.js
function require2(L, world, name, span2, line = {}) {
  const held = world.get(name) ?? cell(name);
  return new Map([...world, [name, { ...held, marks: [...held.marks ?? [], mark({ pole: "floor", reach: "travels", span: L.meet(L.top, span2), ...line })] }]]);
}

// work/bound-0.1.9/repository/node_modules/@lapxo/obligations/dist/field/sign.js
function sign(L, world, name, span2, line = {}) {
  const held = world.get(name) ?? cell(name);
  return new Map([...world, [name, { ...held, marks: [...held.marks ?? [], mark({ pole: "ceiling", reach: "travels", span: L.meet(L.top, span2), ...line })] }]]);
}

// work/bound-0.2.0/engine-candidate/src/engine/object.ts
function objectFold(records, context2) {
  let world = /* @__PURE__ */ new Map();
  const definitions = new Map(records.filter((r) => r.record === "cell").map((r) => [r.fields.scope, r]));
  const codecs = new Map([...definitions].map(([name, c]) => [name, context2.resolve(c)]));
  const ids = new Map(records.map((r) => [r.fields.id, r]));
  for (const record of [...records].sort((a, b) => Number(a.fields.epoch) - Number(b.fields.epoch))) {
    const f = record.fields, name = f.scope, at = Number(f.epoch);
    if (record.record === "cell") {
      world = new Map([...world, [name, cell(name, at, [], restCoordinates(f.restsOn))]]);
      continue;
    }
    const codec = codecs.get(name), L = codec.form.lattice(codec.params), held = world.get(name);
    if (record.record === "claim") {
      const target = f.sign === "-1" ? ids.get(f.takes).fields : f;
      const changed = observe(held, { id: f.id, at, origin: target.origin, span: codec.form.parse(codec.params, target.value), ...f.takes ? { takes: f.takes } : {} }, f.sign === "-1" ? -1 : 1);
      const seen = [...changed.seen];
      seen[seen.length - 1] = { ...seen.at(-1), id: f.id };
      world = new Map([...world, [name, { ...changed, seen }]]);
    } else if (f.sign === "-1") {
      const target = ids.get(f.takes).fields;
      world = new Map([...world, [name, { ...held, marks: [...held.marks ?? [], mark({ id: f.id, at, takes: f.takes, pole: target.pole, reach: "local", span: codec.form.parse(codec.params, target.value) })] }]]);
    } else if (f.widens !== void 0) {
      const changed = join(L, held, codec.form.parse(codec.params, f.value), f.widens, at);
      const marks = [...changed.marks ?? []];
      marks[marks.length - 1] = { ...marks.at(-1), id: f.id };
      world = new Map([...world, [name, { ...changed, marks }]]);
    } else {
      const span2 = codec.form.parse(codec.params, f.value);
      world = f.pole === "floor" ? require2(L, world, name, span2, { id: f.id, at }) : sign(L, world, name, span2, { id: f.id, at });
    }
  }
  return [...world].map(([name, c]) => {
    const codec = codecs.get(name), L = codec.form.lattice(codec.params);
    return { cell: name, state: state2(L, c, world), parts: parts(L, c, world), rest: restOf(c, world), ownMarks: live(c.marks ?? []).map((m) => m.id), ownClaims: live(c.seen).map((s) => ({ id: s.id, origin: s.origin })), marks: live(c.marks ?? []), claims: live(c.seen) };
  });
}

// work/bound-0.1.9/repository/node_modules/@lapxo/topos/dist/forms/form.js
var paramsOf = (params) => params !== null && typeof params === "object" ? params : {};
function refuseForm(id, why) {
  throw new Error(`REFUSE\xB7form ${id}: ${why}`);
}
function numberAt(id, params, name) {
  const held = paramsOf(params)[name];
  if (typeof held !== "number" || !isFinite(held))
    refuseForm(id, `takes ${name} as a number, and a value it is not given is not invented`);
  return held;
}
function wordsAt(id, params, name) {
  const held = paramsOf(params)[name];
  if (!Array.isArray(held) || !held.length || held.some((one) => typeof one !== "string"))
    refuseForm(id, `takes ${name} as a list of words`);
  return held;
}
var written = (words) => alphabet({ polarity: "permit", members: [...new Set(words)].sort(byBytes) });
function bandOf(id, whole, text) {
  if (text === "empty")
    return { lo: whole.hi, hi: whole.lo };
  const read = (value) => ((got) => got.kind === "fact" && got.value.bound.kind === "interval" ? { lo: got.value.bound.lo ?? whole.lo, hi: got.value.bound.hi ?? whole.hi } : void 0)(fromLine(canonical({ form: "interval", value }), null));
  return read(text) ?? read(`${text}..${text}`) ?? refuseForm(id, `\`${text}\` is not a band: lo..hi or one end, each a number or *`);
}
var bandText = (value) => ((end) => value.lo > value.hi ? "empty" : `${end(value.lo)}..${end(value.hi)}`)((n) => isFinite(n) ? decimal(n) : "*");

// work/bound-0.1.9/repository/node_modules/@lapxo/topos/dist/forms/alphabet.js
var tokensOf2 = (params) => ({ tokens: wordsAt("alphabet", params, "tokens") });
var alphabetOfForm = {
  id: "alphabet",
  lattice: (params) => alphabetForm.lattice(tokensOf2(params)),
  parse(params, text) {
    const { tokens } = tokensOf2(params);
    const read = alphabet(text);
    const stray = read.members.find((one) => !tokens.includes(one));
    if (stray !== void 0)
      refuseForm("alphabet", `\`${stray}\` is not one of its tokens`);
    return WideMask.fromTokens(tokens, new Set(read.polarity === "forbid" ? tokens.filter((one) => !read.members.includes(one)) : read.members));
  },
  emit: (params, value) => written(value.members(tokensOf2(params).tokens)),
  show: (params, value) => alphabetForm.lattice(tokensOf2(params)).show(value),
  points: (params, seed, n) => alphabetForm.points(tokensOf2(params), seed, n)
};

// work/bound-0.1.9/repository/node_modules/@lapxo/topos/dist/forms/interval.js
var span = (params) => ({ lo: numberAt("interval", params, "lo"), hi: numberAt("interval", params, "hi") });
var intervalForm = {
  id: "interval",
  lattice: (params) => continuousForm.lattice(span(params)),
  parse: (params, text) => bandOf("interval", span(params), text),
  emit: (_params, value) => bandText(value),
  show: (params, value) => continuousForm.lattice(span(params)).show(value),
  points: (params, seed, n) => continuousForm.points(span(params), seed, n)
};

// work/bound-0.2.0/engine-candidate/tools/samples/typed-provider.mjs
function context({ digest, records, admit }) {
  const granted = (family, id, by, scope) => records.filter((row) => row.scope === `${family}/${id}` && row.value === id && row.by === by && admit(row) && (row.condition ?? "").split("|").includes(scope)).length === 1;
  return {
    resolve(cell2) {
      const form2 = [intervalForm, alphabetOfForm].find((one) => one.id === cell2.fields.form);
      if (!form2) throw Error("REFUSE\xB7codec sample has no selected form");
      return { digest, form: form2, params: JSON.parse(cell2.fields.params) };
    },
    origin: (id, by, scope) => granted("evidence/origin", id, by, scope),
    witness: (id, by, scope) => granted("evidence/witness", id, by, scope)
  };
}

// work/bound-0.2.0/api-public-places/reader-entry.ts
function observe2(bytes) {
  const sample = JSON.parse(new TextDecoder().decode(bytes));
  const history = objectHistory(sample.history);
  if (history.kind !== "fact") throw Error("REFUSE\xB7" + history.why);
  const context2 = context({ digest: sample.pin, records: history.value.configuration, admit: () => true });
  const checked = validateObjectContext(history.value.objects, { ...context2, admit: () => true });
  if (checked.kind !== "fact") throw Error("REFUSE\xB7" + checked.why);
  const actual = objectFold(checked.value, context2);
  if (JSON.stringify(actual) !== JSON.stringify(sample.expected)) throw Error("REFUSE\xB7engine projection differs from captured native output");
  return [{ scope: "conformance/engine-object/" + sample.name, role: "writes", measure: "count", bound: { kind: "interval", lo: 0, hi: 0 } }];
}
export {
  observe2 as observe
};
