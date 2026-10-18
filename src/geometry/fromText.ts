/**
 * "Gõ đề ra hình": builds the figure of a Vietnamese geometry exercise, offline.
 *
 *  1. Normalise: symbols (∆ ⊥ // ∈ Â …), accents, units, decimal commas; names stay in capitals.
 *  2. Split the text into sentences (Bài 1, a), b) …) and clauses; questions ("Chứng minh…",
 *     "Tính…") are skipped.
 *  3. Recognise intents with patterns written with name / number / list placeholders and
 *     synonyms ("nối B với N", "nối BN", "kẻ đoạn BN" are the same intent).
 *  4. Run the intents in dependency order (a point used before it is defined waits for it).
 *  5. Report each sentence (understood / partly / not), with suggestions for the rest.
 */
import { Fig } from './builder';
import { computeAll, dist, type Value, type Vec } from './engine';
import { transformObjects } from './edit';
import { drawingBounds } from './render';
import type { Construction, Id, Style } from './model';

/* ------------------------------------------------------------------ results */

export interface Suggestion {
  /** What it would draw, for the button. */
  label: string;
  /** The wording that replaces the clause (Vietnamese, with accents). */
  text: string;
}

export interface ClauseReport {
  text: string;
  ok: boolean;
  suggestions: Suggestion[];
}

export type SentenceStatus = 'ok' | 'partial' | 'none' | 'skip' | 'off';

export interface SentenceReport {
  text: string;
  status: SentenceStatus;
  done: string[];
  errors: string[];
  clauses: ClauseReport[];
}

export interface TextFigure {
  construction: Construction;
  /** What was drawn, in order. */
  done: string[];
  /** Clauses not understood (original wording) and errors. */
  missed: string[];
  sentences: SentenceReport[];
}

/** A wording taught by the user: `from` (normalised, names as {1} {2} …) means `to`. */
export interface UserPhrase {
  from: string;
  to: string;
}

export interface ParseOptions {
  phrases?: UserPhrase[];
  /** Sentences (by index) left out. */
  off?: number[];
}

/* -------------------------------------------------------------- normalising */

const SHORT = new Set(['ke', 've', 'tu', 'la', 'va', 'co', 'ca', 'do', 'ta', 'ma', 'ba', 'cm', 'dm', 'mm', 'km', 'ha', 'hi', 'no', 'em', 'cu', 'ra', 'bo', 'di', 'de', 'vo', 'he', 'so', 'mo']);

