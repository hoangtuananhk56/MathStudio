/**
 * From what is seen in a figure (segments, circles, dots, text) to a construction that
 * can be edited and dragged:
 *
 *  - ends of segments that meet are one point (a corner: where the lines cross);
 *  - an end lying on another segment is a point on it (it moves along it);
 *  - names go to the nearest point (a crossing gets a point only when it is named);
 *  - measures go to the side they are written next to (a dimension line with its
 *    arrows gives its measure to the side it runs along, and is not kept);
 *  - small strokes across a side are equal-length ticks, small corners are right-angle
 *    marks, small arcs at a vertex are angle marks;
 *  - closed regions painted with a colour become filled polygons;
 *  - nearly horizontal / vertical sides are made exactly so.
 */
import { emptyConstruction, type Construction, type Def, type GeoObject, type Id, type Style } from '../geometry/model';
import type { FigureText } from './figure-text';
import { len, type FigureStrokes, type Segment, type Vec } from './figure-vision';

export interface FigureReading {
  construction: Construction;
  /** What was found, for the user ("12 điểm, 15 đoạn thẳng…"). */
  stats: { points: number; segments: number; circles: number; labels: number; measures: number; texts: number; marks: number; fills: number };
  /** Names / measures that could not be placed (kept as free text on the figure). */
  unplaced: string[];
}

export interface FigureInput {
  width: number;
  height: number;
  /** RGBA pixels (fill colours are sampled from them). */
  rgba: Uint8ClampedArray | Uint8Array;
  strokes: FigureStrokes;
  texts: FigureText[];
  dots: Vec[];
  /** Letter-sized blobs that could not be read (left out of the drawing). */
  unread?: { x: number; y: number; w: number; h: number }[];
}

/* ------------------------------------------------------------------ geometry */

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
const unit = (a: Vec): Vec => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};

/** Angle between the directions of two segments, 0…90°. */
function angleBetween(a: Segment, b: Segment): number {
  const u = unit(sub(a.b, a.a));
  const v = unit(sub(b.b, b.a));
  return (Math.acos(Math.min(1, Math.abs(dot(u, v)))) * 180) / Math.PI;
}

/** Projection of p on segment s: parameter t (0 at a, 1 at b) and distance. */
function project(p: Vec, s: Segment): { t: number; d: number; at: Vec } {
  const d = sub(s.b, s.a);
  const L2 = dot(d, d) || 1;
  const t = dot(sub(p, s.a), d) / L2;
  const at = add(s.a, mul(d, t));
  return { t, d: len(p, at), at };
}

/** Where the lines through two segments cross, or null when (nearly) parallel. */
function lineCross(s: Segment, r: Segment): Vec | null {
  const d1 = sub(s.b, s.a);
  const d2 = sub(r.b, r.a);
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-9 * (dot(d1, d1) + dot(d2, d2))) return null;
  const t = cross(sub(r.a, s.a), d2) / den;
  return add(s.a, mul(d1, t));
}

/** True when two segments cross (or touch) each other. */
function segmentsCross(s: Segment, r: Segment): boolean {
  const d1 = sub(s.b, s.a);
  const d2 = sub(r.b, r.a);
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-9) return false;
  const t = cross(sub(r.a, s.a), d2) / den;
  const u = cross(sub(r.a, s.a), d1) / den;
  return t >= -0.02 && t <= 1.02 && u >= -0.02 && u <= 1.02;
}

