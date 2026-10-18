/**
 * Construction -> SVG. One renderer for the editor canvas (with selection
 * highlights) and for the exported figure (cropped to the drawing, with the
 * construction embedded as metadata so the picture can be edited again).
 */
import { add, cross, dist, distanceTo, dot, len, mul, norm, perp, sub, unit, type Value, type Values, type Vec } from './engine';
import { dependencies, isPointDef, type AngleFormat, type Construction, type GeoObject, type StylePreset } from './model';

export const PX_PER_CM = 96 / 2.54;

export interface Viewport {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export interface RenderOptions {
  mode: 'edit' | 'export';
  /** Editor: the visible world rectangle. Export: ignored (fitted to the drawing). */
  view: Viewport;
  /** Screen pixels per world unit (editor zoom); export uses real centimetres. */
  scale: number;
  selected?: Set<string>;
  hovered?: string | null;
  /** Objects the current tool step can use: drawn with a soft pulsing glow. */
  candidates?: Set<string>;
  /** Objects being built by the current tool (drawn dashed / light). */
  preview?: GeoObject[];
  previewValues?: Values;
}

interface Theme {
  stroke: string;
  point: string;
  pointRadius: number;
  width: number;
  fill: string;
  fillOpacity: number;
  label: string;
  font: string;
  fontSize: number;
  axis: string;
  grid: string;
}

const THEMES: Record<StylePreset, Theme> = {
  // Vietnamese textbook: black hairlines, small dots, italic Times labels, no fills.
  vn: {
    stroke: '#111111', point: '#111111', pointRadius: 2.2, width: 1.3, fill: 'none', fillOpacity: 0,
    label: '#111111', font: "'Times New Roman', Times, serif", fontSize: 15, axis: '#333333', grid: '#e3e6ea',
  },
  // International (Cambridge / IB style): calm colours, light fills.
  intl: {
    stroke: '#1d4f91', point: '#c0392b', pointRadius: 2.8, width: 1.5, fill: '#1d4f91', fillOpacity: 0.07,
    label: '#1f2937', font: "'Times New Roman', Times, serif", fontSize: 15, axis: '#4b5563', grid: '#e5e7eb',
  },
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

/** An angle size in the chosen format: 60°, 46°51′ or 46,9°. */
export function formatAngle(deg: number, format: AngleFormat, preset: StylePreset): string {
  if (format === 'int') return `${Math.round(deg)}°`;
  if (format === 'decimal') return `${formatMeasure(deg, 1, preset)}°`;
  let d = Math.floor(deg);
  let m = Math.round((deg - d) * 60);
  if (m === 60) {
    d++;
    m = 0;
  }
  return m ? `${d}°${m}′` : `${d}°`;
}

/** A displayed measure: rounded, with a decimal comma in the Vietnamese style. */
export function formatMeasure(n: number, digits: number, preset: StylePreset): string {
  const k = 10 ** digits;
  const s = (Math.round(n * k) / k).toString();
  return preset === 'vn' ? s.replace('.', ',') : s;
}

/** Area of a simple polygon (shoelace formula). */
export function polygonArea(pts: Vec[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Perimeter of a polygon. */
export function polygonPerimeter(pts: Vec[]): number {
  return pts.reduce((acc, p, i) => acc + dist(p, pts[(i + 1) % pts.length]), 0);
}

/** A name (α, x, A′…) is set in italics; a number like 60° or a word is not. */
function isName(s: string): boolean {
  return /^[A-Za-zΑ-ω]['′]*\d*$/.test(s);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Clips the infinite line through `a` with direction `d` (or a ray if `ray`) to a rectangle. */
function clipLine(a: Vec, d: Vec, box: Viewport, ray: boolean): [Vec, Vec] | null {
  let t0 = ray ? 0 : -Infinity;
  let t1 = Infinity;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-d.x, a.x - box.xmin) || !clip(d.x, box.xmax - a.x) || !clip(-d.y, a.y - box.ymin) || !clip(d.y, box.ymax - a.y)) return null;
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return null;
  return [add(a, mul(d, t0)), add(a, mul(d, t1))];
}

/** How far a textbook line runs past its outermost point (cm). */
const OVERSHOOT = 0.7;

/**
 * Parameters [t0, t1] (cm along v.d from v.a) of the part of a line / ray that is drawn
 * when its extent is 'auto': from just before its first point to just past its last one.
 * The points counted are the visible points lying on it and the points it is built from
 * (the vertex of a bisector, where a perpendicular meets its base, a tangent's contact…).
 * A ray ending at a dotless point (Ox) stops at that point, where its letter goes.
 */
export function autoSpan(o: GeoObject, v: Extract<Value, { k: 'straight' }>, c: Construction, values: Values): [number, number] {
  const ts: { t: number; tip: boolean }[] = [];
  const at = (p: Vec, tip = false) => {
    const w = sub(p, v.a);
    if (Math.abs(cross(w, v.d)) < 1e-6 * (1 + len(w))) ts.push({ t: dot(w, v.d), tip });
  };
  for (const q of c.objects) {
    const val = values.get(q.id);
    if (val?.k === 'point' && !q.style.hidden) at(val.p, q.style.dot === false);
  }
  for (const id of dependencies(o.def)) {
    const dep = values.get(id);
    if (!dep) continue;
    if (dep.k === 'point') at(dep.p);
    else if (dep.k === 'straight') {
      const den = cross(v.d, dep.d);
      if (Math.abs(den) > 1e-9) ts.push({ t: cross(sub(dep.a, v.a), dep.d) / den, tip: false });
      else {
        // parallel: run alongside the base line
        ts.push({ t: dot(sub(dep.a, v.a), v.d), tip: false }, { t: dot(sub(dep.b, v.a), v.d), tip: false });
      }
    } else if (dep.k === 'circle' || dep.k === 'arc') ts.push({ t: dot(sub(dep.c, v.a), v.d), tip: false });
  }
  if (v.kind === 'ray') ts.push({ t: 0, tip: false });
  if (o.def.t === 'perpBisector') {
    // centred on the midpoint, a little longer than the segment
    const h = dist(v.a, v.b) * 0.6;
    ts.push({ t: -h, tip: false }, { t: h, tip: false });
  }
  if (!ts.length) ts.push({ t: 0, tip: false }, { t: dist(v.a, v.b), tip: false });
  const valid = v.kind === 'ray' ? ts.filter((x) => x.t >= -1e-9) : ts;
  let lo = Math.min(...valid.map((x) => x.t));
  let hi = Math.max(...valid.map((x) => x.t));
  const hiTip = valid.some((x) => x.tip && Math.abs(x.t - hi) < 1e-9);
  const loTip = valid.some((x) => x.tip && Math.abs(x.t - lo) < 1e-9);
  if (v.kind === 'ray') {
    lo = 0;
    if (!hiTip) hi += OVERSHOOT;
    hi = Math.max(hi, 1.5);
  } else {
    if (!loTip) lo -= OVERSHOOT;
    if (!hiTip) hi += OVERSHOOT;
    if (hi - lo < 3) {
      const m = (hi + lo) / 2;
      lo = m - 1.5;
      hi = m + 1.5;
    }
  }
  return [lo, hi];
}

/** End points of the drawn part of a straight object (segments and vectors: their ends). */
export function drawnSpan(o: GeoObject, v: Extract<Value, { k: 'straight' }>, c: Construction, values: Values, view: Viewport | null): [Vec, Vec] | null {
  if (v.kind === 'segment' || v.kind === 'vector') return [v.a, v.b];
  const ext = o.style.extent ?? 'auto';
  if (ext === 'full') return view ? clipLine(v.a, v.d, view, v.kind === 'ray') : null;
  let [t0, t1] = ext === 'auto' ? autoSpan(o, v, c, values) : ext;
  if (v.kind === 'ray') t0 = Math.max(0, t0);
  if (t1 - t0 < 1e-6) return null;
  return [add(v.a, mul(v.d, t0)), add(v.a, mul(v.d, t1))];
}

/** Distance from p to the drawn part of an object (lines and rays as drawn, not infinite). */
export function distanceToDrawn(o: GeoObject, v: Value, c: Construction, values: Values, view: Viewport, p: Vec): number {
  if (v.k !== 'straight' || v.kind === 'segment' || v.kind === 'vector') return distanceTo(v, p);
  const s = drawnSpan(o, v, c, values, view);
  if (!s) return Infinity;
  const L = dist(s[0], s[1]);
  const u = unit(sub(s[1], s[0]));
  const t = Math.max(0, Math.min(L, dot(sub(p, s[0]), u)));
  return dist(p, add(s[0], mul(u, t)));
}

/** Bounding box of everything finite that is visible (used to crop the exported figure). */
export function drawingBounds(c: Construction, values: Values): Viewport | null {
  let b: Viewport | null = null;
  const grow = (p: Vec, r = 0) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    b = b
      ? { xmin: Math.min(b.xmin, p.x - r), xmax: Math.max(b.xmax, p.x + r), ymin: Math.min(b.ymin, p.y - r), ymax: Math.max(b.ymax, p.y + r) }
      : { xmin: p.x - r, xmax: p.x + r, ymin: p.y - r, ymax: p.y + r };
  };
  for (const o of c.objects) {
    const v = values.get(o.id);
    if (!v || o.style.hidden) continue;
    switch (v.k) {
      case 'point':
      case 'text':
        grow(v.p);
        break;
      case 'straight': {
        const s = drawnSpan(o, v, c, values, null);
        if (s) s.forEach((p) => grow(p));
        break;
      }
      case 'circle':
        grow(v.c, v.r);
        break;
      case 'arc':
        grow(v.c);
        for (let i = 0; i <= 16; i++) {
          const a = v.a0 + (norm(v.a1 - v.a0) * i) / 16;
          grow(add(v.c, { x: v.r * Math.cos(a), y: v.r * Math.sin(a) }));
        }
        break;
      case 'polygon':
        v.pts.forEach((p) => grow(p));
        break;
      case 'angle':
        grow(v.v, 0.5);
        break;
      case 'fraction':
        v.parts.forEach((pp) => pp.forEach((q) => grow(q)));
        break;
      case 'numberLine':
        grow({ x: v.o.x - 0.3, y: v.o.y - 0.7 });
        grow({ x: v.o.x + ((v.to - v.from) / v.step) * v.unit + 0.8, y: v.o.y + 0.4 });
        break;
      case 'solid':
        v.verts.forEach((q) => grow(q));
        v.ellipses.forEach((e) => {
          grow({ x: e.c.x - e.rx, y: e.c.y - e.ry });
          grow({ x: e.c.x + e.rx, y: e.c.y + e.ry });
        });
        v.circles.forEach((ci) => grow(ci.c, ci.r));
        break;
      default:
        break;
    }
  }
  return b;
}

/** Display label of an object: its own label, else the id for points. */
export function labelOf(o: GeoObject): string {
  return o.style.label ?? (isPointDef(o.def) ? o.id : '');
}

/** "A1" -> A with subscript 1; primes stay inline. */
/**
 * Splits a label into normal / subscript / superscript runs:
 * "A1" and "A_1" → A₁, "A_{12}" → A₁₂, "x^2" → x², "A'" → A′.
 */
export function labelRuns(text: string): { s: string; pos: 'base' | 'sub' | 'sup' }[] {
  const t = text.replace(/'/g, '′');
  if (!/[_^]/.test(t)) {
    const m = /^([^\d]+?)(\d+)$/.exec(t);
    return m ? [{ s: m[1], pos: 'base' }, { s: m[2], pos: 'sub' }] : [{ s: t, pos: 'base' }];
  }
  const runs: { s: string; pos: 'base' | 'sub' | 'sup' }[] = [];
  let i = 0;
  let base = '';
  while (i < t.length) {
    const ch = t[i];
    if (ch === '_' || ch === '^') {
      if (base) runs.push({ s: base, pos: 'base' });
      base = '';
      let arg: string;
      if (t[i + 1] === '{') {
        const end = t.indexOf('}', i + 2);
        arg = end < 0 ? t.slice(i + 2) : t.slice(i + 2, end);
        i = end < 0 ? t.length : end + 1;
      } else {
        arg = t[i + 1] ?? '';
        i += 2;
      }
      if (arg) runs.push({ s: arg, pos: ch === '_' ? 'sub' : 'sup' });
    } else {
      base += ch;
      i++;
    }
  }
  if (base) runs.push({ s: base, pos: 'base' });
  return runs;
}

const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** A label as plain text with Unicode sub/superscripts (A_1 → A₁), for lists and menus. */
export function plainLabel(text: string): string {
  return labelRuns(text)
    .map((r) => (r.pos === 'base' ? r.s : [...r.s].map((ch) => (r.pos === 'sub' ? SUB : SUP)[ch] ?? ch).join('')))
    .join('');
}

/** Approximate width of a label in px (for placing it and keeping labels apart). */
export function labelWidth(text: string, size: number): number {
  // Times italic: capitals are wide (M, W widest), small letters and digits about half an em.
  const em = (ch: string) => (/[MW]/.test(ch) ? 0.9 : /[A-Z]/.test(ch) ? 0.72 : 0.5);
  return labelRuns(text).reduce((w, r) => w + [...r.s].reduce((a, ch) => a + em(ch), 0) * size * (r.pos === 'base' ? 1 : 0.7), 0);
}

function labelSvg(text: string, x: number, y: number, theme: Theme, size: number, color: string, attrs = ''): string {
  // names (A, d, x′, α) in italics; measures such as "15 m" or "3 cm" upright
  const upright = /\d/.test(text.replace(/_\{?\d+\}?|\^\{?\d+\}?/g, '').replace(/^[A-Za-z]+\d+$/, ''));
  const style = `font-family:${theme.font};font-style:${upright ? 'normal' : 'italic'};font-size:${fmt(size)}px;fill:${color}`;
  let level = 0; // current baseline shift, in px
  const body = labelRuns(text)
    .map((r) => {
      const target = r.pos === 'sub' ? size * 0.3 : r.pos === 'sup' ? -size * 0.4 : 0;
      const dy = target - level;
      level = target;
      const small = r.pos === 'base' ? '' : ` style="font-size:${fmt(size * 0.7)}px${/^\d+$/.test(r.s) ? ';font-style:normal' : ''}"`;
      return dy || small ? `<tspan${dy ? ` dy="${fmt(dy)}"` : ''}${small}>${esc(r.s)}</tspan>` : esc(r.s);
    })
    .join('');
  return `<text x="${fmt(x)}" y="${fmt(y)}"${attrs} style="${style}">${body}</text>`;
}

export interface RenderedFigure {
  svg: string;
  /** Size of the figure in centimetres (export) or pixels (edit). */
  width: number;
  height: number;
}

export function renderConstruction(c: Construction, values: Values, opts: RenderOptions): RenderedFigure {
  const theme = THEMES[c.preset];
  const exporting = opts.mode === 'export';
  let view = opts.view;
  let scale = opts.scale;
  if (exporting) {
    const b = drawingBounds(c, values) ?? opts.view;
    const pad = 0.8; // room for labels placed outward from the figure
    view = { xmin: b.xmin - pad, xmax: b.xmax + pad, ymin: b.ymin - pad, ymax: b.ymax + pad };
    scale = PX_PER_CM * (c.exportScale ?? 1);
  }
  const W = (view.xmax - view.xmin) * scale;
  const H = (view.ymax - view.ymin) * scale;
  const X = (p: Vec) => (p.x - view.xmin) * scale;
  const Y = (p: Vec) => (view.ymax - p.y) * scale;
  const out: string[] = [];
  const labels: string[] = [];
  const points: string[] = [];

  // Point labels go outward, away from the centre of the figure (textbook placement).
  const pointValues = c.objects.map((o) => values.get(o.id)).filter((v): v is Extract<Value, { k: 'point' }> => v?.k === 'point');
  const centre = pointValues.length
    ? mul(pointValues.reduce((acc, v) => add(acc, v.p), { x: 0, y: 0 }), 1 / pointValues.length)
    : { x: 0, y: 0 };
  /** Offset of a label placed in screen direction u from its point, outside the dot. */
  const offsetToward = (u: Vec, size: number, text: string): Vec => {
    const r = 11;
    const w = labelWidth(text, size);
    return { x: u.x * r - w / 2 + u.x * (w / 2), y: u.y * r + size * 0.35 + u.y * size * 0.25 };
  };
  /** Preferred direction of a point label: away from the centre of the figure. */
  const outward = (p: Vec): Vec => {
    const d = { x: p.x - centre.x, y: p.y - centre.y };
    return Math.hypot(d.x, d.y) < 1e-6 ? unit({ x: 1, y: -1.2 }) : unit({ x: d.x, y: -d.y });
  };
  // Point labels already placed (screen boxes) and all dots, so labels don't sit on each other.
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const labelBoxes: Box[] = [];
  const dots = pointValues.map((v) => ({ x: X(v.p), y: Y(v.p) }));
  const boxAt = (x: number, y: number, text: string, size: number): Box => ({ x0: x, y0: y - size * 0.8, x1: x + labelWidth(text, size), y1: y + size * 0.2 });
  const clash = (b: Box, own: Vec) =>
    labelBoxes.some((q) => b.x0 < q.x1 + 2 && b.x1 > q.x0 - 2 && b.y0 < q.y1 + 2 && b.y1 > q.y0 - 2) ||
    dots.some((d) => Math.hypot(d.x - own.x, d.y - own.y) > 0.5 && d.x > b.x0 - 3 && d.x < b.x1 + 3 && d.y > b.y0 - 3 && d.y < b.y1 + 3);
  /** First direction (preferred, then turning away from it) whose label box is free. */
  const placeLabel = (pScreen: Vec, prefer: Vec, text: string, size: number): Vec => {
    const base = Math.atan2(prefer.y, prefer.x);
    for (const turn of [0, 45, -45, 90, -90, 135, -135, 180]) {
      const a = base + (turn * Math.PI) / 180;
      const off = offsetToward({ x: Math.cos(a), y: Math.sin(a) }, size, text);
      const b = boxAt(pScreen.x + off.x, pScreen.y + off.y, text, size);
      if (!clash(b, pScreen)) {
        labelBoxes.push(b);
        return off;
      }
    }
    const off = offsetToward(prefer, size, text);
    labelBoxes.push(boxAt(pScreen.x + off.x, pScreen.y + off.y, text, size));
    return off;
  };

  /* ---- grid & axes ---- */
  if (c.grid) {
    const g: string[] = [];
    for (let x = Math.ceil(view.xmin); x <= view.xmax; x++) g.push(`M${fmt(X({ x, y: 0 }))} 0V${fmt(H)}`);
    for (let y = Math.ceil(view.ymin); y <= view.ymax; y++) g.push(`M0 ${fmt(Y({ x: 0, y }))}H${fmt(W)}`);
    out.push(`<path d="${g.join('')}" stroke="${theme.grid}" stroke-width="0.8" fill="none"/>`);
  }
  if (c.axes) {
    const ax: string[] = [];
    const y0 = Y({ x: 0, y: 0 });
    const x0 = X({ x: 0, y: 0 });
    if (y0 >= 0 && y0 <= H) ax.push(`<path d="M0 ${fmt(y0)}H${fmt(W - 2)}M${fmt(W - 9)} ${fmt(y0 - 4)}L${fmt(W - 1)} ${fmt(y0)}L${fmt(W - 9)} ${fmt(y0 + 4)}" stroke="${theme.axis}" stroke-width="1" fill="none"/>`);
    if (x0 >= 0 && x0 <= W) ax.push(`<path d="M${fmt(x0)} ${fmt(H)}V2M${fmt(x0 - 4)} 9L${fmt(x0)} 1L${fmt(x0 + 4)} 9" stroke="${theme.axis}" stroke-width="1" fill="none"/>`);
    const small = `font-family:${theme.font};font-size:${fmt(theme.fontSize * 0.75)}px;fill:${theme.axis}`;
    for (let x = Math.ceil(view.xmin); x <= view.xmax - 0.5; x++) {
      if (x === 0 || y0 < 0 || y0 > H) continue;
      ax.push(`<path d="M${fmt(X({ x, y: 0 }))} ${fmt(y0 - 3)}v6" stroke="${theme.axis}" stroke-width="1"/>`);
      ax.push(`<text x="${fmt(X({ x, y: 0 }) - 3)}" y="${fmt(y0 + 14)}" style="${small}">${x}</text>`);
    }
    for (let y = Math.ceil(view.ymin); y <= view.ymax - 0.5; y++) {
      if (y === 0 || x0 < 0 || x0 > W) continue;
      ax.push(`<path d="M${fmt(x0 - 3)} ${fmt(Y({ x: 0, y }))}h6" stroke="${theme.axis}" stroke-width="1"/>`);
      ax.push(`<text x="${fmt(x0 - 14)}" y="${fmt(Y({ x: 0, y }) + 4)}" style="${small}">${y}</text>`);
    }
    if (x0 >= 0 && x0 <= W && y0 >= 0 && y0 <= H) ax.push(`<text x="${fmt(x0 - 12)}" y="${fmt(y0 + 14)}" style="${small};font-style:italic">O</text>`);
    ax.push(`<text x="${fmt(W - 10)}" y="${fmt(y0 - 7)}" style="${small};font-style:italic">x</text>`);
    ax.push(`<text x="${fmt(x0 + 6)}" y="11" style="${small};font-style:italic">y</text>`);
    out.push(ax.join(''));
  }

  // Angles sharing a vertex are drawn with growing radii so their marks don't overlap.
  // Only angles whose sectors overlap are pushed outward; adjacent ones (e.g. the two halves
  // cut by a bisector) keep the same radius so equal marks read as equal.
  const angleStack = new Map<string, number>();
  {
    const placed: { key: string; a0: number; span: number; level: number }[] = [];
    const inside = (x: number, a0: number, span: number) => {
      const t = norm(x - a0);
      return t > 1e-6 && t < span - 1e-6;
    };
    // Narrower angles first, so an angle containing others (xOy around its halves xOt, tOy)
    // is drawn outside them and its text clears their marks.
    const marks = c.objects
      .map((o) => ({ o, v: values.get(o.id) }))
      .filter((x): x is { o: GeoObject; v: Extract<Value, { k: 'angle' }> } => x.v?.k === 'angle' && !x.o.style.hidden)
      .sort((p, q) => norm(p.v.a1 - p.v.a0) - norm(q.v.a1 - q.v.a0));
    for (const { o, v } of marks) {
      const key = `${Math.round(v.v.x * 1e4)},${Math.round(v.v.y * 1e4)}`;
      const span = norm(v.a1 - v.a0);
      let level = 0;
      for (const q of placed) {
        if (q.key !== key) continue;
        const overlap =
          inside(v.a0 + span / 2, q.a0, q.span) || inside(q.a0 + q.span / 2, v.a0, span) ||
          (Math.abs(norm(v.a0 - q.a0)) < 1e-6 && Math.abs(span - q.span) < 1e-6);
        if (overlap) level = Math.max(level, q.level + 1);
      }
      placed.push({ key, a0: v.a0, span, level });
      angleStack.set(o.id, level);
    }
  }

  // Drawn parts of lines and rays; a dotless point at the end of one (the x of ray Ox)
  // gets its letter just beyond that end.
  const tipDir = new Map<string, Vec>();
  {
    const tips = c.objects.filter((o) => o.style.dot === false && !o.style.hidden);
    for (const o of c.objects) {
      const v = values.get(o.id);
      if (!tips.length || o.style.hidden || v?.k !== 'straight') continue;
      const span = drawnSpan(o, v, c, values, view);
      if (!span) continue;
      for (const q of tips) {
        const pv = values.get(q.id);
        if (pv?.k !== 'point') continue;
        for (const [end, other] of [[span[1], span[0]], [span[0], span[1]]]) {
          if (dist(pv.p, end) < 1e-6) {
            const u = unit(sub(end, other));
            tipDir.set(q.id, { x: u.x, y: -u.y });
          }
        }
      }
    }
  }

  /** Directions (world angles) of the drawn lines, rays, segments and polygon sides leaving a vertex. */
  const directionsAt = (p: Vec): number[] => {
    const out: number[] = [];
    const edge = (a: Vec, b: Vec) => {
      const L = dist(a, b);
      if (L < 1e-9) return;
      const u = unit(sub(b, a));
      const t = dot(sub(p, a), u);
      if (Math.abs(cross(sub(p, a), u)) > 1e-6 || t < -1e-6 || t > L + 1e-6) return;
      if (t > 1e-6) out.push(Math.atan2(-u.y, -u.x));
      if (t < L - 1e-6) out.push(Math.atan2(u.y, u.x));
    };
    for (const o of c.objects) {
      const v = values.get(o.id);
      if (!v || o.style.hidden) continue;
      if (v.k === 'straight') {
        const sp = drawnSpan(o, v, c, values, view);
        if (sp) edge(sp[0], sp[1]);
      } else if (v.k === 'polygon') v.pts.forEach((q, i) => edge(q, v.pts[(i + 1) % v.pts.length]));
    }
    return out;
  };

  // Question version: answer objects are left out of the figure, and greyed in the editor.
  const hideAnswers = c.answers === 'hide';

  const draw = (o: GeoObject, v: Value | null, ghost: boolean) => {
    if (!v || (o.style.hidden && !ghost)) return;
    if (hideAnswers && o.style.answer && exporting) return;
    const greyed = hideAnswers && !!o.style.answer;
    const s = o.style;
    const color = greyed ? '#c3cad2' : s.color ?? (v.k === 'point' ? theme.point : theme.stroke);
    const width = (s.width ?? theme.width) * (ghost ? 1 : 1);
    const dash = s.dash === 'dashed' ? ' stroke-dasharray="6 4"' : s.dash === 'dotted' ? ' stroke-dasharray="1.2 3" stroke-linecap="round"' : '';
    const stroke = `stroke="${ghost ? '#1a73e8' : color}" stroke-width="${fmt(width)}"${dash}${ghost ? ' stroke-opacity="0.7"' : ''}`;
    const fill = s.fill ?? (theme.fill !== 'none' ? theme.fill : 'none');
    const fillAttr = fill === 'none' ? 'fill="none"' : `fill="${fill}" fill-opacity="${fmt(s.fillOpacity ?? theme.fillOpacity)}"`;
    const highlight = !exporting && (opts.selected?.has(o.id) || opts.hovered === o.id);
    const cand = !exporting && !ghost && !highlight && !!opts.candidates?.has(o.id);
    const halo = (d: string) =>
      highlight
        ? `<path d="${d}" stroke="#1a73e8" stroke-opacity="${opts.selected?.has(o.id) ? 0.35 : 0.18}" stroke-width="${fmt(width + 7)}" fill="none" stroke-linecap="round"/>`
        : cand
          ? `<path d="${d}" class="geo-cand" stroke="#1a73e8" stroke-opacity="0.2" stroke-width="${fmt(width + 8)}" fill="none" stroke-linecap="round"/>`
          : '';
    const label = labelOf(o);
    const showLabel = label && (s.showLabel ?? (isPointDef(o.def) || v.k === 'point'));

    switch (v.k) {
      case 'point': {
        const x = X(v.p);
        const y = Y(v.p);
        const r = theme.pointRadius;
        if (highlight) points.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r + 5)}" fill="#1a73e8" fill-opacity="${opts.selected?.has(o.id) ? 0.3 : 0.15}"/>`);
        else if (cand) points.push(`<circle class="geo-cand" cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r + 6)}" fill="#1a73e8" fill-opacity="0.16"/>`);
        const free = o.def.t === 'point' || o.def.t === 'pointOn' || o.def.t === 'pointPolar';
        const ink = ghost ? '#1a73e8' : color;
        const rr = !exporting && free ? r + 1 : r;
        if (s.dot === false) {
          // No dot in the figure; a faint ring in the editor so the end can still be dragged.
          if (!exporting) points.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="3.2" fill="#ffffff" fill-opacity="0.01" stroke="#1a73e8" stroke-opacity="0.45" stroke-width="1"/>`);
        } else if (s.shape === 'hollow') {
          points.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(rr + 0.6)}" fill="#ffffff" stroke="${ink}" stroke-width="1.1"/>`);
        } else if (s.shape === 'cross') {
          const k = rr + 1.4;
          points.push(`<path d="M${fmt(x - k)} ${fmt(y - k)}L${fmt(x + k)} ${fmt(y + k)}M${fmt(x - k)} ${fmt(y + k)}L${fmt(x + k)} ${fmt(y - k)}" stroke="${ink}" stroke-width="1.3" stroke-linecap="round"/>`);
          if (!exporting) points.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(k)}" fill="#ffffff" fill-opacity="0.01"/>`);
        } else {
          // Free points get a slightly larger dot in the editor so they read as draggable.
          points.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(rr)}" fill="${ink}"/>`);
        }
        if (showLabel) {
          const tip = tipDir.get(o.id);
          const w = labelWidth(label, theme.fontSize);
          const fixed = s.labelDx !== undefined || s.labelDy !== undefined;
          const off = fixed
            ? { x: s.labelDx ?? 5, y: s.labelDy ?? -6 }
            : tip
              ? // beyond the end of the ray, slightly to its side
                { x: tip.x * 9 - w / 2 + -tip.y * 7, y: tip.y * 9 + theme.fontSize * 0.35 + tip.x * 7 }
              : placeLabel({ x, y }, outward(v.p), label, theme.fontSize);
          if (fixed || tip) labelBoxes.push(boxAt(x + off.x, y + off.y, label, theme.fontSize));
          // In the editor the label can be dragged; it remembers its offset from the point.
          const attrs = exporting || ghost ? '' : ` data-label-for="${esc(o.id)}" data-dx="${fmt(off.x)}" data-dy="${fmt(off.y)}" class="geo-label"`;
          labels.push(labelSvg(label, x + off.x, y + off.y, theme, theme.fontSize, theme.label, attrs));
        }
        break;
      }
      case 'straight': {
        const span = drawnSpan(o, v, c, ghost ? opts.previewValues ?? values : values, view);
        if (!span) return;
        const [a, b] = span;
        const d = `M${fmt(X(a))} ${fmt(Y(a))}L${fmt(X(b))} ${fmt(Y(b))}`;
        out.push(halo(d) + `<path d="${d}" ${stroke} fill="none"/>`);
        if (v.kind === 'vector') {
          const tip = { x: X(v.b), y: Y(v.b) };
          const dir = unit({ x: X(v.b) - X(v.a), y: Y(v.b) - Y(v.a) });
          const n = perp(dir);
          const back = sub(tip, mul(dir, 9));
          const p1 = add(back, mul(n, 3.6));
          const p2 = sub(back, mul(n, 3.6));
          out.push(`<path d="M${fmt(tip.x)} ${fmt(tip.y)}L${fmt(p1.x)} ${fmt(p1.y)}L${fmt(p2.x)} ${fmt(p2.y)}Z" fill="${ghost ? '#1a73e8' : color}"/>`);
        }
        if ((v.kind === 'segment' || v.kind === 'vector') && s.ticks) out.push(ticks(v.a, v.b, s.ticks, color));
        if (showLabel || s.showValue) {
          const segLike = v.kind === 'segment' || v.kind === 'vector';
          const A = { x: X(a), y: Y(a) };
          const B = { x: X(b), y: Y(b) };
          // Segments: name at the middle. Lines and rays: near the far end, as in textbooks (d, a, b…).
          const m = segLike ? mul(add(A, B), 0.5) : sub(B, mul(unit(sub(B, A)), 14));
          const n = perp(unit(sub(B, A)));
          const text = [showLabel ? label : '', s.showValue && v.kind !== 'line' && v.kind !== 'ray' ? formatMeasure(dist(v.a, v.b), 2, c.preset) : ''].filter(Boolean).join(' = ');
          labels.push(labelSvg(text, m.x + n.x * 12 - 4, m.y + n.y * 12 + 4, theme, theme.fontSize, theme.label));
        }
        break;
      }
      case 'circle': {
        const cx = X(v.c);
        const cy = Y(v.c);
        const r = v.r * scale;
        const d = `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0`;
        out.push(halo(d) + `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" ${stroke} ${fillAttr}/>`);
        if (showLabel) labels.push(labelSvg(label, cx + r * 0.72 + 4, cy - r * 0.72 - 4, theme, theme.fontSize, theme.label));
        if (s.showValue) {
          const text = `S = ${formatMeasure(Math.PI * v.r * v.r, 2, c.preset)} cm²`;
          labels.push(`<text x="${fmt(cx - labelWidth(text, theme.fontSize * 0.85) / 2)}" y="${fmt(cy + r * 0.45)}" style="font-family:${theme.font};font-size:${fmt(theme.fontSize * 0.85)}px;fill:${theme.label}">${esc(text)}</text>`);
        }
        break;
      }
      case 'arc': {
        const r = v.r * scale;
        const p0 = { x: X(add(v.c, { x: v.r * Math.cos(v.a0), y: v.r * Math.sin(v.a0) })), y: Y(add(v.c, { x: v.r * Math.cos(v.a0), y: v.r * Math.sin(v.a0) })) };
        const p1 = { x: X(add(v.c, { x: v.r * Math.cos(v.a1), y: v.r * Math.sin(v.a1) })), y: Y(add(v.c, { x: v.r * Math.cos(v.a1), y: v.r * Math.sin(v.a1) })) };
        const large = norm(v.a1 - v.a0) > Math.PI ? 1 : 0;
        // Screen y is flipped, so counter-clockwise in the world is sweep-flag 0.
        const arc = `M${fmt(p0.x)} ${fmt(p0.y)}A${fmt(r)} ${fmt(r)} 0 ${large} 0 ${fmt(p1.x)} ${fmt(p1.y)}`;
        const d = v.sector ? `M${fmt(X(v.c))} ${fmt(Y(v.c))}L${fmt(p0.x)} ${fmt(p0.y)}A${fmt(r)} ${fmt(r)} 0 ${large} 0 ${fmt(p1.x)} ${fmt(p1.y)}Z` : arc;
        out.push(halo(d) + `<path d="${d}" ${stroke} ${v.sector ? fillAttr : 'fill="none"'}/>`);
        break;
      }
      case 'polygon': {
        const d = v.pts.map((p, i) => `${i ? 'L' : 'M'}${fmt(X(p))} ${fmt(Y(p))}`).join('') + 'Z';
        out.push(halo(d) + `<path d="${d}" ${stroke} ${fillAttr} stroke-linejoin="round"/>`);
        if (s.showValue && v.pts.length >= 3) {
          const g = mul(v.pts.reduce((acc, p) => add(acc, p), { x: 0, y: 0 }), 1 / v.pts.length);
          const text = `S = ${formatMeasure(polygonArea(v.pts), 2, c.preset)} cm²`;
          labels.push(`<text x="${fmt(X(g) - labelWidth(text, theme.fontSize * 0.85) / 2)}" y="${fmt(Y(g) + 4)}" style="font-family:${theme.font};font-size:${fmt(theme.fontSize * 0.85)}px;fill:${theme.label}">${esc(text)}</text>`);
        }
        break;
      }
      case 'angle': {
        const vx = X(v.v);
        const vy = Y(v.v);
        const span = norm(v.a1 - v.a0);
        // Radius: fits inside the shorter side, and stacks outward when several angles share a vertex.
        const sidePx = v.side * scale;
        const base = Math.max(9, Math.min(17, sidePx * 0.35));
        const r0 = base + (angleStack.get(o.id) ?? 0) * 7;
        // 0 arcs: only the number or name (angles 1–4 at a crossing, as in textbooks)
        const arcs = Math.max(0, Math.min(3, s.arcs ?? 1));
        const right = Math.abs(v.deg - 90) < 0.05;
        const ink = ghost ? '#1a73e8' : color;
        const at = (r: number, a: number) => ({ x: vx + r * Math.cos(a), y: vy - r * Math.sin(a) });
        const parts: string[] = [];
        let fillPath = '';
        if (right) {
          const k = Math.max(7, r0 * 0.6);
          const p0 = at(k, v.a0);
          const p2 = at(k, v.a1);
          const p1 = { x: p0.x + (p2.x - vx), y: p0.y + (p2.y - vy) };
          parts.push(`M${fmt(p0.x)} ${fmt(p0.y)}L${fmt(p1.x)} ${fmt(p1.y)}L${fmt(p2.x)} ${fmt(p2.y)}`);
          fillPath = `M${fmt(vx)} ${fmt(vy)}L${fmt(p0.x)} ${fmt(p0.y)}L${fmt(p1.x)} ${fmt(p1.y)}L${fmt(p2.x)} ${fmt(p2.y)}Z`;
        } else {
          const large = span > Math.PI ? 1 : 0;
          for (let i = 0; i < arcs; i++) {
            const r = r0 + i * 3.2;
            const p0 = at(r, v.a0);
            const p1 = at(r, v.a1);
            parts.push(`M${fmt(p0.x)} ${fmt(p0.y)}A${fmt(r)} ${fmt(r)} 0 ${large} 0 ${fmt(p1.x)} ${fmt(p1.y)}`);
          }
          // Strokes across the arc mark equal angles (textbook style).
          const ticks = Math.max(0, Math.min(3, s.arcTicks ?? 0));
          const rOut = r0 + (arcs - 1) * 3.2;
          for (let i = 0; i < ticks; i++) {
            const a = v.a0 + span / 2 + (i - (ticks - 1) / 2) * (6 / Math.max(r0, 1));
            const p0 = at(r0 - 4, a);
            const p1 = at(rOut + 4, a);
            parts.push(`M${fmt(p0.x)} ${fmt(p0.y)}L${fmt(p1.x)} ${fmt(p1.y)}`);
          }
          const e0 = at(r0, v.a0);
          const e1 = at(r0, v.a1);
          fillPath = `M${fmt(vx)} ${fmt(vy)}L${fmt(e0.x)} ${fmt(e0.y)}A${fmt(r0)} ${fmt(r0)} 0 ${large} 0 ${fmt(e1.x)} ${fmt(e1.y)}Z`;
        }
        if (s.fill && s.fill !== 'none') out.push(`<path d="${fillPath}" fill="${s.fill}" fill-opacity="${fmt(s.fillOpacity ?? 0.25)}" stroke="none"/>`);
        const d = parts.join('');
        out.push(halo(d) + `<path d="${d}" stroke="${ink}" stroke-width="${fmt(Math.max(0.9, width * 0.8))}" fill="none"/>`);
        const text = s.showValue ? formatAngle(v.deg, c.angleFormat ?? 'int', c.preset) : showLabel ? label : '';
        if (text) {
          // On the bisector, unless another line through the vertex runs there (e.g. an altitude
          // inside the angle): then shift to whichever side is clearer.
          const others = directionsAt(v.v).filter((a) => norm(a - v.a0) > 0.05 && norm(v.a1 - a) > 0.05);
          const clearance = (a: number) => Math.min(Math.PI, ...others.map((b) => Math.min(norm(a - b), norm(b - a))));
          let mid = v.a0 + span / 2;
          if (others.length && clearance(mid) < 0.3) {
            const cands = [0.5, 0.3, 0.7, 0.2, 0.8].map((f) => v.a0 + span * f);
            mid = cands.reduce((best, a) => (clearance(a) > clearance(best) + 1e-9 ? a : best), mid);
          }
          const size = theme.fontSize * 0.85;
          let rr = arcs === 0 ? r0 * 0.75 + size * 0.35 : r0 + (arcs - 1) * 3.2 + 6 + size * 0.45;
          // Centre the text on the bisector, just outside the arc; move it out past point names.
          const w = labelWidth(text, size);
          const place = (r: number) => {
            const q = at(r, mid);
            return { x: q.x - w / 2 + Math.cos(mid) * w * 0.35, y: q.y + size * 0.35 - Math.sin(mid) * size * 0.2 };
          };
          let tp = place(rr);
          for (let k = 0; k < 4; k++) {
            const b = boxAt(tp.x, tp.y, text, size);
            if (!labelBoxes.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0)) break;
            rr += size * 0.55;
            tp = place(rr);
          }
          labelBoxes.push(boxAt(tp.x, tp.y, text, size));
          labels.push(
            `<text x="${fmt(tp.x)}" y="${fmt(tp.y)}" style="font-family:${theme.font};font-size:${fmt(size)}px;fill:${theme.label}${!s.showValue && isName(text) ? ';font-style:italic' : ''}">${esc(text)}</text>`,
          );
        }
        break;
      }
      case 'numberLine': {
        // axis with an arrow, a tick and a number at every step, marked numbers as dots
        const n = Math.round((v.to - v.from) / v.step);
        const x0 = X(v.o);
        const y0 = Y(v.o);
        const u = v.unit * scale;
        const xEnd = x0 + n * u + 0.6 * scale;
        const ink = color;
        const d = `M${fmt(x0 - 0.3 * scale)} ${fmt(y0)}H${fmt(xEnd)}`;
        out.push(halo(d) + `<path d="${d}" stroke="${ink}" stroke-width="${fmt(width)}" fill="none"/>`);
        out.push(`<path d="M${fmt(xEnd - 8)} ${fmt(y0 - 4)}L${fmt(xEnd)} ${fmt(y0)}L${fmt(xEnd - 8)} ${fmt(y0 + 4)}" stroke="${ink}" stroke-width="${fmt(width)}" fill="none"/>`);
        const ticks: string[] = [];
        const size = theme.fontSize * 0.85;
        for (let k = 0; k <= n; k++) {
          const x = x0 + k * u;
          ticks.push(`M${fmt(x)} ${fmt(y0 - 4)}V${fmt(y0 + 4)}`);
          const num = formatMeasure(v.from + k * v.step, 2, c.preset).replace('-', '−');
          labels.push(`<text x="${fmt(x - labelWidth(num, size) / 2)}" y="${fmt(y0 + 6 + size)}" style="font-family:${theme.font};font-size:${fmt(size)}px;fill:${theme.label}">${esc(num)}</text>`);
        }
        out.push(`<path d="${ticks.join('')}" stroke="${ink}" stroke-width="${fmt(width)}"/>`);
        for (const m of v.marks) {
          const x = x0 + ((m - v.from) / v.step) * u;
          points.push(`<circle cx="${fmt(x)}" cy="${fmt(y0)}" r="${fmt(theme.pointRadius + 1)}" fill="${greyed ? color : theme.point}"/>`);
        }
        break;
      }
      case 'solid': {
        // edges (hidden ones dashed) and horizontal circles drawn as ellipses
        const dash = ' stroke-dasharray="5 4"';
        const ink = ghost ? '#1a73e8' : color;
        const all: string[] = [];
        for (const e of v.edges) {
          const a = v.verts[e.a];
          const b = v.verts[e.b];
          const d = `M${fmt(X(a))} ${fmt(Y(a))}L${fmt(X(b))} ${fmt(Y(b))}`;
          all.push(d);
          out.push(`<path d="${d}" stroke="${ink}" stroke-width="${fmt(width)}"${e.hidden ? dash : ''} fill="none"/>`);
        }
        for (const el of v.ellipses) {
          const cx = X(el.c);
          const cy = Y(el.c);
          const rx = el.rx * scale;
          const ry = el.ry * scale;
          const L = `${fmt(cx - rx)} ${fmt(cy)}`;
          const R = `${fmt(cx + rx)} ${fmt(cy)}`;
          // front half (lower on screen) solid; back half dashed when hidden behind the solid
          const front = `M${L}A${fmt(rx)} ${fmt(ry)} 0 0 0 ${R}`;
          const back = `M${R}A${fmt(rx)} ${fmt(ry)} 0 0 0 ${L}`;
          all.push(front, back);
          out.push(`<path d="${front}" stroke="${ink}" stroke-width="${fmt(width)}" fill="none"/>`);
          out.push(`<path d="${back}" stroke="${ink}" stroke-width="${fmt(width)}"${el.backHidden ? dash : ''} fill="none"/>`);
        }
        for (const ci of v.circles) {
          out.push(`<circle cx="${fmt(X(ci.c))}" cy="${fmt(Y(ci.c))}" r="${fmt(ci.r * scale)}" stroke="${ink}" stroke-width="${fmt(width)}" fill="none"/>`);
          all.push(`M${fmt(X(ci.c) - ci.r * scale)} ${fmt(Y(ci.c))}a${fmt(ci.r * scale)} ${fmt(ci.r * scale)} 0 1 0 ${fmt(2 * ci.r * scale)} 0a${fmt(ci.r * scale)} ${fmt(ci.r * scale)} 0 1 0 ${fmt(-2 * ci.r * scale)} 0`);
        }
        if (highlight || cand) out.push(halo(all.join('')));
        break;
      }
      case 'fraction': {
        // equal parts, the chosen ones coloured, with their dividing lines
        const fillCol = greyed ? '#e6e9ed' : s.fill && s.fill !== 'none' ? s.fill : '#f9cb9c';
        for (let i = 0; i < v.parts.length; i++) {
          const d = v.parts[i].map((q, k) => `${k ? 'L' : 'M'}${fmt(X(q))} ${fmt(Y(q))}`).join('') + 'Z';
          const on = v.filled.includes(i);
          out.push(`<path d="${d}" fill="${on ? fillCol : 'none'}"${on ? ` fill-opacity="${fmt(s.fillOpacity ?? 0.9)}"` : ''} stroke="${color}" stroke-width="${fmt(Math.max(0.8, width * 0.8))}" stroke-linejoin="round"/>`);
        }
        if (highlight) {
          const all = v.parts.map((pp) => pp.map((q, k) => `${k ? 'L' : 'M'}${fmt(X(q))} ${fmt(Y(q))}`).join('') + 'Z').join('');
          out.push(halo(all));
        }
        if (s.showValue) {
          const ys = v.parts.flat().map((q) => Y(q));
          const xs = v.parts.flat().map((q) => X(q));
          const text = `${v.filled.length}/${v.parts.length}`;
          const size = theme.fontSize;
          labels.push(`<text x="${fmt((Math.min(...xs) + Math.max(...xs)) / 2 - labelWidth(text, size) / 2)}" y="${fmt(Math.max(...ys) + size + 4)}" style="font-family:${theme.font};font-size:${fmt(size)}px;fill:${theme.label}">${esc(text)}</text>`);
        }
        break;
      }
      case 'text': {
        const style = `font-family:${theme.font};font-size:${fmt(theme.fontSize)}px;fill:${s.color ?? theme.label}`;
        labels.push(`<text x="${fmt(X(v.p))}" y="${fmt(Y(v.p))}" style="${style}">${esc(v.text)}</text>`);
        break;
      }
      case 'function': {
        const from = Math.max(view.xmin, v.from ?? -Infinity);
        const to = Math.min(view.xmax, v.to ?? Infinity);
        const steps = Math.max(80, Math.round((to - from) * scale));
        let d = '';
        let pen = false;
        for (let i = 0; i <= steps; i++) {
          const x = from + ((to - from) * i) / steps;
          const y = v.f(x);
          const ok = Number.isFinite(y) && y > view.ymin - (view.ymax - view.ymin) && y < view.ymax + (view.ymax - view.ymin);
          if (!ok) {
            pen = false;
            continue;
          }
          d += `${pen ? 'L' : 'M'}${fmt(X({ x, y }))} ${fmt(Y({ x, y }))}`;
          pen = true;
        }
        if (d) out.push(halo(d) + `<path d="${d}" ${stroke} fill="none" stroke-linejoin="round"/>`);
        if (showLabel && label) labels.push(labelSvg(label, W - 60, 18, theme, theme.fontSize, theme.label));
        break;
      }
    }

    function ticks(a: Vec, b: Vec, n: number, col: string): string {
      const A = { x: X(a), y: Y(a) };
      const B = { x: X(b), y: Y(b) };
      const m = mul(add(A, B), 0.5);
      const u = unit(sub(B, A));
      const nrm = perp(u);
      const segs: string[] = [];
      for (let i = 0; i < Math.min(3, n); i++) {
        const c = add(m, mul(u, (i - (Math.min(3, n) - 1) / 2) * 4));
        const p = add(c, mul(nrm, 5));
        const q = sub(c, mul(nrm, 5));
        segs.push(`M${fmt(p.x)} ${fmt(p.y)}L${fmt(q.x)} ${fmt(q.y)}`);
      }
      return `<path d="${segs.join('')}" stroke="${col}" stroke-width="1.1"/>`;
    }
  };

  for (const o of c.objects) draw(o, values.get(o.id) ?? null, false);
  for (const o of opts.preview ?? []) draw(o, opts.previewValues?.get(o.id) ?? null, true);

  const body = out.join('') + points.join('') + labels.join('');
  if (exporting) {
    const wCm = W / PX_PER_CM;
    const hCm = H / PX_PER_CM;
    const meta = `<metadata id="mathstudio-geometry">${encodeConstruction(c)}</metadata>`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(wCm)}cm" height="${fmt(hCm)}cm" viewBox="0 0 ${fmt(W)} ${fmt(H)}">` +
      meta + body + '</svg>';
    return { svg, width: wCm, height: hCm };
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(W)}" height="${fmt(H)}" viewBox="0 0 ${fmt(W)} ${fmt(H)}">${body}</svg>`, width: W, height: H };
}

/* ------------------------- embedding the construction ------------------------ */

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

export function encodeConstruction(c: Construction): string {
  return toBase64(JSON.stringify(c));
}

/** Reads the construction embedded in an exported figure's SVG, or null. */
export function decodeConstructionFromSvg(svg: string): Construction | null {
  const m = /<metadata id="mathstudio-geometry">([A-Za-z0-9+/=]+)<\/metadata>/.exec(svg);
  if (!m) return null;
  try {
    const c = JSON.parse(fromBase64(m[1])) as Construction;
    return c && c.version === 1 && Array.isArray(c.objects) ? c : null;
  } catch {
    return null;
  }
}