/** Lower-case words, names in capitals, symbols spelt out, no accents. Keeps parentheses. */
export function normalize(input: string): string {
  let t = input.normalize('NFC');
  // Â, Ê, Ô alone stand for the angle at that vertex
  t = t.replace(/(^|[^\p{L}])([ÂÊÔ])(?=[^\p{L}]|$)/gu, (_, a: string, c: string) => `${a}goc ${({ Â: 'A', Ê: 'E', Ô: 'O' } as Record<string, string>)[c]}`);
  t = t
    .replace(/[∆△Δ▵]\s*/g, 'tam giac ')
    .replace(/⊥/g, ' vuong goc voi ')
    .replace(/∥|\/\//g, ' song song voi ')
    .replace(/∉/g, ' khong thuoc ')
    .replace(/∈/g, ' thuoc ')
    .replace(/∩/g, ' cat ')
    .replace(/≡/g, ' trung ')
    .replace(/[’′`´ʹ]/g, "'")
    .replace(/[−–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/[“”]/g, '"');
  t = [...t].map((ch) => (ch === 'đ' ? 'd' : ch === 'Đ' ? 'D' : ch.normalize('NFD')[0])).join('');
  t = t.replace(/(\d),(\d)/g, '$1.$2');
  t = t.replace(/(\d)\s*(km|cm|dm|mm|m)(\^?2|²)?(?![a-z])/g, (_, d: string, u: string, sq?: string) => `${d} ${u}${sq ? '2' : ''}`);
  t = t.replace(/[A-Za-z]+/g, (w) => (/^[A-Z]?[a-z]{2,}$/.test(w) || (/^[A-Z][a-z]$/.test(w) && SHORT.has(w.toLowerCase())) ? w.toLowerCase() : w));
  t = t
    .replace(/\btg\b/g, 'tam giac')
    .replace(/\b(?:hinh )?tam giac (?:tam giac )+/g, 'tam giac ')
    .replace(/\s+/g, ' ')
    .replace(/ ?([,;:]) ?/g, '$1 ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .replace(/° ?/g, '° ')
    .trim();
  return t;
}

/* ------------------------------------------------------------- pattern kit */

const NAME = "[A-Z]'?";
const B = "(?<![A-Za-z'])";
const E = "(?![A-Za-z'])";
const MAC: Record<string, string> = {
  P: `${B}(${NAME})${E}`,
  PP: `${B}(${NAME})(${NAME})${E}`,
  PPP: `${B}(${NAME})(${NAME})(${NAME})${E}`,
  PPPP: `${B}(${NAME})(${NAME})(${NAME})(${NAME})${E}`,
  /** a list of names: "M, N", "M va N" */
  PL: `(?<!tai )${B}(${NAME}(?:(?:, ?| va |, va )${NAME})*)${E}`,
  /** a list of two-letter names: "AB, AC", "HE va HF" */
  SL: `${B}(${NAME}${NAME}(?:(?:, ?| va |, va )${NAME}${NAME})*)${E}`,
  /** a list of polygon names (ABCDEG) */
  NAMES: `${B}((?:${NAME}){3,8})${E}`,
  N: '(-?\\d+(?:\\.\\d+)?)',
  F: '(\\d+(?:\\.\\d+)?(?:/\\d+)?)',
  U: '(?: ?(km|cm|dm|mm|m)(?![a-z0-9]))?',
  /** ray Ox / Ox' */
  RAY: `${B}([A-Z])([a-z]'?)${E}`,
  /** angle name: xOy, ABC, A */
  ANG: `${B}([a-z]'?[A-Z][a-z]'?|[A-Z]'?[A-Z]'?[A-Z]'?|[A-Z]'?)${E}`,
  /** line name after "duong thang": d, a, xy, xx' */
  L: "(?<![A-Za-z])([a-z]'?(?:[a-z]'?)?)(?![A-Za-z'])",
  SEP: '(?:, ?| va | voi |, va )',
  /** drawing verbs */
  V: '(?:ke|ve|dung|noi|ha|lay)',
};
const re = (src: string) => new RegExp(src.replace(/\{(\w+)\}/g, (_, k: string) => MAC[k] ?? `{${k}}`), 'g');
const names = (list: string) => list.split(/, ?| va |, va /).map((s) => s.trim()).filter(Boolean);
const pairs = (list: string) => names(list).map((s) => s.match(/[A-Z]'?/g) as [string, string]);
const toNum = (s: string) => (s.includes('/') ? Number(s.split('/')[0]) / Number(s.split('/')[1]) : parseFloat(s));
const UNIT: Record<string, number> = { mm: 0.1, cm: 1, dm: 10, m: 100, km: 100000 };
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/* --------------------------------------------------------------- the figure */

interface Measure {
  /** value in cm */
  cm: number;
  /** as written: "15 m" */
  shown: string;
}

class Scene {
  fig = new Fig();
  len = new Map<string, Measure>();
  ratio: { a: string; k: number; b: string }[] = [];
  ang = new Map<string, number>();
  equalSides: [string, string][] = [];
  equalAngles: [string, string][] = [];
  /** [shorter, longer] sides: "AB < AC" */
  inequalities: [string, string][] = [];
  /** lines named with a small letter: d, a, xy */
  lines = new Map<string, Id>();
  dims = new Map<string, Measure>();
  /** names of the main triangle / polygon, for elements that need it */
  triangle: [string, string, string] | null = null;
  polygons: string[][] = [];
  circles: { id: Id; centre: string | null }[] = [];
  lastSolid: Id | null = null;
  coords = false;
  /** given lengths to write on the figure */
  showLengths: [string, string, string][] = [];

  has = (n: string) => this.fig.has(n);
  id = (n: string) => this.fig.id(n);
  pos = (n: string): Vec => (this.fig.values.get(this.id(n)) as Extract<Value, { k: 'point' }>).p;
  length(a: string, b: string): Measure | undefined {
    return this.len.get(a + b) ?? this.len.get(b + a);
  }
  /** A free point; names already used get the next free letter. */
  point(name: string, at: Vec, style: Style = {}): Id {
    if (this.has(name)) return this.id(name);
    return this.fig.pt(name, at.x, at.y, style);
  }
  freeName(prefer: string[]): string {
    for (const p of prefer) if (!this.has(p)) return p;
    for (const l of 'ABCDEFGHIKLMNPQRSTUVXYZ') if (!this.has(l)) return l;
    return 'P';
  }
  segmentExists(a: string, b: string): boolean {
    const ia = this.id(a);
    const ib = this.id(b);
    const key = [ia, ib].sort().join();
    return this.fig.c.objects.some(
      (o) =>
        !o.style.hidden &&
        ((o.def.t === 'segment' && [o.def.a, o.def.b].sort().join() === key) ||
          (o.def.t === 'polygon' && o.def.pts.some((q, i, arr) => [q, arr[(i + 1) % arr.length]].sort().join() === key))),
    );
  }
  segment(a: string, b: string, style: Style = {}): Id | null {
    if (this.segmentExists(a, b) && !style.label && !style.ticks && !style.dash) return null;
    return this.fig.seg(a, b, style);
  }
  line(a: string, b: string, hidden = true): Id {
    return this.fig.add('l', { t: 'line', a: this.id(a), b: this.id(b) }, hidden ? { hidden: true } : {});
  }
  /** Where the next unrelated shape goes (to the right of what is drawn). */
  freeSpot(): Vec {
    const objs = this.fig.c.objects.filter((o) => !o.style.hidden);
    if (!objs.length) return { x: 0, y: 0 };
    const b = drawingBounds(this.fig.c, computeAll(this.fig.c));
    return b ? { x: b.xmax + 2, y: b.ymin } : { x: 0, y: 0 };
  }
}

/* ---------------------------------------------------------------- intents */

interface Intent {
  name: string;
  /** lower runs first and claims its words */
  rank: number;
  /** data (lengths, angles): counted as understood but does not block other intents */
  data?: boolean;
  re: RegExp;
  /** names that must exist before it runs (others it creates) */
  needs?(m: RegExpMatchArray, s: Scene): string[];
  run(m: RegExpMatchArray, s: Scene): string | string[] | null;
}

const SHAPE_VI: Record<string, string> = {
  'hinh vuong': 'Hình vuông', 'hinh chu nhat': 'Hình chữ nhật', 'hinh binh hanh': 'Hình bình hành', 'hinh thoi': 'Hình thoi',
  'hinh thang can': 'Hình thang cân', 'hinh thang vuong': 'Hình thang vuông', 'hinh thang': 'Hình thang', 'tu giac': 'Tứ giác',
};

/** Triangle with vertices from the sides / angles known (P on top, Q R on the base). */
function solveTriangle(nm: [string, string, string], s: Scene, kind: { right?: string; iso?: string; eq?: boolean }): Record<string, Vec> {
  const [P, Q, R] = nm;
  const side = (x: string, y: string) => s.length(x, y)?.cm;
  for (const r of s.ratio) {
    const [x, y] = [r.a[0], r.a[1]];
    const [u, v] = [r.b[0], r.b[1]];
    if (side(x, y) === undefined && side(u, v) !== undefined) s.len.set(x + y, { cm: side(u, v)! * r.k, shown: '' });
    if (side(u, v) === undefined && side(x, y) !== undefined) s.len.set(u + v, { cm: side(x, y)! / r.k, shown: '' });
  }
  let a = side(Q, R);
  let b = side(P, R);
  let c = side(P, Q);
  let A = s.ang.get(P);
  let Bq = s.ang.get(Q);
  let C = s.ang.get(R);
  for (const [u, v] of s.equalSides) {
    // AB = AC: equal sides at their shared vertex
    const shared = u.split('').find((ch) => v.includes(ch));
    if (shared && nm.includes(shared) && !kind.iso) kind.iso = shared;
  }
  for (const [u, v] of s.equalAngles) if (nm.includes(u) && nm.includes(v) && !kind.iso) kind.iso = nm.find((x) => x !== u && x !== v);
  if (kind.eq) {
    const e = a ?? b ?? c ?? s.dims.get('canh')?.cm ?? 4;
    a = b = c = e;
  }
  if (kind.right === P) A = 90;
  if (kind.right === Q) Bq = 90;
  if (kind.right === R) C = 90;
  if (kind.iso === P) {
    b ??= c;
    c ??= b;
    if (Bq !== undefined) C ??= Bq;
    if (C !== undefined) Bq ??= C;
  } else if (kind.iso === Q) {
    a ??= c;
    c ??= a;
    if (A !== undefined) C ??= A;
    if (C !== undefined) A ??= C;
  } else if (kind.iso === R) {
    a ??= b;
    b ??= a;
    if (A !== undefined) Bq ??= A;
    if (Bq !== undefined) A ??= Bq;
  }
  const rad = (d: number) => (d * Math.PI) / 180;
  // two sides and no angle at all: take a pleasant angle between them
  if (A === undefined && Bq === undefined && C === undefined && !kind.right && !kind.iso && !kind.eq) {
    if (b !== undefined && c !== undefined && a === undefined) A = 65;
    else if (a !== undefined && c !== undefined && b === undefined) Bq = 65;
    else if (a !== undefined && b !== undefined && c === undefined) C = 65;
  }
  for (let k = 0; k < 4; k++) {
    if (A !== undefined && Bq !== undefined && C === undefined) C = 180 - A - Bq;
    if (A !== undefined && C !== undefined && Bq === undefined) Bq = 180 - A - C;
    if (Bq !== undefined && C !== undefined && A === undefined) A = 180 - Bq - C;
    if (a !== undefined && b !== undefined && c === undefined && C !== undefined) c = Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(rad(C)));
    if (a !== undefined && c !== undefined && b === undefined && Bq !== undefined) b = Math.sqrt(a * a + c * c - 2 * a * c * Math.cos(rad(Bq)));
    if (b !== undefined && c !== undefined && a === undefined && A !== undefined) a = Math.sqrt(b * b + c * c - 2 * b * c * Math.cos(rad(A)));
    if (A === 90 && a !== undefined && b !== undefined && c === undefined) c = Math.sqrt(Math.max(0, a * a - b * b));
    if (A === 90 && a !== undefined && c !== undefined && b === undefined) b = Math.sqrt(Math.max(0, a * a - c * c));
    if (Bq === 90 && b !== undefined && a !== undefined && c === undefined) c = Math.sqrt(Math.max(0, b * b - a * a));
    if (Bq === 90 && b !== undefined && c !== undefined && a === undefined) a = Math.sqrt(Math.max(0, b * b - c * c));
    if (C === 90 && c !== undefined && a !== undefined && b === undefined) b = Math.sqrt(Math.max(0, c * c - a * a));
    if (C === 90 && c !== undefined && b !== undefined && a === undefined) a = Math.sqrt(Math.max(0, c * c - b * b));
    if (A !== undefined && Bq !== undefined && C !== undefined) {
      const k2 = a !== undefined ? a / Math.sin(rad(A)) : b !== undefined ? b / Math.sin(rad(Bq)) : c !== undefined ? c / Math.sin(rad(C)) : undefined;
      if (k2 !== undefined) {
        a ??= k2 * Math.sin(rad(A));
        b ??= k2 * Math.sin(rad(Bq));
        c ??= k2 * Math.sin(rad(C));
      }
    }
    // isosceles with the apex angle or the base and a leg known
    if (kind.iso === P && a !== undefined && b !== undefined && A === undefined) A = (2 * Math.asin(Math.min(1, a / 2 / b)) * 180) / Math.PI;
    if (a !== undefined && b !== undefined && c !== undefined) {
      const cosA = (b * b + c * c - a * a) / (2 * b * c);
      if (Math.abs(cosA) > 1 + 1e-9) throw new Error(`ba cạnh ${fmt(a)}, ${fmt(b)}, ${fmt(c)} cm không tạo thành tam giác (bất đẳng thức tam giác)`);
      A ??= (Math.acos(Math.max(-1, Math.min(1, cosA))) * 180) / Math.PI;
    }
  }
  if (a !== undefined && b !== undefined && c !== undefined) {
    const x = (a * a + c * c - b * b) / (2 * a);
    return { [Q]: { x: 0, y: 0 }, [R]: { x: a, y: 0 }, [P]: { x, y: Math.sqrt(Math.max(0, c * c - x * x)) } };
  }
  const scale = a ?? (b ? b * 1.2 : c ? c * 1.2 : 5);
  if (A !== undefined && Bq !== undefined && C !== undefined) {
    const cc = (scale / Math.sin(rad(A))) * Math.sin(rad(C));
    return { [Q]: { x: 0, y: 0 }, [R]: { x: scale, y: 0 }, [P]: { x: cc * Math.cos(rad(Bq)), y: cc * Math.sin(rad(Bq)) } };
  }
  if (kind.right) {
    const k = scale / 5;
    const o = nm.filter((x) => x !== kind.right);
    return { [kind.right]: { x: 0, y: 0 }, [o[0]]: { x: 0, y: 3 * k }, [o[1]]: { x: 4 * k, y: 0 } };
  }
  if (kind.iso) {
    const o = nm.filter((x) => x !== kind.iso);
    return { [o[0]]: { x: 0, y: 0 }, [o[1]]: { x: scale * 0.85, y: 0 }, [kind.iso]: { x: scale * 0.425, y: scale * 0.75 } };
  }
  return { [Q]: { x: 0, y: 0 }, [R]: { x: scale, y: 0 }, [P]: { x: scale * 0.3, y: scale * 0.72 } };
}

/** The triangle that has vertex v (the main one, or any drawn). */
function triangleWith(s: Scene, v: string): [string, string, string] | null {
  if (s.triangle?.includes(v)) return s.triangle;
  const p = s.polygons.find((q) => q.length === 3 && q.includes(v));
  return p ? (p as [string, string, string]) : null;
}

/** Point X on line ST at distance `d` from S (negative: on the other side of S). */
function pointAlong(s: Scene, name: string, S: string, T: string, d: number): string {
  const L = dist(s.pos(S), s.pos(T));
  s.fig.add('p', { t: 'image', of: s.id(T), tr: { k: 'dilate', center: s.id(S), factor: d / L } }, { label: name });
  return name;
}

/** Distance from `from` to the new point `x` given by the conditions ("OA = 2 cm", "MD = MA", "BE = 2EC"). */
function distanceFromConditions(s: Scene, x: string, from: string, to: string, cond: string): number | null {
  const L = dist(s.pos(from), s.pos(to));
  const total = L;
  for (const m of cond.matchAll(re('{PP} ?= ?{F} ?{PP}'))) {
    // ratio: BE = 2EC on segment BC
    const [, a, b, k, c, d] = m;
    const kk = toNum(k);
    if ([a, b].includes(x) && [c, d].includes(x)) {
      const other1 = a === x ? b : a;
      if (other1 === from) return (total * kk) / (1 + kk);
      return total / (1 + kk);
    }
    if ([a, b].includes(x) && [a, b].includes(from) && ((c === from && d === to) || (c === to && d === from))) return total * kk;
  }
  for (const m of cond.matchAll(re('{PP} ?= ?{N}{U}(?! ?[A-Z])'))) {
    const [, a, b, v, u] = m;
    if ([a, b].includes(x) && [a, b].includes(from)) return toNum(v) * (UNIT[u ?? 'cm'] ?? 1) * 1;
    if ([a, b].includes(x) && [a, b].includes(to)) return total - toNum(v) * (UNIT[u ?? 'cm'] ?? 1);
  }
  for (const m of cond.matchAll(re('{PP} ?= ?{PP}'))) {
    const [, a, b, c, d] = m;
    // MD = MA: as long as a segment already there
    if ([a, b].includes(x) && [a, b].includes(from) && s.has(c) && s.has(d)) return dist(s.pos(c), s.pos(d));
    if ([c, d].includes(x) && [c, d].includes(from) && s.has(a) && s.has(b)) return dist(s.pos(a), s.pos(b));
  }
  return null;
}

/** Lengths "AB = 3 cm" become numbers in the scene (used by shapes), shown on the figure. */
function measureIntents(): Intent[] {
  return [
    {
      name: 'length', rank: 0, data: true, re: re('{PP} ?(?:=|bang|dai|co do dai(?: la| bang)?|la) ?{N}{U}(?! ?[A-Z]|\\.?\\d|/)'),
      run: (m, s) => {
        const [, a, b, v, u] = m;
        const cm = toNum(v) * (UNIT[u ?? 'cm'] ?? 1);
        s.len.set(a + b, { cm, shown: `${fmt(toNum(v))} ${u ?? 'cm'}` });
        s.showLengths.push([a, b, `${fmt(toNum(v))} ${u ?? 'cm'}`]);
        return null;
      },
    },
    {
      name: 'ratio', rank: 0, data: true, re: re('{PP} ?= ?{F} ?{PP}'),
      run: (m, s) => {
        s.ratio.push({ a: m[1] + m[2], k: toNum(m[3]), b: m[4] + m[5] });
        return null;
      },
    },
    {
      name: 'angle', rank: 0, data: true, re: re('goc {ANG} ?(?:=|bang|co so do(?: la| bang)?) ?{N} ?(?:°|do)?'),
      run: (m, s) => {
        const a = m[1];
        s.ang.set(a.replace(/'/g, '').length === 3 && /^[A-Z]/.test(a) ? a.replace(/'/g, '')[1] : a, toNum(m[2]));
        return null;
      },
    },
    {
      name: 'equal sides', rank: 0, data: true, re: re('{PP} ?= ?{PP}(?! ?[0-9])'),
      run: (m, s) => {
        s.equalSides.push([m[1] + m[2], m[3] + m[4]]);
        return null;
      },
    },
    {
      name: 'equal angles', rank: 0, data: true, re: re('goc {ANG} ?= ?goc {ANG}'),
      run: (m, s) => {
        s.equalAngles.push([m[1], m[2]]);
        return null;
      },
    },
    {
      name: 'dimension', rank: 0, data: true,
      re: re('(chieu dai|chieu rong|canh day|canh ben|chieu cao|day lon|day nho|ban kinh(?: day)?|duong kinh|(?:do dai )?(?:moi )?canh(?! day| ben)|dien tich|chu vi)(?: cua [a-z ]+?)?(?: (?:la|bang|dai|=|khoang|co|do dai))* ?{N} ?(km|cm|dm|mm|m)?(2)?(?![a-z0-9])'),
      run: (m, s) => {
        const key = m[1].replace(/^(?:do dai )?(?:moi )?canh$/, 'canh').replace(/^ban kinh day$/, 'ban kinh');
        const u = m[3] ?? 'cm';
        const v = toNum(m[2]);
        const area = key === 'dien tich';
        s.dims.set(key, { cm: area ? v * (UNIT[u] ?? 1) ** 2 : v * (UNIT[u] ?? 1), shown: `${fmt(v)} ${u}${area ? '²' : ''}` });
        return null;
      },
    },
    {
      name: 'inequality', rank: 0, data: true, re: re('{PP} ?(<|>|<=|>=|≤|≥) ?{PP}'),
      run: (m, s) => {
        const less = m[3] === '<' || m[3] === '<=' || m[3] === '≤';
        s.inequalities.push(less ? [m[1] + m[2], m[4] + m[5]] : [m[4] + m[5], m[1] + m[2]]);
        return null;
      },
    },
    {
      name: 'contact points', rank: 0, data: true, re: re('\\(?{PL} (?:la )?(?:cac |hai )?tiep diem\\)?'),
      run: () => null,
    },
    {
      name: 'coordinate plane', rank: 0, data: true, re: re('(?:trong )?(?:tren )?mat phang(?: toa do)?(?: oxy)?'),
      run: (_m, s) => {
        s.coords = true;
        return null;
      },
    },
    {
      name: 'line perpendicular to a plane', rank: 0, data: true, re: re('{PP} (?:vuong goc|⊥)(?: voi)? (?:mat phang |mp )?(?:\\({NAMES}\\)|day)'),
      run: () => null,
    },
    {
      name: 'width as a part of the length', rank: 0, data: true, re: re('chieu rong(?: la| bang)? ?{F} chieu dai'),
      run: (m, s) => {
        const L = s.dims.get('chieu dai');
        if (L) s.dims.set('chieu rong', { cm: L.cm * toNum(m[1]), shown: `${fmt((L.cm * toNum(m[1])) / (UNIT[L.shown.split(' ')[1]] ?? 1))} ${L.shown.split(' ')[1]}` });
        return null;
      },
    },
    {
      name: 'diagonals', rank: 0, data: true, re: re('(?:do dai )?hai duong cheo(?: (?:la|dai|bang|lan luot (?:la|bang|dai)))? ?{N}{U}(?: va |, ){N}{U}'),
      run: (m, s) => {
        const u = m[2] ?? m[4] ?? 'cm';
        s.dims.set('cheo1', { cm: toNum(m[1]) * (UNIT[u] ?? 1), shown: `${fmt(toNum(m[1]))} ${u}` });
        s.dims.set('cheo2', { cm: toNum(m[3]) * (UNIT[m[4] ?? u] ?? 1), shown: `${fmt(toNum(m[3]))} ${m[4] ?? u}` });
        return null;
      },
    },
    {
      name: 'one diagonal', rank: 0, data: true, re: re('(?<!hai )(?:mot )?duong cheo(?: {PP})?(?: (?:la|dai|bang|=))* ?{N}{U}'),
      run: (m, s) => {
        const u = m[4] ?? 'cm';
        const key = s.dims.has('cheo1') ? 'cheo2' : 'cheo1';
        s.dims.set(key, { cm: toNum(m[3]) * (UNIT[u] ?? 1), shown: `${fmt(toNum(m[3]))} ${u}` });
        if (m[1]) s.dims.set(`cheo:${m[1]}${m[2]}`, s.dims.get(key)!);
        return null;
      },
    },
  ];
}

/** Shapes given in the exercise ("Cho tam giác ABC…", "hình chữ nhật có chiều dài…"). */
function shapeIntents(): Intent[] {
  return [
    {
      name: 'triangle', rank: 1,
      re: re('tam giac(?: (deu|vuong can|vuong|can|nhon|tu))? {PPP}((?:,? (?:co |la )?(?:goc )?(?:vuong can|vuong|can|deu|nhon|tu)(?: tai {P})?)*)(?: (?:co )?canh ?(?:bang |= ?)?{N}{U})?'),
      run: (m, s) => {
        const nm: [string, string, string] = [m[2], m[3], m[4]];
        if (nm.every((n) => s.has(n))) {
          // a triangle of points already drawn: just its sides
          if (!s.polygons.some((p) => p.length === 3 && nm.every((n) => p.includes(n)))) {
            s.fig.poly(nm);
            s.polygons.push(nm);
          }
          return `Tam giác ${nm.join('')}`;
        }
        const rest = `${m[1] ?? ''} ${m[5] ?? ''}`;
        const at = m[6];
        const kind = {
          eq: /deu/.test(rest),
          right: /vuong/.test(rest) ? at ?? nm[0] : undefined,
          iso: /can/.test(rest) ? at ?? nm[0] : undefined,
        } as { eq: boolean; right?: string; iso?: string };
        if (m[7] && kind.eq) s.len.set(nm[1] + nm[2], { cm: toNum(m[7]) * (UNIT[m[8] ?? 'cm'] ?? 1), shown: `${fmt(toNum(m[7]))} ${m[8] ?? 'cm'}` });
        for (const [v, deg] of s.ang) if (nm.includes(v) && Math.abs(deg - 90) < 1e-9 && !kind.right) kind.right = v;
        const p = solveTriangle(nm, s, kind);
        // "AB < AC": mirror the apex if the drawing says the opposite
        for (const [short, long] of s.inequalities) {
          const L = (x: string) => (p[x[0]] && p[x[1]] ? dist(p[x[0]], p[x[1]]) : NaN);
          if (L(short) > L(long)) {
            const xs = nm.map((n) => p[n].x);
            const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
            for (const n of nm) p[n] = { x: 2 * mid - p[n].x, y: p[n].y };
            break;
          }
        }
        const off = s.freeSpot();
        nm.forEach((n) => s.point(n, { x: p[n].x + off.x, y: p[n].y + off.y }));
        s.fig.poly(nm);
        s.polygons.push(nm);
        s.triangle ??= nm;
        if (kind.right) {
          const o = nm.filter((x) => x !== kind.right);
          s.fig.angle(o[0], kind.right, o[1]);
        }
        if (kind.eq) for (const [x, y] of [[nm[0], nm[1]], [nm[1], nm[2]], [nm[2], nm[0]]]) s.fig.seg(x, y, { ticks: 1 });
        else if (kind.iso) for (const o of nm.filter((x) => x !== kind.iso)) s.fig.seg(kind.iso, o, { ticks: 1 });
        for (const [v, deg] of s.ang) {
          if (!nm.includes(v) || (kind.right === v && deg === 90)) continue;
          const o = nm.filter((x) => x !== v);
          s.fig.angle(o[0], v, o[1], { label: `${fmt(deg)}°`, showLabel: true });
        }
        return `Tam giác ${nm.join('')}${kind.eq ? ' đều' : kind.right && kind.iso ? ` vuông cân tại ${kind.right}` : kind.right ? ` vuông tại ${kind.right}` : kind.iso ? ` cân tại ${kind.iso}` : ''}`;
      },
    },
    {
      name: 'quadrilateral', rank: 1,
      re: re('(hinh vuong|hinh chu nhat|hinh binh hanh|hinh thoi|hinh thang can|hinh thang vuong|hinh thang|tu giac)(?: {PPPP})?(?:,? \\(?{PP} song song(?: voi)? {PP}\\)?)?'),
      run: (m, s) => {
        const kind = m[1];
        // unnamed shapes in word problems: only the first one is drawn
        if (!m[2] && s.polygons.length) return null;
        if (m[2] && [m[2], m[3], m[4], m[5]].every((n) => s.has(n))) {
          const nm = [m[2], m[3], m[4], m[5]];
          if (!s.polygons.some((p) => p.length === 4 && nm.every((n) => p.includes(n)))) {
            s.fig.poly(nm);
            s.polygons.push(nm);
          }
          return `${SHAPE_VI[kind]} ${nm.join('')}`;
        }
        const nm = m[2] ? [m[2], m[3], m[4], m[5]] : ['A', 'B', 'C', 'D'].map((x, i, arr) => (s.has(x) ? s.freeName(arr.slice(i)) : x));
        const L = (a: string, b: string) => s.length(a, b)?.cm;
        const d = (k: string) => s.dims.get(k)?.cm;
        const shown = new Map<string, string>(); // side key → text
        const label = (k: string) => s.dims.get(k)?.shown;
        let pts: Vec[];
        if (kind === 'hinh vuong') {
          const a = d('canh') ?? L(nm[0], nm[1]) ?? (d('dien tich') ? Math.sqrt(d('dien tich')!) : undefined) ?? (d('chu vi') ? d('chu vi')! / 4 : undefined) ?? 4;
          pts = [{ x: 0, y: 0 }, { x: a, y: 0 }, { x: a, y: a }, { x: 0, y: a }];
          if (label('canh')) shown.set('01', label('canh')!);
        } else if (kind === 'hinh chu nhat') {
          let w = d('chieu dai') ?? L(nm[0], nm[1]) ?? L(nm[2], nm[3]);
          let h = d('chieu rong') ?? L(nm[1], nm[2]) ?? L(nm[0], nm[3]);
          const S = d('dien tich');
          const P = d('chu vi');
          if (w === undefined && h !== undefined) w = S ? S / h : P ? P / 2 - h : undefined;
          if (h === undefined && w !== undefined) h = S ? S / w : P ? P / 2 - w : undefined;
          w ??= 5;
          h ??= w * 0.6;
          pts = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
          if (label('chieu dai')) shown.set('01', label('chieu dai')!);
          if (label('chieu rong')) shown.set('12', label('chieu rong')!);
        } else if (kind === 'hinh binh hanh') {
          const base = d('canh day') ?? L(nm[0], nm[1]) ?? 5;
          const side = d('canh ben') ?? L(nm[0], nm[3]) ?? L(nm[1], nm[2]);
          let h = d('chieu cao') ?? (d('dien tich') ? d('dien tich')! / base : undefined);
          let dx: number;
          if (side !== undefined && h !== undefined && side > h) dx = Math.sqrt(side * side - h * h);
          else if (side !== undefined) {
            dx = side * 0.5;
            h = side * Math.sin(Math.PI / 3);
          } else {
            h ??= base * 0.55;
            dx = base * 0.3;
          }
          pts = [{ x: 0, y: 0 }, { x: base, y: 0 }, { x: base + dx, y: h }, { x: dx, y: h }];
          if (label('canh day')) shown.set('01', label('canh day')!);
          if (label('canh ben')) shown.set('30', label('canh ben')!);
          if (label('chieu cao')) shown.set('h', label('chieu cao')!);
        } else if (kind === 'hinh thoi') {
          let d1 = d(`cheo:${nm[0]}${nm[2]}`) ?? d('cheo1');
          let d2 = d(`cheo:${nm[1]}${nm[3]}`) ?? d('cheo2');
          const S = d('dien tich');
          if (d1 !== undefined && d2 === undefined && S) d2 = (2 * S) / d1;
          const a = d('canh') ?? L(nm[0], nm[1]) ?? (d('chu vi') ? d('chu vi')! / 4 : undefined);
          if (d1 === undefined && a !== undefined) {
            d1 = a * Math.sqrt(3);
            d2 = a;
          }
          d1 ??= 6;
          d2 ??= d1 * 0.65;
          pts = [{ x: 0, y: 0 }, { x: d1 / 2, y: -d2 / 2 }, { x: d1, y: 0 }, { x: d1 / 2, y: d2 / 2 }];
          if (label('canh')) shown.set('01', label('canh')!);
          if (s.dims.has('cheo1')) shown.set('d1', s.dims.get(`cheo:${nm[0]}${nm[2]}`)?.shown ?? label('cheo1')!);
          if (s.dims.has('cheo2')) shown.set('d2', label('cheo2')!);
        } else if (kind.startsWith('hinh thang')) {
          const ab = L(nm[0], nm[1]);
          const cd = L(nm[2], nm[3]);
          let big = d('day lon') ?? Math.max(ab ?? 0, cd ?? 0);
          let small = d('day nho') ?? (ab !== undefined && cd !== undefined ? Math.min(ab, cd) : undefined);
          if (!big) big = 6;
          small ??= big * 0.55;
          const leg = d('canh ben') ?? L(nm[1], nm[2]) ?? L(nm[0], nm[3]);
          let h = d('chieu cao') ?? (d('dien tich') ? (2 * d('dien tich')!) / (big + small) : undefined);
          if (h === undefined && leg !== undefined) h = Math.sqrt(Math.max(0.01, leg * leg - ((big - small) / 2) ** 2));
          h ??= big * 0.45;
          const off = kind === 'hinh thang vuong' ? 0 : kind === 'hinh thang can' ? (big - small) / 2 : (big - small) * 0.3;
          // AB is the long base at the bottom, unless AB was given as the short one
          const abTop = ab !== undefined && cd !== undefined && ab < cd;
          pts = abTop
            ? [{ x: off, y: h }, { x: off + small, y: h }, { x: big, y: 0 }, { x: 0, y: 0 }]
            : [{ x: 0, y: 0 }, { x: big, y: 0 }, { x: off + small, y: h }, { x: off, y: h }];
          if (label('day lon')) shown.set(abTop ? '23' : '01', label('day lon')!);
          if (label('day nho')) shown.set(abTop ? '01' : '23', label('day nho')!);
          if (label('chieu cao')) shown.set('h', label('chieu cao')!);
        } else {
          pts = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5.6, y: 3 }, { x: 1, y: 3.5 }];
        }
        const o = s.freeSpot();
        nm.forEach((n, i) => s.point(n, { x: pts[i].x + o.x, y: pts[i].y + o.y }));
        s.fig.poly(nm);
        s.polygons.push(nm);
        if (kind === 'hinh vuong' || kind === 'hinh chu nhat') s.fig.angle(nm[1], nm[0], nm[3]);
        if (kind === 'hinh thang vuong') {
          s.fig.angle(nm[1], nm[0], nm[3]);
          s.fig.angle(nm[0], nm[3], nm[2]);
        }
        if (kind === 'hinh vuong' || kind === 'hinh thoi') for (let i = 0; i < 4; i++) s.fig.seg(nm[i], nm[(i + 1) % 4], { ticks: 1, ...(i === 0 && shown.get('01') ? { label: shown.get('01'), showLabel: true } : {}) });
        if (kind === 'hinh thang can') {
          s.fig.seg(nm[0], nm[3], { ticks: 1 });
          s.fig.seg(nm[1], nm[2], { ticks: 1 });
        }
        // the given sizes, written on the figure
        for (const [k, text] of shown) {
          if (k === 'h') {
            const H = s.freeName(['H', 'K']);
            const foot = s.fig.tool('baseHeight', [nm[0], nm[1], nm[3]]);
            s.fig.name(foot, H);
            const seg = foot.find((x) => x.def.t === 'segment' && x.style.dash === 'dashed');
            if (seg) s.fig.style(seg.id, { label: text, showLabel: true });
          } else if (k === 'd1' || k === 'd2') {
            const [i, j] = k === 'd1' ? [0, 2] : [1, 3];
            s.fig.seg(nm[i], nm[j], { dash: 'dashed', label: text, showLabel: true });
          } else if (!(kind === 'hinh vuong' || kind === 'hinh thoi') || k !== '01') {
            const i = Number(k[0]);
            const j = Number(k[1]);
            s.fig.seg(nm[i], nm[j], { label: text, showLabel: true });
          }
        }
        return `${SHAPE_VI[kind]} ${nm.join('')}`;
      },
    },
    {
      name: 'regular polygon', rank: 1,
      re: re('(luc giac deu|ngu giac deu|bat giac deu|da giac deu)(?: {NAMES})?(?: (?:co )?canh(?: (?:la|bang|dai))? ?{N}{U})?'),
      run: (m, s) => {
        const n = { 'luc giac deu': 6, 'ngu giac deu': 5, 'bat giac deu': 8, 'tam giac deu': 3, 'da giac deu': 6 }[m[1]] ?? 6;
        if (n === 3 && m[2]) return null; // a named equilateral triangle: the triangle intent
        const given = m[2]?.match(/[A-Z]'?/g) ?? [];
        const nm = given.length === n ? given : 'ABCDEFGH'.slice(0, n).split('').map((x, i, arr) => (s.has(x) ? s.freeName(arr.slice(i)) : x));
        const side = m[3] ? toNum(m[3]) * (UNIT[m[4] ?? 'cm'] ?? 1) : s.dims.get('canh')?.cm ?? 2.5;
        const o = s.freeSpot();
        s.point(nm[0], o);
        s.point(nm[1], { x: o.x + side, y: o.y });
        s.fig.names(s.fig.tool('regularPolygon', [nm[0], nm[1]], String(n)), nm.slice(2));
        s.polygons.push(nm);
        return `${{ 6: 'Lục giác đều', 5: 'Ngũ giác đều', 8: 'Bát giác đều', 3: 'Tam giác đều' }[n] ?? 'Đa giác đều'} ${nm.join('')}`;
      },
    },
    {
      name: 'main diagonals of a hexagon', rank: 3, re: re('(?:ba )?duong cheo chinh(?: cat nhau tai {P})?'),
      run: (m, s) => {
        const hex = s.polygons.find((p) => p.length === 6);
        if (!hex) throw new Error('chưa có lục giác');
        const lines = [0, 1, 2].map((i) => {
          s.segment(hex[i], hex[i + 3]);
          return s.line(hex[i], hex[i + 3]);
        });
        if (m[1]) s.fig.add('p', { t: 'intersection', a: lines[0], b: lines[1], index: 0 }, { label: m[1] });
        return `Ba đường chéo chính${m[1] ? ` cắt nhau tại ${m[1]}` : ''}`;
      },
    },
    {
      name: 'circle (O; R)', rank: 1,
      re: re('(?:nua )?duong tron (?:\\({P} ?; ?(?:{N}{U}|R|r|{PP})\\)|tam {P},? (?:ban kinh|bk) (?:R ?= ?)?{N}{U}|\\({P}\\)(?: (?:co )?duong kinh {PP})?|tam {P}(?! ban))'),
      run: (m, s) => {
        const O = m[1] ?? m[6] ?? m[9] ?? m[12];
        let r = m[2] ? toNum(m[2]) * (UNIT[m[3] ?? 'cm'] ?? 1) : m[7] ? toNum(m[7]) * (UNIT[m[8] ?? 'cm'] ?? 1) : s.dims.get('ban kinh')?.cm ?? (s.dims.get('duong kinh') ? s.dims.get('duong kinh')!.cm / 2 : 2.5);
        if (m[4] && s.has(m[4]) && s.has(m[5])) r = dist(s.pos(m[4]), s.pos(m[5]));
        if (s.circles.some((c) => c.centre === O)) return null;
        const placed = s.has(O);
        const o = placed ? s.pos(O) : s.triangle || s.polygons.length ? s.freeSpot() : { x: 0, y: 0 };
        const oid = s.point(O, placed ? o : { x: o.x + r, y: o.y + r });
        const c0 = s.pos(O);
        let cid: Id;
        if (m[10]) {
          // (O) with diameter AB
          const A = s.point(m[10], { x: c0.x - r, y: c0.y });
          s.fig.add('p', { t: 'image', of: A, tr: { k: 'reflectPoint', center: oid } }, { label: m[11] });
          cid = s.fig.add('c', { t: 'circle', center: oid, through: A });
          s.segment(m[10], m[11]);
        } else {
          const through = s.fig.add('p', { t: 'point', x: c0.x + r, y: c0.y }, { hidden: true });
          cid = s.fig.add('c', { t: 'circle', center: oid, through });
        }
        s.circles.push({ id: cid, centre: O });
        return `Đường tròn (${O}; ${fmt(r)} cm)`;
      },
    },
    {
      name: 'segment given', rank: 1, re: re('(?:ve |cho )?doan thang {PP}(?: (?:co do dai|dai|=|bang) ?{N}{U})?'),
      run: (m, s) => {
        const [, a, b, v, u] = m;
        if (s.has(a) && s.has(b)) {
          s.segment(a, b);
          return `Đoạn thẳng ${a}${b}`;
        }
        const L = v ? toNum(v) * (UNIT[u ?? 'cm'] ?? 1) : s.length(a, b)?.cm ?? 5;
        const o = s.freeSpot();
        s.point(a, o);
        s.point(b, { x: o.x + L, y: o.y });
        s.segment(a, b);
        if (v) s.showLengths.push([a, b, `${fmt(toNum(v))} ${u ?? 'cm'}`]);
        return `Đoạn thẳng ${a}${b}${v ? ` = ${fmt(toNum(v))} ${u ?? 'cm'}` : ''}`;
      },
    },
    {
      name: 'angle xOy given', rank: 1, re: re('goc {ANG} ?(?:=|bang|co so do(?: la| bang)?) ?{N} ?(?:°|do)?'),
      run: (m, s) => {
        const a = m[1];
        if (!/^[a-z][A-Z][a-z]/.test(a.replace(/'/g, ''))) return null; // angles of a triangle: data only
        const x = a[0];
        const O = a.replace(/'/g, '')[1];
        const y = a.replace(/'/g, '')[2];
        if (s.has(x) && s.has(y)) return null;
        const oid = s.point(O, s.has(O) ? s.pos(O) : s.freeSpot());
        const op = s.pos(O);
        const xid = s.has(x) ? s.id(x) : s.fig.pt(x, op.x + 4, op.y, { dot: false });
        if (!s.fig.c.objects.some((o2) => o2.def.t === 'ray' && o2.def.a === oid && o2.def.b === xid)) s.fig.add('l', { t: 'ray', a: oid, b: xid });
        const made = s.fig.tool('angleFixed', [xid, oid], m[2]);
        s.fig.name(made, y);
        // angleFixed draws Ox again: keep one
        const rays = s.fig.c.objects.filter((o2) => o2.def.t === 'ray' && o2.def.a === oid && o2.def.b === xid);
        if (rays.length > 1) s.fig.c.objects = s.fig.c.objects.filter((o2) => o2.id !== rays[1].id);
        return `Góc ${x}${O}${y} = ${m[2]}°`;
      },
    },
    {
      name: 'angle xOy (no size)', rank: 1, re: re("(?:cho |ve )?goc (nhon |tu |vuong |bet )?([a-z]'?)([A-Z])([a-z]'?)(?! ?(?:=|bang|co so do))"),
      run: (m, s) => {
        const [, kind, x, O, y] = m;
        if (s.has(x) && s.has(y)) return null;
        const deg = kind === 'tu ' ? 125 : kind === 'vuong ' ? 90 : kind === 'bet ' ? 180 : 65;
        const oid = s.point(O, s.has(O) ? s.pos(O) : s.freeSpot());
        const op = s.pos(O);
        const xid = s.has(x) ? s.id(x) : s.fig.pt(x, op.x + 4, op.y, { dot: false });
        s.fig.add('l', { t: 'ray', a: oid, b: xid });
        const yid = s.fig.add('p', { t: 'image', of: xid, tr: { k: 'rotate', center: oid, deg } }, { label: y, dot: false });
        s.fig.add('l', { t: 'ray', a: oid, b: yid });
        if (deg === 90) s.fig.add('ang', { t: 'angle', a: xid, b: oid, c: yid });
        return `Góc ${x}${O}${y}`;
      },
    },
    {
      name: 'opposite rays', rank: 1, re: re('hai tia doi nhau {RAY}(?:, | va ){RAY}'),
      run: (m, s) => {
        const [, O, x, , y] = m;
        const oid = s.point(O, s.has(O) ? s.pos(O) : s.freeSpot());
        const op = s.pos(O);
        const xid = s.has(x) ? s.id(x) : s.fig.pt(x, op.x + 3.5, op.y, { dot: false });
        const yid = s.has(y) ? s.id(y) : s.fig.add('p', { t: 'image', of: xid, tr: { k: 'reflectPoint', center: oid } }, { label: y, dot: false });
        s.fig.add('l', { t: 'ray', a: oid, b: xid });
        s.fig.add('l', { t: 'ray', a: oid, b: yid });
        return `Hai tia đối nhau ${O}${x}, ${O}${y}`;
      },
    },
    {
      name: 'ray Ox', rank: 2, re: re('(?:ve |cho )?tia {RAY}'),
      run: (m, s) => {
        const [, O, x] = m;
        if (s.has(O) && s.has(x)) return null;
        const oid = s.point(O, s.has(O) ? s.pos(O) : s.freeSpot());
        const op = s.pos(O);
        const xid = s.fig.pt(x, op.x + 5, op.y, { dot: false });
        s.fig.add('l', { t: 'ray', a: oid, b: xid });
        return `Tia ${O}${x}`;
      },
    },
    {
      name: 'two crossing lines', rank: 1, re: re("hai duong thang ([a-z]'?[a-z]'?) va ([a-z]'?[a-z]'?) cat nhau tai {P}"),
      run: (m, s) => {
        const O = m[3];
        const oid = s.point(O, s.has(O) ? s.pos(O) : s.freeSpot());
        const tips = (pair: string, deg: number) => {
          const [a, b] = pair.match(/[a-z]'?/g)!;
          const t1 = s.fig.add('p', { t: 'pointPolar', center: oid, r: 3, deg }, { label: a, dot: false });
          const t2 = s.fig.add('p', { t: 'image', of: t1, tr: { k: 'reflectPoint', center: oid } }, { label: b, dot: false });
          s.fig.add('l', { t: 'line', a: t2, b: t1 });
        };
        tips(m[1], 15);
        tips(m[2], 115);
        return `Hai đường thẳng ${m[1]}, ${m[2]} cắt nhau tại ${O}`;
      },
    },
    {
      name: 'line d with a point off it', rank: 1, re: re('(?:diem )?{P} (?:nam ngoai|khong thuoc|khong nam tren) duong thang {L}'),
      run: (m, s) => {
        const [, A, d] = m;
        const o = s.freeSpot();
        const p1 = s.fig.add('p', { t: 'point', x: o.x, y: o.y }, { dot: false, showLabel: false });
        const p2 = s.fig.add('p', { t: 'point', x: o.x + 6, y: o.y }, { dot: false, showLabel: false });
        s.lines.set(d, s.fig.add('l', { t: 'line', a: p1, b: p2 }, { label: d, showLabel: true }));
        s.point(A, { x: o.x + 2.5, y: o.y + 2.2 });
        return `Đường thẳng ${d} và điểm ${A} nằm ngoài ${d}`;
      },
    },
    {
      name: 'collinear points', rank: 1, re: re('(?:cho )?(?:ba |bon )?diem {PL}(?! ?\\()(?: (khong )?thang hang)?(?:,? (?:diem )?{P} nam giua (?:hai diem )?{P} va {P})?'),
      run: (m, s) => {
        const list = names(m[1]);
        if (list.every((n) => s.has(n)) || list.length < 2) return null;
        const o = s.freeSpot();
        const straight = m[2] === undefined && /thang hang/.test(m[0]);
        let order = list;
        if (m[3] && m[4] && m[5]) order = [m[4], m[3], m[5], ...list.filter((x) => ![m[3], m[4], m[5]].includes(x))];
        order.forEach((n, i) => s.point(n, straight || m[3] ? { x: o.x + i * 2.4, y: o.y + i * 0.6 } : { x: o.x + i * 2.4, y: o.y + (i % 2 ? 2 : 0) }));
        if (straight || m[3]) s.fig.add('l', { t: 'line', a: s.id(order[0]), b: s.id(order[order.length - 1]) });
        return `${list.length} điểm ${list.join(', ')}${straight || m[3] ? ' thẳng hàng' : ''}`;
      },
    },
    {
      name: 'coordinates', rank: 1, re: re('{P} ?\\( ?{N} ?[;,] ?{N} ?\\)'),
      run: (m, s) => {
        s.coords = true;
        if (s.has(m[1])) return null;
        s.fig.pt(m[1], toNum(m[2]), toNum(m[3]));
        return `${m[1]}(${m[2]}; ${m[3]})`;
      },
    },
    {
      name: 'graph', rank: 1, re: re('(?:do thi(?: cua)?(?: ham so)?|ham so|duong thang|parabol(?: \\(P\\))?)(?: \\([a-z]\\))?:? y ?= ?([0-9x+\\-*/^. ()]+)'),
      run: (m, s) => {
        const expr = m[1].replace(/\s+/g, '').replace(/(\d)x/g, '$1*x').replace(/[.,;]$/, '');
        s.coords = true;
        s.fig.add('f', { t: 'function', expr }, { label: `y = ${expr}`, showLabel: false });
        return `Đồ thị y = ${expr}`;
      },
    },
    {
      name: 'solid', rank: 1,
      re: re("(hinh chop(?: (?:deu|tu giac|tam giac))*|hinh hop chu nhat|hinh lap phuong|(?:hinh )?lang tru(?: (?:dung|deu|tam giac|tu giac))*|(?:qua bong )?hinh tru|(?:qua bong )?hinh non|(?:qua bong )?hinh cau)(?: {P}\\.((?:[A-Z]'?){3,4})(?:\\.((?:[A-Z]'?){3,4}))?|(?: ((?:[A-Z]'?){3,4})\\.((?:[A-Z]'?){3,4})))?(?:,? co day(?: (?:[A-Z]'?){3,4})? la (?:hinh vuong|hinh chu nhat|hinh thoi|hinh binh hanh|tam giac(?: deu| vuong| can)*(?: (?:[A-Z]'?){3})?)(?: canh {N}{U})?)?"),
      run: (m, s) => {
        const word = m[1];
        const apex = m[2];
        const base = (m[3] ?? m[5])?.match(/[A-Z]'?/g) ?? null;
        const top = (m[4] ?? m[6])?.match(/[A-Z]'?/g) ?? null;
        const d = (k: string) => s.dims.get(k)?.cm;
        const L = (a: string, b: string) => s.length(a, b)?.cm;
        const kind = /chop/.test(word) ? (base?.length === 3 || /tam giac/.test(word) ? 'pyramid3' : 'pyramid4')
          : /hop/.test(word) ? 'cuboid' : /lap phuong/.test(word) ? 'cube' : /lang tru/.test(word) ? 'prism3'
          : /tru/.test(word) ? 'cylinder' : /non/.test(word) ? 'cone' : 'sphere';
        const nm = base ?? (kind === 'pyramid3' || kind === 'prism3' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']);
        const a = d('canh') ?? (nm.length >= 2 ? L(nm[0], nm[1]) : undefined);
        let w = a ?? d('chieu dai') ?? 4;
        let dd = (nm.length >= 4 ? L(nm[0], nm[3]) ?? L(nm[1], nm[2]) : undefined) ?? d('chieu rong') ?? (kind === 'cube' ? w : w * 0.75);
        let h = d('chieu cao') ?? (top ? L(nm[0], top[0]) : undefined) ?? (apex ? L(apex, nm[0]) : undefined) ?? (kind === 'cube' ? w : 3.5);
        const r = d('ban kinh') ?? (d('duong kinh') ? d('duong kinh')! / 2 : undefined);
        if (kind === 'cylinder' || kind === 'cone' || kind === 'sphere') {
          w = 2 * (r ?? 1.6);
          dd = 0;
          h = kind === 'sphere' ? w : d('chieu cao') ?? 3.5;
        }
        if (/day (?:la )?hinh vuong/.test(m.input ?? '') || /deu/.test(word)) dd = w;
        const apexOverA = new RegExp(`${apex ?? 'S'}${nm[0]} vuong goc voi (?:mat phang |mp )?(?:\\(?${nm.join('')}\\)?|day)`).test(m.input ?? '');
        const o = s.freeSpot();
        const at = s.fig.add('p', { t: 'point', x: o.x, y: o.y }, kind === 'cylinder' || kind === 'cone' || kind === 'sphere' ? { label: 'O' } : kind === 'prism3' || kind === 'pyramid3' ? { hidden: true } : { label: nm[0] });
        const sid = s.fig.add('sol', { t: 'solid', kind, at, w, d: dd, h, ...(apexOverA ? { apexOverA: true } : {}) });
        const v = (i: number, label: string) => s.fig.add('p', { t: 'solidVertex', solid: sid, i }, { label });
        if (kind === 'cuboid' || kind === 'cube' || kind === 'pyramid4') {
          nm.slice(1, 4).forEach((n, i) => v(i + 1, n));
          if (kind === 'pyramid4') v(4, apex ?? 'S');
          else (top ?? nm.map((n) => `${n}'`)).forEach((n, i) => v(4 + i, n));
        } else if (kind === 'prism3' || kind === 'pyramid3') {
          nm.forEach((n, i) => v(i, n));
          if (kind === 'prism3') (top ?? nm.map((n) => `${n}'`)).forEach((n, i) => v(3 + i, n));
          else v(3, apex ?? 'S');
        } else if (kind === 'cylinder') v(1, "O'");
        else if (kind === 'cone') v(1, apex ?? 'S');
        s.lastSolid = sid;
        const vi: Record<string, string> = { cuboid: 'Hình hộp chữ nhật', cube: 'Hình lập phương', prism3: 'Lăng trụ', pyramid3: 'Hình chóp', pyramid4: 'Hình chóp', cylinder: 'Hình trụ', cone: 'Hình nón', sphere: 'Hình cầu' };
        return `${vi[kind]}${apex ? ` ${apex}.` : ' '}${nm.join('')}${top ? `.${top.join('')}` : ''}${apexOverA ? ` (${apex ?? 'S'}${nm[0]} ⊥ đáy)` : ''}`;
      },
    },
  ];
}

/** Lines, points and circles built on what is there. */
function elementIntents(): Intent[] {
  const list: Intent[] = [
    /* ---- the lines of a triangle ---- */
    {
      name: 'altitude / median / bisector', rank: 3,
      re: re('(?:cac |ba |hai )?(duong cao|trung tuyen|duong trung tuyen|phan giac(?: trong)?|duong phan giac(?: trong)?) {SL}(?: (?:cua tam giac {PPP} )?(?:cat nhau tai|dong quy tai|cat nhau o) {P})?'),
      needs: (m) => pairs(m[2]).map((p) => p[0]),
      run: (m, s) => {
        const kind = m[1];
        const tool = /cao/.test(kind) ? 'altitude' : /trung tuyen/.test(kind) ? 'median' : 'bisectorIn';
        const out: string[] = [];
        const lines: Id[] = [];
        for (const [v, foot] of pairs(m[2])) {
          const tr = triangleWith(s, v);
          if (!tr) throw new Error(`chưa có tam giác chứa đỉnh ${v}`);
          if (!s.has(foot)) {
            const made = s.fig.tool(tool, [v, ...tr.filter((x) => x !== v)]);
            s.fig.name(made, foot);
          } else s.segment(v, foot);
          lines.push(s.line(v, foot));
          out.push(`${/cao/.test(kind) ? 'Đường cao' : /trung tuyen/.test(kind) ? 'Trung tuyến' : 'Phân giác'} ${v}${foot}`);
        }
        if (m[6] && lines.length >= 2 && !s.has(m[6])) {
          s.fig.add('p', { t: 'intersection', a: lines[0], b: lines[1], index: 0 }, { label: m[6] });
          out.push(`cắt nhau tại ${m[6]}`);
        }
        return out;
      },
    },
    {
      name: 'centre of a triangle', rank: 3,
      re: re('(?:goi )?{P} la (?:giao diem cua ba duong )?(trong tam|truc tam|trung tuyen|duong cao|tam duong tron ngoai tiep|tam duong tron noi tiep|phan giac)(?: cua)?(?: tam giac {PPP})?'),
      needs: (m, s) => (m[3] ? [m[3], m[4], m[5]] : s.triangle ?? ['?']),
      run: (m, s) => {
        const nm = m[1];
        if (s.has(nm)) return null;
        const tr = m[3] ? [m[3], m[4], m[5]] : s.triangle!;
        const k = m[2];
        const tool = /trong tam|trung tuyen/.test(k) ? 'centroid' : /truc tam|duong cao/.test(k) ? 'orthocenter' : /ngoai/.test(k) ? 'circumcircle' : 'incircle';
        const made = s.fig.tool(tool, tr);
        s.fig.name(made, nm);
        if (tool === 'circumcircle' || tool === 'incircle') {
          // only the centre was asked for
          const circle = made.find((o) => o.def.t === 'circle3' || o.def.t === 'incircle');
          if (circle) s.fig.c.objects = s.fig.c.objects.filter((o) => o.id !== circle.id);
        }
        return `${nm}: ${({ centroid: 'trọng tâm', orthocenter: 'trực tâm', circumcircle: 'tâm đường tròn ngoại tiếp', incircle: 'tâm đường tròn nội tiếp' } as Record<string, string>)[tool]}`;
      },
    },
    {
      name: 'circumcircle / incircle', rank: 3,
      re: re('(?:ve )?duong tron (ngoai|noi) tiep(?: tam giac {PPP}| tu giac {PPPP})?(?: \\({P}\\))?'),
      needs: (m, s) => (m[2] ? [m[2], m[3], m[4]] : s.triangle ?? ['?']),
      run: (m, s) => {
        const tr = m[2] ? [m[2], m[3], m[4]] : s.triangle!;
        const tool = m[1] === 'ngoai' ? 'circumcircle' : 'incircle';
        const want = m[9] ?? (tool === 'circumcircle' ? 'O' : 'I');
        const made = s.fig.tool(tool, tr);
        if (!s.has(want)) s.fig.name(made, want);
        const c = made.find((o) => o.def.t === 'circle3' || o.def.t === 'incircle');
        if (c) s.circles.push({ id: c.id, centre: want });
        return `Đường tròn ${m[1] === 'ngoai' ? 'ngoại' : 'nội'} tiếp tam giác ${tr.join('')}`;
      },
    },
    /* ---- points ---- */
    {
      name: 'midpoints', rank: 2,
      re: re('(?:goi |lay )?(?:diem )?{PL} (?:lan luot )?(?:la|theo thu tu la) trung diem (?:cua )?(?:cac )?(?:doan thang |doan |canh )?{SL}'),
      needs: (m) => {
        const ms = names(m[1]);
        const ss = pairs(m[2]);
        // each midpoint needs its two ends, or (to build an end) the midpoint and the other end
        return ss.flatMap((p, i) => (p.every((x) => ms.includes(x)) ? [] : p.filter((x) => x !== ms[i])));
      },
      run: (m, s) => {
        const ms = names(m[1]);
        const ss = pairs(m[2]);
        const out: string[] = [];
        ss.forEach(([a, b], i) => {
          const M = ms[i] ?? ms[0];
          if (s.has(a) && s.has(b)) {
            if (s.has(M)) return;
            const made = s.fig.tool('midpoint', [a, b], undefined, { halves: true });
            s.fig.name(made, M);
            out.push(`${M} là trung điểm ${a}${b}`);
          } else if (s.has(M)) {
            // M is the midpoint of AE, E new: E is A reflected in M
            const [known, fresh] = s.has(a) ? [a, b] : [b, a];
            s.fig.add('p', { t: 'image', of: s.id(known), tr: { k: 'reflectPoint', center: s.id(M) } }, { label: fresh });
            s.segment(known, fresh);
            out.push(`${fresh} sao cho ${M} là trung điểm ${a}${b}`);
          }
        });
        return out;
      },
    },
    {
      name: 'perpendicular from a point (foot)', rank: 2,
      re: re('(?:tu {P} )?(?:ke|ve|ha|dung)?(?: duong (?:thang )?vuong goc)? ?{PP} vuong goc(?: voi| xuong)? ?{PP}(?:,? ?\\(?(?:tai {P}|{P} thuoc {PP})\\)?)?'),
      needs: (m, s) => {
        const [v, foot, a, b] = [m[2], m[3], m[4], m[5]];
        return s.has(foot) && s.has(v) ? [v, foot, a, b] : [v, a, b];
      },
      run: (m, s) => {
        const [v, foot, a, b] = [m[2], m[3], m[4], m[5]];
        if (s.has(v) && s.has(foot) && foot !== a && foot !== b && !(m[6] || m[7]) && (s.has(a) && s.has(b)) && dist(s.pos(v), s.pos(foot)) > 0) {
          // both ends drawn: a hypothesis ("AH ⊥ BC"): the right angle
          const other = foot === a ? b : a;
          if (!s.fig.c.objects.some((o) => o.def.t === 'angle' && o.def.b === s.id(foot))) s.fig.angle(v, foot, other);
          s.segment(v, foot);
          return `${v}${foot} ⊥ ${a}${b}`;
        }
        if ([a, b].includes(foot)) {
          // "AB ⊥ AC" with A shared: a right angle at A
          const other = foot === a ? b : a;
          s.segment(v, foot);
          s.fig.angle(v, foot, other);
          return `${v}${foot} ⊥ ${a}${b}`;
        }
        const made = s.fig.tool('baseHeight', [a, b, v]);
        s.fig.name(made, foot);
        return `${v}${foot} ⊥ ${a}${b}`;
      },
    },
    {
      name: 'perpendicular from a point to a line', rank: 2,
      re: re('(?:tu {P} )?(?:ke|ve|ha) duong (?:thang )?vuong goc (?:voi|xuong|den) ?{PP}(?:,? ?\\(?(?:tai|cat {PP} tai) {P}\\)?)?'),
      needs: (m) => [m[1] ?? '?', m[2], m[3]],
      run: (m, s) => {
        const made = s.fig.tool('baseHeight', [m[2], m[3], m[1]]);
        if (m[6]) s.fig.name(made, m[6]);
        return `Đường vuông góc từ ${m[1]} xuống ${m[2]}${m[3]}`;
      },
    },
    {
      name: 'parallel / perpendicular through a point', rank: 2,
      re: re('(?:(?:tu|qua) {P},? )?(?:ke |ve |dung )?(?:duong thang |tia )?(?:{L} )?(?:(?:di )?qua {P} )?(song song|vuong goc) voi {PP}(?:,? ?(?:cat|cat canh|cat duong thang) {PP} (?:tai|o) {P}(?:(?:,| va) (?:cat )?{PP} (?:tai|o) {P})?)?'),
      needs: (m) => [m[1] ?? m[3] ?? '?', m[5], m[6]],
      run: (m, s) => {
        const through = m[1] ?? m[3];
        const kind = m[4];
        const base = s.line(m[5], m[6]);
        if (m[9]) {
          // "… cắt AC tại E": the segment from the point to E
          const l = s.fig.add('l', { t: kind === 'song song' ? 'parallel' : 'perpendicular', line: base, through: s.id(through) }, { hidden: true });
          const ends: string[] = [];
          for (const [x, y, E] of [[m[7], m[8], m[9]], [m[10], m[11], m[12]]]) {
            if (!E) continue;
            if (!s.has(E)) s.fig.add('p', { t: 'intersection', a: l, b: s.line(x, y), index: 0 }, { label: E });
            ends.push(E);
          }
          if (ends.length === 2) s.segment(ends[0], ends[1]);
          else s.segment(through, ends[0]);
          if (kind === 'vuong goc') s.fig.angle(m[5], ends[0], through === ends[0] ? m[6] : through);
          return `Qua ${through} kẻ đường thẳng ${kind === 'song song' ? 'song song' : 'vuông góc'} với ${m[5]}${m[6]}, cắt tại ${ends.join(', ')}`;
        }
        const l = s.fig.add('l', { t: kind === 'song song' ? 'parallel' : 'perpendicular', line: base, through: s.id(through) }, m[2] ? { label: m[2], showLabel: true } : {});
        if (kind === 'vuong goc') s.fig.add('ang', { t: 'angleLines', l1: base, l2: l, s1: 1, s2: 1 });
        return `Đường thẳng qua ${through} ${kind === 'song song' ? 'song song' : 'vuông góc'} với ${m[5]}${m[6]}`;
      },
    },
    {
      name: 'line through a point, perpendicular / parallel to a named line', rank: 2,
      re: re('(?:ve |ke )?(?:duong thang |tia )?(?:{L} )?(?:di )?qua {P} (?:va )?(song song|vuong goc) voi (?:duong thang )?{L}'),
      needs: (m, s) => [m[2], ...(s.lines.has(m[4]) ? [] : ['?'])],
      run: (m, s) => {
        const base = s.lines.get(m[4])!;
        const l = s.fig.add('l', { t: m[3] === 'song song' ? 'parallel' : 'perpendicular', line: base, through: s.id(m[2]) }, m[1] ? { label: m[1], showLabel: true } : {});
        if (m[3] !== 'song song') s.fig.add('ang', { t: 'angleLines', l1: base, l2: l, s1: 1, s2: 1 });
        return `Đường thẳng qua ${m[2]} ${m[3] === 'song song' ? 'song song' : 'vuông góc'} với ${m[4]}`;
      },
    },
    {
      name: 'named line', rank: 1, re: re('(?:cho |ve )?(?:hai )?duong thang {L}(?:(?:, | va ){L})?(?: song song(?: voi)?(?: duong thang)? {L})?(?! ?(?:di )?qua)'),
      run: (m, s) => {
        const list = [m[1], m[2], m[3]].filter((x): x is string => !!x && !s.lines.has(x) && x !== 'va');
        if (!list.length) return null;
        const o = s.freeSpot();
        const parallel = /song song/.test(m[0]);
        list.forEach((d, i) => {
          const p1 = s.fig.add('p', { t: 'point', x: o.x, y: o.y + i * 1.6 }, { dot: false, showLabel: false });
          const p2 = s.fig.add('p', { t: 'point', x: o.x + 6, y: o.y + i * 1.6 + (parallel ? 0 : i * 0.8) }, { dot: false, showLabel: false });
          s.lines.set(d, s.fig.add('l', { t: 'line', a: p1, b: p2 }, { label: d, showLabel: true }));
        });
        return `Đường thẳng ${list.join(', ')}${parallel ? ' song song' : ''}`;
      },
    },
    {
      name: 'segment parallel through a point (MK // AB, K ∈ AC)', rank: 2,
      re: re('(?:tu {P} )?(?:ke|ve) {PP} song song(?: voi)? {PP},? ?\\(?(?:{P} thuoc|thuoc) ?{PP}\\)?'),
      needs: (m) => [m[2], m[4], m[5], m[7], m[8]],
      run: (m, s) => {
        const [M, K] = [m[2], m[3]];
        const par = s.fig.add('l', { t: 'parallel', line: s.line(m[4], m[5]), through: s.id(M) }, { hidden: true });
        if (!s.has(K)) s.fig.add('p', { t: 'intersection', a: par, b: s.line(m[7], m[8]), index: 0 }, { label: K });
        s.segment(M, K);
        return `${M}${K} // ${m[4]}${m[5]} (${K} thuộc ${m[7]}${m[8]})`;
      },
    },
    {
      name: 'angle bisector meeting a side', rank: 2,
      re: re('(?:ke |ve )?(?:tia |duong )?phan giac (?:{RAY} )?(?:cua )?goc {ANG}(?:,? cat {PP} (?:tai|o) {P})?'),
      needs: (m) => {
        const a = m[3].replace(/'/g, '');
        return a.length === 3 ? a.split('') : a.length === 1 ? [a] : ['?'];
      },
      run: (m, s) => {
        const a = m[3].replace(/'/g, '');
        let A: string;
        let V: string;
        let C: string;
        if (a.length === 3) [A, V, C] = a.split('');
        else {
          const tr = triangleWith(s, a);
          if (!tr) throw new Error(`chưa có góc ${a}`);
          V = a;
          [A, C] = tr.filter((x) => x !== a);
        }
        if (m[6]) {
          const bis = s.fig.add('l', { t: 'angleBisector', a: s.id(A), b: s.id(V), c: s.id(C) }, { hidden: true });
          if (!s.has(m[6])) s.fig.add('p', { t: 'intersection', a: bis, b: s.line(m[4], m[5]), index: 0 }, { label: m[6] });
          s.segment(V, m[6]);
          s.fig.angle(A, V, m[6], { arcTicks: 1 });
          s.fig.angle(m[6], V, C, { arcTicks: 1 });
          return `Phân giác góc ${A}${V}${C} cắt ${m[4]}${m[5]} tại ${m[6]}`;
        }
        const made = s.fig.tool('angleBisector', [A, V, C]);
        if (m[2]) s.fig.name(made.filter((o) => o.style.dot === false), m[2]);
        return `Tia phân giác của góc ${A}${V}${C}`;
      },
    },
    {
      name: 'ray Ot is the bisector of xOy', rank: 2, re: re('{RAY} la (?:tia )?phan giac (?:cua )?goc {ANG}'),
      needs: (m) => m[3].replace(/'/g, '').split(''),
      run: (m, s) => {
        const [A, V, C] = m[3].replace(/'/g, '').split('');
        const made = s.fig.tool('angleBisector', [A, V, C]);
        s.fig.name(made.filter((o) => o.style.dot === false), m[2]);
        return `${m[1]}${m[2]} là tia phân giác của góc ${m[3]}`;
      },
    },
    {
      name: 'ray between two rays with an angle', rank: 2,
      re: re('(?:ve )?tia {RAY} (?:nam giua hai tia {RAY}(?:, | va ){RAY} )?sao cho goc {ANG} ?(?:=|bang) ?{N} ?(?:°|do)?'),
      needs: (m) => [m[1], m[7].replace(/'/g, '')[0] === m[1] ? m[7][2] : m[7][0]],
      run: (m, s) => {
        const O = m[1];
        const z = m[2];
        const name = m[7].replace(/'/g, '');
        const from = name[0] === z ? name[2] : name[0];
        let deg = toNum(m[8]);
        // turn towards the other ray if it is named (z lies between)
        if (m[5] && s.has(m[6] === from ? m[4] : m[6])) {
          const other = m[6] === from ? m[4] : m[6];
          const o = s.pos(O);
          const a1 = Math.atan2(s.pos(from).y - o.y, s.pos(from).x - o.x);
          const a2 = Math.atan2(s.pos(other).y - o.y, s.pos(other).x - o.x);
          const ccw = ((a2 - a1 + 4 * Math.PI) % (2 * Math.PI)) < Math.PI;
          if (!ccw) deg = -deg;
        }
        const tip = s.fig.add('p', { t: 'image', of: s.id(from), tr: { k: 'rotate', center: s.id(O), deg } }, { label: z, dot: false });
        s.fig.add('l', { t: 'ray', a: s.id(O), b: tip });
        s.fig.add('ang', { t: 'angle', a: s.id(from), b: s.id(O), c: tip }, { showValue: true });
        return `Tia ${O}${z} với góc ${name} = ${m[8]}°`;
      },
    },
    {
      name: 'perpendicular bisector', rank: 2,
      re: re('(?:ke |ve )?(?:duong )?trung truc (?:{L} )?(?:cua )?(?:doan thang |doan |canh )?{PP}(?:,? cat {PP} (?:tai|o) {P})?'),
      needs: (m) => [m[2], m[3]],
      run: (m, s) => {
        const made = s.fig.tool('perpBisector', [m[2], m[3]]);
        const l = made.find((o) => o.def.t === 'perpBisector')!;
        if (m[1]) s.fig.style(l.id, { label: m[1], showLabel: true });
        if (m[6] && !s.has(m[6])) s.fig.add('p', { t: 'intersection', a: l.id, b: s.line(m[4], m[5]), index: 0 }, { label: m[6] });
        return `Đường trung trực của ${m[2]}${m[3]}${m[6] ? ` cắt ${m[4]}${m[5]} tại ${m[6]}` : ''}`;
      },
    },
    {
      name: 'intersection', rank: 2,
      re: re('(?:{PP},? (?:va )?{PP} cat nhau tai {P}|{PP} cat {PP} tai {P}|giao diem (?:cua )?(?:hai duong cheo |hai duong thang )?{PP} va {PP}(?: la)? {P}|{P} la giao diem (?:cua )?(?:hai duong cheo |hai duong thang |hai doan thang )?{PP} va {PP})'),
      needs: (m) => {
        const g = m.slice(1).filter(Boolean);
        return g.length === 5 ? (m[16] ? g.slice(1) : g.slice(0, 4)) : g;
      },
      run: (m, s) => {
        const g = m.slice(1).filter(Boolean) as string[];
        const [a, b, c, d, X] = m[16] ? [g[1], g[2], g[3], g[4], g[0]] : g;
        if (s.has(X)) {
          s.segment(a, b);
          s.segment(c, d);
          return null;
        }
        s.fig.add('p', { t: 'intersection', a: s.line(a, b), b: s.line(c, d), index: 0 }, { label: X });
        s.segment(a, b);
        s.segment(c, d);
        return `${X} là giao điểm của ${a}${b} và ${c}${d}`;
      },
    },
    {
      name: 'line meets a circle again', rank: 2,
      re: re('(?:tia |duong thang |doan thang )?{PP} cat (?:duong tron |nua duong tron )?(?:\\({P}\\) |\\({P}\\)|(?:duong tron |nua duong tron )?)?(?:o |tai )?(?:diem thu hai |diem )?{P}'),
      needs: (m, s) => [m[1], m[2], ...(s.circles.length ? [] : ['?'])],
      run: (m, s) => {
        const [a, b] = [m[1], m[2]];
        const X = m[5];
        if (s.has(X)) return null;
        const c = (m[3] ?? m[4]) ? s.circles.find((q) => q.centre === (m[3] ?? m[4])) ?? s.circles[0] : s.circles[s.circles.length - 1];
        const l = s.line(a, b);
        const cv = computeAll(s.fig.c);
        const pts = [0, 1].map((k) => {
          const tmp = { ...s.fig.c, objects: [...s.fig.c.objects, { id: '__x', def: { t: 'intersection' as const, a: l, b: c.id, index: k as 0 | 1 }, style: {} }] };
          const v = computeAll(tmp).get('__x');
          return v?.k === 'point' ? v.p : null;
        });
        void cv;
        // the other point than the one already on the circle
        const known = [a, b].map((n) => s.pos(n));
        const idx = pts.findIndex((p) => p && !known.some((q) => dist(p, q) < 1e-6));
        s.fig.add('p', { t: 'intersection', a: l, b: c.id, index: (idx < 0 ? 1 : idx) as 0 | 1 }, { label: X });
        s.segment(a, X);
        return `${a}${b} cắt đường tròn tại ${X}`;
      },
    },
    {
      name: 'circle with diameter', rank: 2,
      re: re('(?:ve )?duong tron (?:\\({P}\\) )?duong kinh {PP}(?:,? cat {PP}(?:(?:, | va ){PP})? (?:lan luot )?(?:tai|o) {P}(?:(?:, | va ){P})?)?'),
      needs: (m, s) => (s.has(m[2]) && s.has(m[3]) ? [m[2], m[3]] : ['?']),
      run: (m, s) => {
        const [a, b] = [m[2], m[3]];
        const O = m[1] ?? s.freeName(['O', 'I', 'K']);
        const made = s.fig.tool('midpoint', [a, b]);
        s.fig.name(made, O);
        const cid = s.fig.add('c', { t: 'circle', center: s.id(O), through: s.id(a) });
        s.circles.push({ id: cid, centre: O });
        const out = [`Đường tròn đường kính ${a}${b}`];
        if (m[8]) {
          for (const [x, y, E] of [[m[4], m[5], m[8]], [m[6], m[7], m[9]]]) {
            if (!x || !E) continue;
            const l = s.line(x, y);
            // the crossing other than the end of the diameter on that line
            const other = [a, b].find((q) => q === x || q === y);
            const cand = [0, 1].map((k) => computeAll({ ...s.fig.c, objects: [...s.fig.c.objects, { id: '__x', def: { t: 'intersection', a: l, b: cid, index: k as 0 | 1 }, style: {} }] }).get('__x'));
            const idx = cand.findIndex((v) => v?.k === 'point' && (!other || dist(v.p, s.pos(other)) > 1e-6));
            s.fig.add('p', { t: 'intersection', a: l, b: cid, index: (idx < 0 ? 0 : idx) as 0 | 1 }, { label: E });
          }
          out.push(`cắt ${m[4]}${m[5]}${m[6] ? `, ${m[6]}${m[7]}` : ''} tại ${m[8]}${m[9] ? `, ${m[9]}` : ''}`);
        }
        return out;
      },
    },
    {
      name: 'circle centre and radius / point', rank: 2,
      re: re('(?:ve )?duong tron (?:tam {P} (?:ban kinh {PP}|di qua {P})|\\({P} ?; ?{PP}\\))'),
      needs: (m) => [m[1] ?? m[5], ...(m[2] ? [m[2], m[3]] : m[4] ? [m[4]] : [m[6], m[7]])],
      run: (m, s) => {
        const O = m[1] ?? m[5];
        const through = m[4] ?? (m[2] ? (m[2] === O ? m[3] : m[2]) : m[6] === O ? m[7] : m[6]);
        let tid = s.id(through);
        const r = m[2] ? [m[2], m[3]] : m[6] ? [m[6], m[7]] : null;
        if (r && !r.includes(O)) {
          const p = s.pos(O);
          tid = s.fig.add('p', { t: 'point', x: p.x + dist(s.pos(r[0]), s.pos(r[1])), y: p.y }, { hidden: true });
        }
        const cid = s.fig.add('c', { t: 'circle', center: s.id(O), through: tid });
        s.circles.push({ id: cid, centre: O });
        return `Đường tròn tâm ${O}`;
      },
    },
    {
      name: 'tangent at a point', rank: 2,
      re: re('(?:ke |ve )?tiep tuyen (?:{L} )?(?:cua (?:duong tron )?(?:\\({P}\\) )?)?tai {P}(?: (?:cua (?:duong tron )?\\({P}\\) )?cat {PP} (?:tai|o) {P})?'),
      needs: (_m, s) => (s.circles.length ? [] : ['?']),
      run: (m, s) => {
        const c = s.circles.find((q) => q.centre === (m[2] ?? m[4])) ?? s.circles[s.circles.length - 1];
        const A = m[3];
        if (!s.has(A)) s.fig.add('p', { t: 'pointOn', on: c.id, param: 1.1 }, { label: A });
        const made = s.fig.tool('tangent', [A, c.id]);
        const l = made.find((o) => o.def.t === 'tangent');
        if (l && m[1]) s.fig.style(l.id, { label: m[1], showLabel: true });
        if (l && m[7] && !s.has(m[7])) s.fig.add('p', { t: 'intersection', a: l.id, b: s.line(m[5], m[6]), index: 0 }, { label: m[7] });
        return `Tiếp tuyến tại ${A}${m[7] ? ` cắt ${m[5]}${m[6]} tại ${m[7]}` : ''}`;
      },
    },
    {
      name: 'two tangents from a point', rank: 2,
      re: re('(?:tu {P} )?(?:(?:nam ngoai duong tron )?ke )?(?:hai )?tiep tuyen {PP}(?:, | va ){PP}(?: (?:voi|toi|den) (?:duong tron )?(?:\\({P}\\))?)?'),
      needs: (m, s) => (s.circles.length ? [m[2]] : ['?']),
      run: (m, s) => {
        const M = m[2];
        const c = s.circles.find((q) => q.centre === m[6]) ?? s.circles[s.circles.length - 1];
        const made = s.fig.tool('tangent', [M, c.id]);
        s.fig.names(made, [m[3], m[5]]);
        return `Hai tiếp tuyến ${M}${m[3]}, ${M}${m[5]}`;
      },
    },
    {
      name: 'point M outside the circle', rank: 1,
      re: re('(?:diem )?{P} (?:nam )?(?:o )?ngoai (?:duong tron|\\({P}\\))'),
      needs: (_m, s) => (s.circles.length ? [] : ['?']),
      run: (m, s) => {
        if (s.has(m[1])) return null;
        const c = s.circles[s.circles.length - 1];
        const v = s.fig.values.get(c.id) as Extract<Value, { k: 'circle' }>;
        s.point(m[1], { x: v.c.x + v.r * 2.2, y: v.c.y });
        return `${m[1]} nằm ngoài đường tròn`;
      },
    },
    {
      name: 'point on a circle', rank: 2,
      re: re('(?:lay |cho )?(?:diem |hai diem |cac diem )?{PL} (?:thuoc|nam tren|tren|di dong tren) (?:nua )?(?:duong tron|\\({P}\\))(?: \\({P}\\))?'),
      needs: (_m, s) => (s.circles.length ? [] : ['?']),
      run: (m, s) => {
        const c = s.circles.find((q) => q.centre === (m[2] ?? m[3])) ?? s.circles[s.circles.length - 1];
        const list = names(m[1]).filter((n) => !s.has(n));
        list.forEach((n, i) => s.fig.add('p', { t: 'pointOn', on: c.id, param: 0.9 + 1.4 * (i + s.fig.c.objects.filter((o) => o.def.t === 'pointOn').length) }, { label: n }));
        return list.length ? `${list.join(', ')} thuộc đường tròn` : null;
      },
    },
    {
      name: 'point on a side / ray', rank: 2,
      re: re('(?:lay |cho )?(?:diem |hai diem |cac diem )?{PL} (?:thuoc|nam tren|tren|nam giua|o giua)(?: hai diem)? (?:canh |doan thang |doan |duong thang |tia |cung )?(?:{PP}|{P} va {P}|{RAY})(?: sao cho ([^.;]+))?'),
      needs: (m) => (m[2] ? [m[2], m[3]] : m[4] ? [m[4], m[5]] : [m[6], m[7]]),
      run: (m, s) => {
        const list = names(m[1]).filter((n) => !s.has(n));
        const [S, T] = m[2] ? [m[2], m[3]] : m[4] ? [m[4], m[5]] : [m[6], m[7]];
        const cond = m[8] ?? '';
        list.forEach((n, i) => {
          const d = distanceFromConditions(s, n, S, T, cond) ?? dist(s.pos(S), s.pos(T)) * (0.38 + 0.22 * i);
          pointAlong(s, n, S, T, d);
        });
        return list.length ? `${list.join(', ')} thuộc ${S}${T}${cond ? ` sao cho ${cond}` : ''}` : null;
      },
    },
    {
      name: 'on a side / ray take a point such that', rank: 2,
      re: re('tren (?:canh |doan thang |doan |tia |duong thang |cac canh )?(tia doi cua tia |tia doi cua )?(?:{PP}|{RAY})(?:,? (?:lay|ta lay|xac dinh) (?:diem |hai diem |cac diem )?{PL})(?: sao cho ([^.;]+))?'),
      needs: (m) => (m[2] ? [m[2], m[3]] : [m[4], m[5]]),
      run: (m, s) => {
        const opposite = !!m[1];
        const [S, T] = m[2] ? [m[2], m[3]] : [m[4], m[5]];
        const list = names(m[6]).filter((n) => !s.has(n));
        const cond = m[7] ?? '';
        list.forEach((n, i) => {
          const d = distanceFromConditions(s, n, S, T, cond) ?? dist(s.pos(S), s.pos(T)) * (opposite ? 0.8 : 0.4 + 0.25 * i);
          pointAlong(s, n, S, T, opposite ? -d : d);
          if (opposite) s.segment(S, n);
        });
        return list.length ? `Trên ${opposite ? 'tia đối của tia' : ''} ${S}${T} lấy ${list.join(', ')}${cond ? ` sao cho ${cond}` : ''}` : null;
      },
    },
    {
      name: 'point such that M is the midpoint', rank: 2,
      re: re('(?:lay |ve )?(?:diem )?{P} sao cho {P} la trung diem (?:cua )?(?:doan thang |doan )?{PP}'),
      needs: (m) => [m[2], m[3] === m[1] ? m[4] : m[3]],
      run: (m, s) => {
        const [E, M, a, b] = [m[1], m[2], m[3], m[4]];
        if (s.has(E)) return null;
        const known = a === E ? b : a;
        s.fig.add('p', { t: 'image', of: s.id(known), tr: { k: 'reflectPoint', center: s.id(M) } }, { label: E });
        s.segment(known, E);
        return `${E} sao cho ${M} là trung điểm ${a}${b}`;
      },
    },
    {
      name: 'reflection', rank: 2,
      re: re('(?:lay |ve )?(?:diem )?{P} (?:la diem )?doi xung (?:voi )?{P} qua (?:duong thang |diem )?(?:{PP}|{P})'),
      needs: (m) => [m[2], ...(m[3] ? [m[3], m[4]] : [m[5]])],
      run: (m, s) => {
        const [D, A] = [m[1], m[2]];
        if (s.has(D)) return null;
        if (m[3]) s.fig.add('p', { t: 'image', of: s.id(A), tr: { k: 'reflectLine', line: s.line(m[3], m[4]) } }, { label: D });
        else s.fig.add('p', { t: 'image', of: s.id(A), tr: { k: 'reflectPoint', center: s.id(m[5]) } }, { label: D });
        return `${D} đối xứng với ${A} qua ${m[3] ? m[3] + m[4] : m[5]}`;
      },
    },
    /* ---- joining points ---- */
    {
      name: 'join two points', rank: 4,
      re: re("(?:{V}|noi lien|ve ra)(?: cac)?(?: (doan thang|doan|duong thang|tia|duong))?(?: noi)?(?: cac diem)? ((?<![A-Za-z'])[A-Z]'? ?(?:voi|va|,) ?[A-Z]'?(?:,? ?(?:va )?[A-Z]'? (?:voi|va) [A-Z]'?)*)(?![A-Za-z'])(?! ?(?:vuong goc|song song|la|=))"),
      needs: (m) => joinPairs(m[2]).flat(),
      run: (m, s) => join(s, m[1], joinPairs(m[2])),
    },
    {
      name: 'join to a midpoint', rank: 3,
      re: re('(?:{V}|noi)(?: (?:doan thang|doan))?(?: noi)? {P} (?:voi|va) trung diem {P} (?:cua )?(?:doan thang |canh )?{PP}'),
      needs: (m) => [m[1], m[3], m[4]],
      run: (m, s) => {
        if (!s.has(m[2])) s.fig.name(s.fig.tool('midpoint', [m[3], m[4]], undefined, { halves: true }), m[2]);
        s.segment(m[1], m[2]);
        return [`${m[2]} là trung điểm ${m[3]}${m[4]}`, `Đoạn thẳng ${m[1]}${m[2]}`];
      },
    },
    {
      name: 'midpoint named inline', rank: 3, re: re('trung diem {P} (?:cua )?(?:doan thang |canh |doan )?{PP}'),
      needs: (m) => [m[2], m[3]],
      run: (m, s) => {
        if (s.has(m[1])) return null;
        s.fig.name(s.fig.tool('midpoint', [m[2], m[3]], undefined, { halves: true }), m[1]);
        return `${m[1]} là trung điểm ${m[2]}${m[3]}`;
      },
    },
    {
      name: 'chord', rank: 2, re: re('(?:va |ve |ke |cho )?(?:mot )?day(?: cung)? {PP}(?! ?(?:=|la|bang))'),
      needs: (_m, s) => (s.circles.length ? [] : ['?']),
      run: (m, s) => {
        const c = s.circles[s.circles.length - 1];
        const made: string[] = [];
        [m[1], m[2]].forEach((n, i) => {
          if (s.has(n)) return;
          s.fig.add('p', { t: 'pointOn', on: c.id, param: [3.6, 5.8][i] }, { label: n });
          made.push(n);
        });
        s.segment(m[1], m[2]);
        return `Dây ${m[1]}${m[2]}`;
      },
    },
    {
      name: 'line meets the tangent', rank: 2,
      re: re('(?:tia |duong thang |doan thang )?{PP} cat tiep tuyen (?:tai {P} )?(?:cua (?:duong tron )?(?:\\({P}\\) )?)?(?:o|tai) {P}'),
      needs: (m, s) => [m[1], m[2], ...(s.circles.length ? [] : ['?'])],
      run: (m, s) => {
        const tangent = s.fig.c.objects.find((o) => o.def.t === 'tangent' && (!m[3] || o.def.through === s.id(m[3])));
        let line: Id;
        if (tangent) line = tangent.id;
        else {
          const A = m[3];
          const c = s.circles[s.circles.length - 1];
          const made = s.fig.tool('tangent', [A, c.id]);
          line = made.find((o) => o.def.t === 'tangent')!.id;
        }
        if (!s.has(m[5])) s.fig.add('p', { t: 'intersection', a: line, b: s.line(m[1], m[2]), index: 0 }, { label: m[5] });
        s.segment(m[1], m[5]);
        return `${m[1]}${m[2]} cắt tiếp tuyến tại ${m[5]}`;
      },
    },
    {
      name: 'join named segments', rank: 4,
      re: re('(?:{V}|noi lien)(?: cac)?(?: (doan thang|doan|duong thang|tia|duong))? {SL}(?! ?(?:vuong goc|song song|la |cat|=))'),
      needs: (m) => pairs(m[2]).flat(),
      run: (m, s) => join(s, m[1], pairs(m[2])),
    },
    {
      name: 'join a list of points', rank: 4,
      re: re('noi (?:cac|lan luot cac) diem {PL}'),
      needs: (m) => names(m[1]),
      run: (m, s) => {
        const list = names(m[1]);
        return join(s, undefined, list.slice(1).map((n, i) => [list[i], n]));
      },
    },
    {
      name: 'named line / ray / segment through two points', rank: 4,
      re: re(`(?:ve |ke )?(duong thang|tia|doan thang) {PP}(?! ?(?:vuong goc|song song|cat|=|dai|co))`),
      needs: (m) => [m[2], m[3]],
      run: (m, s) => join(s, m[1], [[m[2], m[3]]]),
    },
    {
      name: 'polygon from drawn points', rank: 5, re: re('(?:tu giac|ngu giac|da giac) {NAMES}'),
      needs: (m) => m[1].match(/[A-Z]'?/g)!,
      run: (m, s) => {
        const nm = m[1].match(/[A-Z]'?/g)!;
        if (s.polygons.some((p) => p.length === nm.length && nm.every((n) => p.includes(n)))) return null;
        s.fig.poly(nm);
        s.polygons.push(nm);
        return `Đa giác ${nm.join('')}`;
      },
    },
  ];
  return list;
}

/** "A với E, D với E" / "A, C và B, D" → [A, E], [D, E] */
function joinPairs(t: string): [string, string][] {
  return [...t.matchAll(/([A-Z]'?) ?(?:voi|va|,) ?([A-Z]'?)/g)].map((m) => [m[1], m[2]]);
}

function join(s: Scene, word: string | undefined, list: [string, string][]): string[] {
  const out: string[] = [];
  for (const [a, b] of list) {
    if (word === 'duong thang' || word === 'duong') {
      s.fig.add('l', { t: 'line', a: s.id(a), b: s.id(b) });
      out.push(`Đường thẳng ${a}${b}`);
    } else if (word === 'tia') {
      s.fig.add('l', { t: 'ray', a: s.id(a), b: s.id(b) });
      out.push(`Tia ${a}${b}`);
    } else {
      s.segment(a, b);
      out.push(`Đoạn thẳng ${a}${b}`);
    }
  }
  return out;
}

/** Marks that follow from the hypotheses: AB = AC (ticks), angle B = angle C (arcs). */
function hypothesisMarks(s: Scene): void {
  let k = 1;
  for (const [u, v] of s.equalSides) {
    if (![...u, ...v].every((n) => s.has(n))) continue;
    // already marked as an isosceles triangle?
    const marked = s.fig.c.objects.some((o) => o.def.t === 'segment' && o.style.ticks && [u, v].some((x) => [o.def.t === 'segment' && o.def.a, o.def.t === 'segment' && o.def.b].sort().join() === [s.id(x[0]), s.id(x[1])].sort().join()));
    if (marked) continue;
    s.fig.seg(u[0], u[1], { ticks: k });
    s.fig.seg(v[0], v[1], { ticks: k });
    k = Math.min(3, k + 1);
  }
  let arcs = 2;
  for (const [u, v] of s.equalAngles) {
    for (const a of [u, v]) {
      const nm = a.replace(/'/g, '');
      if (nm.length === 3 && nm.split('').every((n) => s.has(n))) s.fig.angle(nm[0], nm[1], nm[2], { arcs });
      else if (nm.length === 1) {
        const tr = triangleWith(s, nm);
        if (tr) {
          const o = tr.filter((x) => x !== nm);
          s.fig.angle(o[0], nm, o[1], { arcs });
        }
      }
    }
    arcs = Math.min(3, arcs + 1);
  }
}

/* -------------------------------------------------------------- sentences */

/** Sentences of the exercise: "Bài 1.", "a)", "b)" and full stops start a new one. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZĐÀ-Ỹ(]|\p{Lu})|(?<=\S)\s+(?=[a-eA-E]\)\s)/u)
    .map((x) => x.replace(/^\s*(?:(?:Bài|Câu|Ví dụ|Bai|Cau)\s*\d+\s*[*]?\s*(?:\([^)]*\))?\s*[.:)]?|[a-eA-E]\)|\d+\))\s*/u, '').trim())
    .filter((x) => x.length > 0);
}

/** Clauses of a sentence (commas and "và" outside parentheses), with their separators. */
function splitClauses(sentence: string): { text: string; sep: string }[] {
  const out: { text: string; sep: string }[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < sentence.length; i++) {
    const ch = sentence[i];
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || ch === ';')) {
      out.push({ text: cur, sep: ch });
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push({ text: cur, sep: '' });
  return out.filter((c) => c.text.trim() || c.sep);
}

const QUESTION = /^(?:hay )?(?:chung minh|cmr|chung to|tinh|tim|so sanh|hoi|chon|giai thich|vi sao|tai sao|cho biet|khang dinh|dien (?:vao|so|dau|tu|cum)|xac dinh xem|kiem tra|neu|viet|ke ten|dem|nhan xet|doc ten|goi ten|trong cac|trong hinh)/;
/** sentences that end on the blank of a question: "… là:", "… bằng bao nhiêu?" */
const ASKS = /(?:\b(?:la|bang|lan luot la)\s*[:.…]*|bao nhieu\s*\??|\?)\s*$/;
const GEO = /(tam giac|hinh|duong|doan|tia|goc|diem|canh|trung diem|vuong goc|song song|cat|noi|ke|ve|lay|tiep tuyen|truc|tam|luc giac|chop|lang tru|mat phang|do thi)/;

/** Names (capital tokens) in a normalised piece of text. */
const namesIn = (t: string) => [...t.matchAll(/(?<![A-Za-z'])[A-Z]'?(?:[A-Z]'?)*(?![A-Za-z])/g)].map((m) => ({ i: m.index ?? 0, n: m[0] }));

/* ------------------------------------------------------------- suggestions */

/** Ways to read a clause that was not understood, written as phrases the parser knows. */
export function suggest(clause: string, sNorm: string): Suggestion[] {
  // names, also inside words such as BM or ABC
  const ns = [...sNorm.matchAll(/(?<![A-Za-z'])(?:[A-Z]'?)+(?![A-Za-z])/g)].flatMap((m) => m[0].match(/[A-Z]'?/g) ?? []);
  const u = [...new Set(ns)];
  const out: Suggestion[] = [];
  const add = (label: string, text: string) => out.length < 4 && !out.some((x) => x.text === text) && out.push({ label, text });
  if (/trung diem/.test(sNorm) && u.length >= 3) add(`${u[0]} là trung điểm ${u[1]}${u[2]}`, `Gọi ${u[0]} là trung điểm của ${u[1]}${u[2]}`);
  if (/vuong goc/.test(sNorm) && u.length >= 4) add(`${u[0]}${u[1]} ⊥ ${u[2]}${u[3]}`, `Kẻ ${u[0]}${u[1]} vuông góc với ${u[2]}${u[3]} tại ${u[1]}`);
  if (/vuong goc/.test(sNorm) && u.length === 3) add(`Từ ${u[0]} hạ vuông góc xuống ${u[1]}${u[2]}`, `Kẻ ${u[0]}H vuông góc với ${u[1]}${u[2]} tại H`);
  if (/song song/.test(sNorm) && u.length >= 3) add(`Qua ${u[0]} kẻ song song với ${u[1]}${u[2]}`, `Qua ${u[0]} kẻ đường thẳng song song với ${u[1]}${u[2]}`);
  if (/(giao|cat)/.test(sNorm) && u.length >= 5) add(`${u[4]} = giao điểm ${u[0]}${u[1]} và ${u[2]}${u[3]}`, `Gọi ${u[4]} là giao điểm của ${u[0]}${u[1]} và ${u[2]}${u[3]}`);
  if (/(thuoc|tren|nam giua)/.test(sNorm) && u.length >= 3) add(`${u[0]} nằm trên ${u[1]}${u[2]}`, `Lấy điểm ${u[0]} thuộc đoạn ${u[1]}${u[2]}`);
  if (/duong tron/.test(sNorm) && u.length >= 1) add(`Đường tròn tâm ${u[0]}`, `Vẽ đường tròn (${u[0]}; 2 cm)`);
  if (/phan giac/.test(sNorm) && u.length >= 1) add(`Phân giác góc ${u[0]}`, `Kẻ tia phân giác của góc ${u[0]}`);
  if (u.length === 2) {
    add(`Đoạn thẳng ${u[0]}${u[1]}`, `Nối ${u[0]}${u[1]}`);
    add(`Đường thẳng ${u[0]}${u[1]}`, `Vẽ đường thẳng ${u[0]}${u[1]}`);
    add(`Tia ${u[0]}${u[1]}`, `Vẽ tia ${u[0]}${u[1]}`);
  }
  if (u.length === 3 && !out.length) add(`Tam giác ${u.join('')}`, `Cho tam giác ${u.join('')}`);
  if (u.length === 4 && !out.length) {
    add(`Đoạn ${u[0]}${u[1]} và ${u[2]}${u[3]}`, `Nối ${u[0]}${u[1]}, ${u[2]}${u[3]}`);
    add(`Tứ giác ${u.join('')}`, `Vẽ tứ giác ${u.join('')}`);
  }
  void clause;
  return out;
}

/** A taught wording applied to a normalised sentence: names become {1}, {2}… */
function applyPhrases(t: string, phrases: UserPhrase[]): string {
  let out = t;
  for (const p of phrases) {
    const src = p.from.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(\d)\\?\}/g, "([A-Z]'?)");
    const rx = new RegExp(src, 'g');
    out = out.replace(rx, (...args) => p.to.replace(/\{(\d)\}/g, (_, i: string) => String(args[Number(i)] ?? '')));
  }
  return out;
}

/** The normalised pattern of a clause, names replaced by {1}, {2}… (to teach it). */
export function phraseOf(clause: string): { from: string; names: string[] } {
  const t = normalize(clause);
  const ns: string[] = [];
  // every name, also inside BM or ABC, becomes {1}, {2}…
  const from = t.replace(/(?<![A-Za-z'])(?:[A-Z]'?)+(?![A-Za-z])/g, (tok) =>
    (tok.match(/[A-Z]'?/g) ?? []).map((n) => {
      let i = ns.indexOf(n);
      if (i < 0) i = ns.push(n) - 1;
      return `{${i + 1}}`;
    }).join(''),
  );
  return { from, names: ns };
}

/**
 * Teaches a wording: `clause` (as the user wrote it) means `replacement` (a phrase the parser
 * knows). Names become {1}, {2}… in the order of the clause, so the rule works for any names.
 */
export function teachPhrase(clause: string, replacement: string): UserPhrase {
  const { from, names: ns } = phraseOf(clause);
  const to = normalize(replacement).replace(/(?<![A-Za-z'])(?:[A-Z]'?)+(?![A-Za-z])/g, (tok) =>
    (tok.match(/[A-Z]'?/g) ?? []).map((n) => {
      const i = ns.indexOf(n);
      return i < 0 ? n : `{${i + 1}}`;
    }).join(''),
  );
  return { from, to };
}

/* ----------------------------------------------------------------- driver */

const INTENTS = [...measureIntents(), ...shapeIntents(), ...elementIntents()].sort((a, b) => a.rank - b.rank);

/** Builds the figure described by `text`. */
export function figureFromText(text: string, opts: ParseOptions = {}): TextFigure {
  const scene = new Scene();
  const done: string[] = [];
  const missed: string[] = [];
  const reports: SentenceReport[] = [];

  interface Item { intent: Intent; m: RegExpMatchArray; sentence: number }
  const items: Item[] = [];
  /** per sentence: normalised text, clause ranges, claimed ranges */
  const sents: { t: string; clauses: { a: number; b: number; text: string }[]; claimed: [number, number][]; data: [number, number][] }[] = [];

  splitSentences(text).forEach((sentence, si) => {
    const rep: SentenceReport = { text: sentence, status: 'none', done: [], errors: [], clauses: [] };
    reports.push(rep);
    const clauses = splitClauses(sentence);
    let t = '';
    const ranges: { a: number; b: number; text: string }[] = [];
    for (const c of clauses) {
      const n = normalize(c.text);
      const a = t.length;
      t += n;
      ranges.push({ a, b: t.length, text: c.text.trim().replace(/[.;:]+$/, '') });
      if (c.sep) t += `${c.sep} `;
    }
    t = applyPhrases(t, opts.phrases ?? []);
    sents.push({ t, clauses: ranges, claimed: [], data: [] });
    if (opts.off?.includes(si)) {
      rep.status = 'off';
      return;
    }
    if (QUESTION.test(t) || ASKS.test(t) || !(GEO.test(t) || namesIn(t).length)) {
      rep.status = 'skip';
      return;
    }
    // every intent proposes its matches; the longest (most specific) reading of each part wins
    const claimed = sents[si].claimed;
    const found: { intent: Intent; m: RegExpMatchArray; a: number; b: number }[] = [];
    for (const intent of INTENTS) {
      intent.re.lastIndex = 0;
      for (const m of t.matchAll(intent.re)) {
        const a = m.index ?? 0;
        const b = a + m[0].length;
        if (!m[0].trim()) continue;
        if (intent.data) {
          sents[si].data.push([a, b]);
          items.push({ intent, m, sentence: si });
          continue;
        }
        found.push({ intent, m, a, b });
      }
    }
    found.sort((p, q) => q.b - q.a - (p.b - p.a) || p.intent.rank - q.intent.rank);
    const chosen: typeof found = [];
    for (const f of found) {
      if (claimed.some(([x, y]) => f.a < y && f.b > x)) continue;
      claimed.push([f.a, f.b]);
      chosen.push(f);
    }
    // run order inside a sentence: by rank, then as written
    chosen.sort((p, q) => p.intent.rank - q.intent.rank || p.a - q.a);
    for (const f of chosen) items.push({ intent: f.intent, m: f.m, sentence: si });
  });

  // run in rank order, waiting for the names an intent needs
  let pending = items.slice();
  const run = (it: Item) => {
    try {
      const r = it.intent.run(it.m, scene);
      const list = r === null ? [] : Array.isArray(r) ? r : [r];
      reports[it.sentence].done.push(...list);
      done.push(...list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reports[it.sentence].errors.push(`${it.m[0]}: ${msg}`);
    }
  };
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    const next: Item[] = [];
    for (const it of pending) {
      const needs = it.intent.needs?.(it.m, scene) ?? [];
      if (needs.every((n) => n !== '?' && scene.has(n))) run(it);
      else next.push(it);
    }
    if (next.length === pending.length) {
      // nothing could run: create the missing names that are plain points, then try once more
      for (const it of next) {
        const needs = it.intent.needs?.(it.m, scene) ?? [];
        if (needs.includes('?')) continue;
        for (const n of needs) if (!scene.has(n)) {
          const o = scene.freeSpot();
          scene.point(n, { x: o.x, y: o.y + 1.5 });
          reports[it.sentence].done.push(`(điểm ${n} chưa được cho, đã đặt tạm)`);
        }
      }
      const again: Item[] = [];
      for (const it of next) {
        const needs = it.intent.needs?.(it.m, scene) ?? [];
        if (needs.every((n) => n !== '?' && scene.has(n))) run(it);
        else again.push(it);
      }
      for (const it of again) reports[it.sentence].errors.push(`${it.m[0]}: thiếu hình để dựng (chưa có tam giác / đường tròn)`);
      pending = [];
    } else pending = next;
  }

  // only questions ("Tính diện tích hình thang cân ABCD…"): draw the shape they talk about
  if (!scene.fig.c.objects.some((o) => !o.style.hidden)) {
    sents.forEach((st, si) => {
      if (reports[si].status !== 'skip') return;
      for (const intent of INTENTS.filter((x) => ['quadrilateral', 'regular polygon', 'circle (O; R)', 'solid'].includes(x.name))) {
        intent.re.lastIndex = 0;
        const m = intent.re.exec(st.t);
        if (!m) continue;
        try {
          const r = intent.run(m, scene);
          if (r) reports[si].done.push(...(Array.isArray(r) ? r : [r]));
        } catch {
          /* nothing to draw */
        }
        break;
      }
    });
  }

  hypothesisMarks(scene);

  // the given lengths, written on the figure (once, where the side is drawn)
  for (const [a, b, text] of scene.showLengths) {
    if (!scene.has(a) || !scene.has(b)) continue;
    const ia = scene.id(a);
    const ib = scene.id(b);
    const already = scene.fig.c.objects.some((o) => o.def.t === 'segment' && o.style.label === text && [o.def.a, o.def.b].sort().join() === [ia, ib].sort().join());
    if (!already) scene.fig.seg(a, b, { label: text, showLabel: true });
  }

  // report the sentences: a clause is understood when its names are inside a recognised part
  reports.forEach((rep, si) => {
    if (rep.status === 'skip' || rep.status === 'off') return;
    const { t, clauses } = sents[si];
    const claimed = [...sents[si].claimed, ...sents[si].data];
    for (const c of clauses) {
      const piece = t.slice(c.a, c.b);
      const ns = namesIn(piece).map((x) => x.i + c.a);
      const meaningful = ns.length > 0 || GEO.test(piece);
      if (!meaningful) continue;
      const covered = ns.length
        ? ns.every((i) => claimed.some(([x, y]) => i >= x && i < y))
        : claimed.some(([x, y]) => x < c.b && y > c.a);
      rep.clauses.push({ text: c.text, ok: covered, suggestions: covered ? [] : suggest(c.text, piece) });
    }
    const okCount = rep.clauses.filter((c) => c.ok).length;
    rep.status = rep.errors.length && !rep.done.length ? 'none' : okCount === rep.clauses.length && !rep.errors.length ? 'ok' : okCount || rep.done.length ? 'partial' : 'none';
    for (const c of rep.clauses) if (!c.ok) missed.push(c.text);
    missed.push(...rep.errors);
  });

  if (!scene.fig.c.objects.some((o) => !o.style.hidden)) {
    const first = reports.find((r) => r.errors.length)?.errors[0];
    throw new Error(first ? `Không vẽ được: ${first}` : 'Chưa nhận ra hình nào. Hãy bắt đầu bằng "Cho tam giác ABC…", "Cho hình vuông ABCD…", "Cho đường tròn (O; 3 cm)…" hoặc "Một mảnh vườn hình chữ nhật có chiều dài…".');
  }

  // sizes in metres: draw to a sheet size (the lengths written stay the real ones)
  let c = scene.fig.c;
  if (scene.coords) c = { ...c, axes: true, grid: true };
  const b = drawingBounds(c, computeAll(c));
  if (b && !scene.coords) {
    const size = Math.max(b.xmax - b.xmin, b.ymax - b.ymin);
    const k = size > 14 ? 10 / size : size > 0 && size < 2 ? 4 / size : 1;
    if (k !== 1) c = transformObjects(c, c.objects.map((o) => o.id), { scale: k }, { x: b.xmin, y: b.ymin });
  }
  return { construction: c, done, missed, sentences: reports };
}