function boxDistance(p: Vec, b: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

function insidePolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/* ------------------------------------------------------------------ points */

type PointKind = 'free' | 'on' | 'cross' | 'dot' | 'center';

interface Pt {
  p: Vec;
  kind: PointKind;
  /** Host segment (kind 'on'), the two segments (kind 'cross'). */
  host?: number;
  hosts?: [number, number];
  label?: string;
  /** Needed in the construction (an end of a kept segment, named, a polygon corner…). */
  used: boolean;
  id?: Id;
}

interface Seg extends Segment {
  /** Point indices of its ends. */
  ia: number;
  ib: number;
  ticks: number;
  label?: string;
  keep: boolean;
}

interface Mark {
  at: number;
  /** Direction from the vertex into the marked angle (px, y down). */
  dir: Vec;
  right: boolean;
}

export function buildFigure(input: FigureInput): FigureReading {
  const { strokes, width: W, height: H } = input;
  const diag = Math.hypot(W, H);
  const stroke = strokes.stroke;
  const tol = Math.max(6, stroke * 3, diag * 0.015);
  const mainLen = Math.max(14, diag * 0.06);

  // 1. collinear pieces of one line (split by erased text or a crossing) are joined
  let raw: (Segment & { ticks?: number })[] = strokes.segments.map((s) => ({ ...s }));
  let joined = true;
  while (joined) {
    joined = false;
    for (let i = 0; i < raw.length && !joined; i++)
      for (let j = i + 1; j < raw.length && !joined; j++) {
        const a = raw[i];
        const b = raw[j];
        if (angleBetween(a, b) > 2.5 || a.dashed !== b.dashed) continue;
        const pa = project(b.a, a);
        const pb = project(b.b, a);
        if (pa.d > stroke * 1.5 + 1 || pb.d > stroke * 1.5 + 1) continue;
        const la = len(a.a, a.b);
        const t0 = Math.min(pa.t, pb.t);
        const t1 = Math.max(pa.t, pb.t);
        const gap = Math.max(0, t0 - 1, -t1) * la;
        if (gap > tol * 1.5) continue;
        const ts = [0, 1, pa.t, pb.t];
        const d = sub(a.b, a.a);
        raw[i] = { a: add(a.a, mul(d, Math.min(...ts))), b: add(a.a, mul(d, Math.max(...ts))), dashed: a.dashed };
        raw.splice(j, 1);
        joined = true;
      }
  }

  // what is left of an unread letter is not part of the drawing
  const inUnread = (p: Vec) => (input.unread ?? []).some((b) => boxDistance(p, b) <= Math.max(stroke * 2, b.h * 0.3));
  raw = raw.filter((s) => !(inUnread(s.a) && inUnread(s.b) && inUnread(mul(add(s.a, s.b), 0.5))));

  // 2. ticks: short strokes across a longer side, near its middle
  const tickOf = new Map<number, Vec[]>();
  const shortIdx = new Set<number>();
  raw.forEach((s, i) => len(s.a, s.b) < mainLen && shortIdx.add(i));
  for (const i of [...shortIdx]) {
    const s = raw[i];
    const l = len(s.a, s.b);
    const mid = mul(add(s.a, s.b), 0.5);
    let host = -1;
    raw.forEach((h, j) => {
      if (j === i || len(h.a, h.b) < 3 * l) return;
      const pr = project(mid, h);
      if (pr.t > 0.1 && pr.t < 0.9 && pr.d < Math.max(stroke * 2, l * 0.35) && angleBetween(s, h) > 45) host = j;
    });
    if (host < 0) continue;
    tickOf.set(host, [...(tickOf.get(host) ?? []), mid]);
    shortIdx.delete(i);
    raw[i] = { ...raw[i], a: { x: NaN, y: NaN } }; // removed below
  }
  for (const [h, mids] of tickOf) {
    // ticks of one mark are close together; a side shows one group
    const hl = len(raw[h].a, raw[h].b);
    const ts = mids.map((m) => project(m, raw[h]).t * hl).sort((a, b) => a - b);
    let best = 1;
    let run = 1;
    for (let k = 1; k < ts.length; k++) {
      run = ts[k] - ts[k - 1] < tol * 1.5 ? run + 1 : 1;
      best = Math.max(best, run);
    }
    raw[h].ticks = Math.min(3, best);
  }

  // 3. right-angle marks: short strokes parallel to a side, a little inside a corner
  type RightMark = { corner: Vec; s: Segment };
  const rightMarks: RightMark[] = [];
  for (const i of [...shortIdx]) {
    const s = raw[i];
    const l = len(s.a, s.b);
    if (l > diag * 0.06) continue;
    let found = false;
    raw.forEach((h1, j) => {
      if (found || shortIdx.has(j) || Number.isNaN(h1.a.x) || angleBetween(s, h1) > 10) return;
      const off = project(mul(add(s.a, s.b), 0.5), h1).d;
      if (off < stroke * 1.2 || off > Math.max(l * 1.6, stroke * 6)) return;
      raw.forEach((h2, k) => {
        if (found || k === j || shortIdx.has(k) || Number.isNaN(h2.a.x) || Math.abs(angleBetween(h1, h2) - 90) > 8) return;
        const corner = lineCross(h1, h2);
        if (!corner) return;
        // the mark's far end is about `off` from the corner along h1
        const ends = [s.a, s.b].map((e) => len(e, corner));
        if (Math.min(...ends) < l * 2.2 + off && project(corner, h1).t > -0.05 && project(corner, h1).t < 1.05 && project(corner, h2).t > -0.05 && project(corner, h2).t < 1.05) {
          rightMarks.push({ corner, s });
          found = true;
        }
      });
    });
    if (found) {
      shortIdx.delete(i);
      raw[i] = { ...raw[i], a: { x: NaN, y: NaN } };
    }
  }
  raw = raw.filter((s) => !Number.isNaN(s.a.x));

  // 4. ends that meet are one point; an end on another segment is a point on it
  const segs: Seg[] = raw.map((s) => ({ ...s, ia: -1, ib: -1, ticks: s.ticks ?? 0, keep: true }));
  const ends: { s: number; end: 'a' | 'b'; p: Vec }[] = [];
  segs.forEach((s, i) => ends.push({ s: i, end: 'a', p: s.a }, { s: i, end: 'b', p: s.b }));
  const parent = ends.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++) if (ends[i].s !== ends[j].s && len(ends[i].p, ends[j].p) < tol) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  ends.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));

  const pts: Pt[] = [];
  for (const members of groups.values()) {
    const ss = members.map((m) => segs[ends[m].s]);
    // a corner: where the lines cross (more exact than the drawn ends)
    let p = mul(members.reduce((acc, m) => add(acc, ends[m].p), { x: 0, y: 0 }), 1 / members.length);
    for (let a = 0; a < ss.length; a++)
      for (let b = a + 1; b < ss.length; b++)
        if (angleBetween(ss[a], ss[b]) > 15) {
          const x = lineCross(ss[a], ss[b]);
          if (x && len(x, p) < tol * 1.5) p = x;
        }
    const idx = pts.push({ p, kind: 'free', used: true }) - 1;
    for (const m of members) {
      if (ends[m].end === 'a') segs[ends[m].s].ia = idx;
      else segs[ends[m].s].ib = idx;
    }
  }
  // T-junctions
  pts.forEach((pt, i) => {
    const own = segs.filter((s) => s.ia === i || s.ib === i);
    let best = -1;
    let bd = tol;
    segs.forEach((h, j) => {
      if (h.ia === i || h.ib === i) return;
      const pr = project(pt.p, h);
      const L = len(h.a, h.b);
      if (pr.t * L < tol * 0.5 || (1 - pr.t) * L < tol * 0.5) return;
      if (pr.d < bd && own.every((o) => angleBetween(o, h) > 10)) {
        bd = pr.d;
        best = j;
      }
    });
    if (best >= 0) {
      const h = segs[best];
      const own1 = own[0];
      const x = own1 ? lineCross(own1, h) : null;
      pt.p = x && len(x, pt.p) < tol * 1.5 ? x : project(pt.p, h).at;
      pt.kind = 'on';
      pt.host = best;
    }
  });
  for (const s of segs) {
    s.a = pts[s.ia].p;
    s.b = pts[s.ib].p;
  }

  // stray short strokes that touch nothing are noise
  segs.forEach((s, i) => {
    if (len(s.a, s.b) >= mainLen) return;
    const touches = (k: number) => segs.some((o, j) => j !== i && (o.ia === k || o.ib === k)) || pts.some((q) => q.kind === 'on' && q.host === i) || pts[k].kind === 'on';
    if (!touches(s.ia) && !touches(s.ib)) s.keep = false;
  });

  // small separate pieces lying inside the drawing are what is left of text, not figures
  {
    const comp = segs.map((_, i) => i);
    const root = (i: number): number => (comp[i] === i ? i : (comp[i] = root(comp[i])));
    segs.forEach((s, i) =>
      segs.forEach((o, j) => {
        if (j <= i || !s.keep || !o.keep) return;
        const share = s.ia === o.ia || s.ia === o.ib || s.ib === o.ia || s.ib === o.ib;
        const on = pts.some((q, k) => q.kind === 'on' && ((q.host === i && (o.ia === k || o.ib === k)) || (q.host === j && (s.ia === k || s.ib === k))));
        if (share || on || segmentsCross(s, o)) comp[root(i)] = root(j);
      }),
    );
    const boxes = new Map<number, { x0: number; y0: number; x1: number; y1: number; n: number }>();
    segs.forEach((s, i) => {
      if (!s.keep) return;
      const b = boxes.get(root(i)) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, n: 0 };
      b.x0 = Math.min(b.x0, s.a.x, s.b.x);
      b.y0 = Math.min(b.y0, s.a.y, s.b.y);
      b.x1 = Math.max(b.x1, s.a.x, s.b.x);
      b.y1 = Math.max(b.y1, s.a.y, s.b.y);
      b.n++;
      boxes.set(root(i), b);
    });
    const size = (b: { x0: number; y0: number; x1: number; y1: number }) => Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
    const biggest = [...boxes.values()].sort((a, b) => size(b) - size(a))[0];
    if (biggest)
      segs.forEach((s, i) => {
        const b = boxes.get(root(i));
        if (!s.keep || !b || b === biggest) return;
        const inside = b.x0 >= biggest.x0 && b.x1 <= biggest.x1 && b.y0 >= biggest.y0 && b.y1 <= biggest.y1;
        if (inside && size(b) < size(biggest) * 0.15) s.keep = false;
      });
  }

  // 5. crossings (become points only when named or needed by a filled region)
  const crossAt = (i: number, j: number): Vec | null => {
    const a = segs[i];
    const b = segs[j];
    if (!a.keep || !b.keep || a.ia === b.ia || a.ia === b.ib || a.ib === b.ia || a.ib === b.ib) return null;
    if (angleBetween(a, b) < 10) return null;
    const x = lineCross(a, b);
    if (!x) return null;
    const pa = project(x, a);
    const pb = project(x, b);
    const la = len(a.a, a.b);
    const lb = len(b.a, b.b);
    const m = tol * 0.5;
    if (pa.t * la < m || (1 - pa.t) * la < m || pb.t * lb < m || (1 - pb.t) * lb < m) return null;
    // a T-point already there?
    if (pts.some((q) => len(q.p, x) < tol)) return null;
    return x;
  };
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const x = crossAt(i, j);
      if (x) pts.push({ p: x, kind: 'cross', hosts: [i, j], used: false });
    }

  // 6. circles; small arcs at a vertex are angle marks
  const marks: Mark[] = [];
  const circles: { c: number; r: number; through?: number }[] = [];
  const nearestPoint = (p: Vec, within: number) => {
    let best = -1;
    let bd = within;
    pts.forEach((q, i) => {
      const d = len(q.p, p);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  for (const c of strokes.circles) {
    if (inUnread(c.c)) continue;
    if (c.coverage < 0.75 && c.r < diag * 0.12) {
      const v = nearestPoint(c.c, Math.max(tol, c.r * 0.8));
      if (v >= 0) marks.push({ at: v, dir: { x: Math.cos(c.mid), y: Math.sin(c.mid) }, right: false });
      continue;
    }
    if (c.coverage < 0.75 || c.r < Math.max(8, diag * 0.03)) continue;
    let ci = nearestPoint(c.c, tol);
    if (ci < 0) ci = pts.push({ p: c.c, kind: 'center', used: true }) - 1;
    const through = pts.findIndex((q, i) => i !== ci && Math.abs(len(q.p, c.c) - c.r) < tol * 0.6);
    circles.push({ c: ci, r: c.r, through: through >= 0 ? through : undefined });
    if (through >= 0) pts[through].used = true;
  }
  for (const rm of rightMarks) {
    const v = nearestPoint(rm.corner, tol * 1.5);
    if (v < 0) continue;
    const mid = mul(add(rm.s.a, rm.s.b), 0.5);
    marks.push({ at: v, dir: unit(sub(mid, pts[v].p)), right: true });
  }

  // dots drawn for points that have no lines through them
  for (const d of input.dots) if (nearestPoint(d, tol) < 0) pts.push({ p: d, kind: 'dot', used: true });

  // 7. names go to the nearest point (crossings and points on sides included)
  const unplaced: string[] = [];
  // (a digit that could be a letter competes too, a little behind real names)
  const labels = input.texts.filter((t) => t.kind === 'label' || (t.kind === 'number' && t.alt));
  const pairs: { l: number; p: number; d: number }[] = [];
  labels.forEach((t, l) => {
    const limit = Math.max(t.box.h * 2.2, stroke * 4);
    pts.forEach((q, p) => {
      const d = boxDistance(q.p, t.box);
      if (d <= limit) pairs.push({ l, p, d: d + (t.kind === 'number' ? t.box.h * 0.5 : 0) });
    });
  });
  pairs.sort((a, b) => a.d - b.d);
  const named = new Set<number>();
  const labelDone = new Set<number>();
  for (const { l, p } of pairs) {
    if (named.has(p) || labelDone.has(l)) continue;
    named.add(p);
    labelDone.add(l);
    pts[p].label = labels[l].kind === 'number' ? labels[l].alt : labels[l].text;
    pts[p].used = true;
  }
  const consumed = new Set(labels.filter((_, l) => labelDone.has(l)));
  const extraTexts: { text: string; at: Vec }[] = [];
  labels.forEach((t, l) => {
    if (labelDone.has(l) || t.kind !== 'label') return;
    // a name by a side, with no visible point: a point on that side
    const c = { x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 2 };
    let host = -1;
    let bd = t.box.h * 1.6;
    segs.forEach((s, j) => {
      if (!s.keep) return;
      const pr = project(c, s);
      if (pr.t > 0.05 && pr.t < 0.95 && pr.d < bd) {
        bd = pr.d;
        host = j;
      }
    });
    if (host >= 0) pts.push({ p: project(c, segs[host]).at, kind: 'on', host, label: t.text, used: true });
    else {
      unplaced.push(t.text);
      extraTexts.push({ text: t.text, at: c });
    }
  });

  // 8. measures: on the side they are written by; dimension lines give theirs to the side
  const isDimension = (i: number) => {
    const s = segs[i];
    const free = (k: number) => !segs.some((o, j) => j !== i && o.keep && (o.ia === k || o.ib === k)) && pts[k].kind !== 'on' && !pts.some((q) => q.kind === 'on' && q.host === i);
    return free(s.ia) && free(s.ib);
  };
  const sideOf = (i: number): number => {
    // the side a dimension line runs along: parallel, overlapping, the nearest
    const s = segs[i];
    let best = -1;
    let bd = diag * 0.15;
    segs.forEach((o, j) => {
      if (j === i || !o.keep || angleBetween(s, o) > 4) return;
      const pa = project(s.a, o);
      const pb = project(s.b, o);
      const overlap = Math.min(1, Math.max(pa.t, pb.t)) - Math.max(0, Math.min(pa.t, pb.t));
      if (overlap < 0.7) return;
      const d = (pa.d + pb.d) / 2;
      if (d < bd) {
        bd = d;
        best = j;
      }
    });
    return best;
  };
  let measures = 0;
  for (const t of input.texts) {
    if ((t.kind !== 'measure' && t.kind !== 'number') || consumed.has(t)) continue;
    const c = { x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 2 };
    const area = /²|³/.test(t.text);
    let best = -1;
    let bd = Math.max(t.box.h * 2.2, diag * 0.04);
    if (!area)
      segs.forEach((s, j) => {
        if (!s.keep || s.label) return;
        const pr = project(c, s);
        if (pr.t < 0.05 || pr.t > 0.95) return;
        const d = Math.max(0, pr.d - Math.max(t.box.w, t.box.h) / 2);
        if (d < bd) {
          bd = d;
          best = j;
        }
      });
    if (best >= 0 && isDimension(best)) {
      // a dimension line: its measure belongs to the side it runs along
      const side = sideOf(best);
      if (side >= 0) {
        segs[best].keep = false;
        best = segs[side].label ? -1 : side;
      }
    }
    if (best >= 0) {
      segs[best].label = t.text;
      measures++;
    } else extraTexts.push({ text: t.text, at: c });
  }
  // other dimension lines (their measure was not read) are not part of the figure either
  segs.forEach((s, i) => {
    if (s.keep && !s.label && isDimension(i) && sideOf(i) >= 0) s.keep = false;
  });
  // words inside the drawing are notes on it; outside it they are the exercise around it
  const kept = segs.filter((s) => s.keep);
  const bx0 = Math.min(...kept.map((s) => Math.min(s.a.x, s.b.x)));
  const bx1 = Math.max(...kept.map((s) => Math.max(s.a.x, s.b.x)));
  const by0 = Math.min(...kept.map((s) => Math.min(s.a.y, s.b.y)));
  const by1 = Math.max(...kept.map((s) => Math.max(s.a.y, s.b.y)));
  const m = 0.08 * Math.max(bx1 - bx0, by1 - by0);
  const inside = (b: { x: number; y: number; w: number; h: number }) => b.x + b.w > bx0 - m && b.x < bx1 + m && b.y + b.h > by0 - m && b.y < by1 + m;
  for (const t of input.texts) {
    if (!inside(t.box)) continue;
    if (t.kind === 'word' && !/^Hình\s*\d+/i.test(t.text)) extraTexts.push({ text: t.text, at: { x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 2 } });
    if (t.kind === 'question') extraTexts.push({ text: '?', at: { x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 2 } });
  }

  // 9. filled regions: faces of the drawing painted with a colour
  const fills = findFilledFaces(segs, pts, input);

  // ------------------------------------------------------------------ to the construction
  for (const s of segs) {
    if (!s.keep) continue;
    pts[s.ia].used = true;
    pts[s.ib].used = true;
  }
  for (const m of marks) pts[m.at].used = true;

  // world coordinates: about 10 cm across, y up
  const usedPts = pts.filter((q) => q.used);
  const xs = usedPts.map((q) => q.p.x);
  const ys = usedPts.map((q) => q.p.y);
  const minX = Math.min(...xs, W);
  const maxX = Math.max(...xs, 0);
  const minY = Math.min(...ys, H);
  const maxY = Math.max(...ys, 0);
  const span = Math.max(1, maxX - minX, maxY - minY);
  const k = 10 / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const world = (p: Vec): Vec => ({ x: (p.x - cx) * k, y: -(p.y - cy) * k });

  straighten(segs, pts);

  const c: Construction = { ...emptyConstruction(), objects: [] };
  const objs: GeoObject[] = c.objects;
  let n = 0;
  const newId = (prefix: string) => `${prefix}${++n}`;
  const round = (v: number) => Math.round(v * 100) / 100;
  const pointStyle = (q: Pt): Style => (q.label ? { label: q.label } : { label: '', showLabel: false, dot: false });

  for (const q of pts) {
    if (!q.used || (q.kind !== 'free' && q.kind !== 'dot' && q.kind !== 'center')) continue;
    const w = world(q.p);
    q.id = newId('p');
    objs.push({ id: q.id, def: { t: 'point', x: round(w.x), y: round(w.y) }, style: pointStyle(q) });
  }
  const segId = new Map<number, Id>();
  // segments, points on them and crossings, in an order where each depends on earlier ones
  let progress = true;
  while (progress) {
    progress = false;
    segs.forEach((s, i) => {
      if (segId.has(i) || !s.keep) return;
      const a = pts[s.ia].id;
      const b = pts[s.ib].id;
      if (!a || !b || a === b) return;
      const id = newId('s');
      const style: Style = {};
      if (s.dashed) style.dash = 'dashed';
      if (s.ticks) style.ticks = s.ticks;
      if (s.label) {
        style.label = s.label;
        style.showLabel = true;
      }
      objs.push({ id, def: { t: 'segment', a, b }, style });
      segId.set(i, id);
      progress = true;
    });
    pts.forEach((q) => {
      if (q.id || !q.used) return;
      if (q.kind === 'on' && q.host !== undefined) {
        const host = segs[q.host];
        const hid = segId.get(q.host);
        if (!hid) {
          // a point on a side that is not kept (or not yet made)
          if (!host.keep) {
            q.kind = 'free';
            const w = world(q.p);
            q.id = newId('p');
            objs.push({ id: q.id, def: { t: 'point', x: round(w.x), y: round(w.y) }, style: pointStyle(q) });
            progress = true;
          }
          return;
        }
        const t = Math.max(0, len(host.a, q.p) * k);
        q.id = newId('p');
        objs.push({ id: q.id, def: { t: 'pointOn', on: hid, param: round(t) }, style: pointStyle(q) });
        progress = true;
      } else if (q.kind === 'cross' && q.hosts) {
        const a = segId.get(q.hosts[0]);
        const b = segId.get(q.hosts[1]);
        if (!a || !b) return;
        q.id = newId('p');
        objs.push({ id: q.id, def: { t: 'intersection', a, b, index: 0 }, style: pointStyle(q) });
        progress = true;
      }
    });
    // a cycle of points on each other's sides: make one of them free
    if (!progress) {
      const stuck = pts.find((q) => q.used && !q.id && q.kind === 'on');
      if (stuck) {
        stuck.kind = 'free';
        const w = world(stuck.p);
        stuck.id = newId('p');
        objs.push({ id: stuck.id, def: { t: 'point', x: round(w.x), y: round(w.y) }, style: pointStyle(stuck) });
        progress = true;
      }
    }
  }

  for (const ci of circles) {
    const center = pts[ci.c].id!;
    const through = ci.through !== undefined ? pts[ci.through].id : undefined;
    const def: Def = through ? { t: 'circle', center, through } : { t: 'circleR', center, r: round(ci.r * k) };
    objs.push({ id: newId('c'), def, style: {} });
  }

  for (const f of fills) {
    const ids = f.pts.map((i) => pts[i].id);
    if (ids.some((x) => !x)) continue;
    // under the lines: put it right after its last point
    const id = newId('poly');
    const last = Math.max(...ids.map((x) => objs.findIndex((o) => o.id === x)));
    objs.splice(last + 1, 0, { id, def: { t: 'polygon', pts: ids as Id[] }, style: { fill: f.color, fillOpacity: 1, width: 0 } });
  }

  // angle marks: between the two sides at the vertex that the mark sits between
  let markCount = 0;
  for (const m of marks) {
    const v = pts[m.at];
    if (!v.id) continue;
    const rays = raysFrom(m.at, segs, pts);
    let best: [number, number] | null = null;
    let bs = -Infinity;
    for (let a = 0; a < rays.length; a++)
      for (let b = a + 1; b < rays.length; b++) {
        const ua = unit(sub(pts[rays[a]].p, v.p));
        const ub = unit(sub(pts[rays[b]].p, v.p));
        const bis = unit(add(ua, ub));
        const ang = (Math.acos(Math.max(-1, Math.min(1, dot(ua, ub)))) * 180) / Math.PI;
        if (ang < 10 || ang > 170) continue;
        const score = dot(bis, m.dir) - (m.right ? Math.abs(ang - 90) / 30 : 0);
        if (score > bs) {
          bs = score;
          best = [rays[a], rays[b]];
        }
      }
    if (!best) continue;
    const [a, b] = best.map((i) => pts[i].id!);
    objs.push({ id: newId('ang'), def: { t: 'angle', a, b: v.id, c: b }, style: m.right ? {} : { arcs: 1 } });
    markCount++;
  }

  for (const t of extraTexts) {
    const w = world(t.at);
    objs.push({ id: newId('txt'), def: { t: 'text', x: round(w.x), y: round(w.y), text: t.text }, style: {} });
  }

  // view: the figure with a margin
  const wx = usedPts.map((q) => world(q.p).x);
  const wy = usedPts.map((q) => world(q.p).y);
  const pad = 1.5;
  if (wx.length) c.view = { xmin: Math.min(...wx) - pad, xmax: Math.max(...wx) + pad, ymin: Math.min(...wy) - pad, ymax: Math.max(...wy) + pad };

  return {
    construction: c,
    stats: {
      points: objs.filter((o) => o.def.t === 'point' || o.def.t === 'pointOn' || o.def.t === 'intersection').length,
      segments: segId.size,
      circles: circles.length,
      labels: pts.filter((q) => q.id && q.label).length,
      measures,
      texts: extraTexts.length,
      marks: markCount + segs.filter((s) => s.keep && s.ticks).length,
      fills: objs.filter((o) => o.def.t === 'polygon').length,
    },
    unplaced,
  };
}

/** Points next to a vertex along each kept segment through it (both ways). */
function raysFrom(v: number, segs: Seg[], pts: Pt[]): number[] {
  const out: number[] = [];
  segs.forEach((s, i) => {
    if (!s.keep) return;
    const on = pointsOn(i, segs, pts);
    const k = on.indexOf(v);
    if (k < 0) return;
    if (k > 0) out.push(on[k - 1]);
    if (k < on.length - 1) out.push(on[k + 1]);
  });
  return out;
}

/** Points of a segment from a to b: its ends, points on it, crossings on it. */
function pointsOn(i: number, segs: Seg[], pts: Pt[]): number[] {
  const s = segs[i];
  const list = [s.ia, s.ib];
  pts.forEach((q, k) => {
    if ((q.kind === 'on' && q.host === i) || (q.kind === 'cross' && q.hosts?.includes(i))) list.push(k);
  });
  return [...new Set(list)].sort((a, b) => len(s.a, pts[a].p) - len(s.a, pts[b].p));
}

/** Nearly horizontal / vertical sides between free points become exactly so. */
function straighten(segs: Seg[], pts: Pt[]): void {
  for (const axis of ['y', 'x'] as const) {
    const parent = pts.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (const s of segs) {
      if (!s.keep) continue;
      const d = sub(pts[s.ib].p, pts[s.ia].p);
      const along = axis === 'y' ? Math.abs(d.y) / (Math.abs(d.x) || 1e-9) : Math.abs(d.x) / (Math.abs(d.y) || 1e-9);
      if (along < Math.tan((3 * Math.PI) / 180)) parent[find(s.ia)] = find(s.ib);
    }
    const sums = new Map<number, { s: number; n: number }>();
    pts.forEach((q, i) => {
      if (q.kind !== 'free' && q.kind !== 'dot') return;
      const r = find(i);
      const e = sums.get(r) ?? { s: 0, n: 0 };
      e.s += q.p[axis];
      e.n++;
      sums.set(r, e);
    });
    pts.forEach((q, i) => {
      if (q.kind !== 'free' && q.kind !== 'dot') return;
      const e = sums.get(find(i))!;
      if (e.n > 1) q.p = { ...q.p, [axis]: e.s / e.n };
    });
  }
  for (const s of segs) {
    s.a = pts[s.ia].p;
    s.b = pts[s.ib].p;
  }
}

/**
 * Faces of the drawing (regions bounded by its sides) painted in a colour other than the
 * paper: a planar walk around each region, then the colour sampled inside it.
 */
function findFilledFaces(segs: Seg[], pts: Pt[], input: FigureInput): { pts: number[]; color: string }[] {
  // edges between consecutive points along every kept segment
  const adj = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  segs.forEach((s, i) => {
    if (!s.keep) return;
    const on = pointsOn(i, segs, pts);
    for (let k = 1; k < on.length; k++) link(on[k - 1], on[k]);
  });
  const angleOf = (a: number, b: number) => Math.atan2(pts[b].p.y - pts[a].p.y, pts[b].p.x - pts[a].p.x);
  const seen = new Set<string>();
  const faces: number[][] = [];
  for (const [a, nb] of adj)
    for (const b of nb) {
      if (seen.has(`${a}>${b}`)) continue;
      // walk: at each point turn to the next edge clockwise from where we came
      const face = [a];
      let u = a;
      let v = b;
      for (let guard = 0; guard < 200; guard++) {
        seen.add(`${u}>${v}`);
        if (v === a) break;
        face.push(v);
        const back = angleOf(v, u);
        let best = -1;
        let bestTurn = Infinity;
        for (const w of adj.get(v)!) {
          if (w === u && adj.get(v)!.size > 1) continue;
          let turn = back - angleOf(v, w);
          while (turn <= 0) turn += 2 * Math.PI;
          if (turn < bestTurn) {
            bestTurn = turn;
            best = w;
          }
        }
        if (best < 0) break;
        u = v;
        v = best;
      }
      if (face.length >= 3 && v === a) faces.push(face);
    }
  const area = (f: number[]) => f.reduce((s, i, k) => s + cross(pts[i].p, pts[f[(k + 1) % f.length]].p), 0) / 2;
  const out: { pts: number[]; color: string }[] = [];
  const { width: W, rgba } = input;
  const keys = new Set<string>();
  for (const f of faces) {
    const A = area(f);
    if (A <= 0) continue; // the outer boundary walks the other way round
    const key = [...f].sort((x, y) => x - y).join(',');
    if (keys.has(key)) continue;
    keys.add(key);
    const poly = f.map((i) => pts[i].p);
    // colour at points spread inside the face
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const samples: number[][] = [];
    for (let gy = 1; gy < 6; gy++)
      for (let gx = 1; gx < 6; gx++) {
        const p = { x: Math.min(...xs) + ((Math.max(...xs) - Math.min(...xs)) * gx) / 6, y: Math.min(...ys) + ((Math.max(...ys) - Math.min(...ys)) * gy) / 6 };
        if (!insidePolygon(p, poly)) continue;
        const i = (Math.round(p.y) * W + Math.round(p.x)) * 4;
        samples.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
      }
    if (samples.length < 3) continue;
    // the most common colour among the samples (text inside a region does not count)
    const counts = new Map<string, { n: number; c: number[] }>();
    for (const s of samples) {
      const q = s.map((v) => v >> 4).join(',');
      const e = counts.get(q) ?? { n: 0, c: s };
      e.n++;
      counts.set(q, e);
    }
    const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    if (top.n < samples.length * 0.6) continue;
    const [r, g, b] = top.c;
    if (Math.min(r, g, b) > 235) continue; // paper
    const hex = (v: number) => v.toString(16).padStart(2, '0');
    out.push({ pts: f, color: `#${hex(r)}${hex(g)}${hex(b)}` });
  }
  return out;
}
