/**
 * Solid geometry (grades 11–12): true 3D points, drawn the textbook way.
 *
 * Coordinates: x to the right, y going back (depth), z up; centimetres. A point placed at
 * (x; y) on the page has the 3D coordinates (x, 0, y). The drawing is the oblique (cavalier)
 * projection of the textbooks: the depth axis at 45°, shortened by half; the scene may be
 * turned about a vertical axis (`yaw`) to look at it from another side.
 *
 * Hidden parts are found geometrically: a point is hidden when, going from it towards the
 * eye, one enters a solid. Edges, constructed segments and sections are cut into seen and
 * hidden pieces (the hidden ones are drawn dashed).
 */
import type { Vec } from './engine';
import type { Solid3Kind } from './model';

export type { Solid3Kind };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul3 = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const len3 = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const dist3 = (a: Vec3, b: Vec3): number => len3(sub3(a, b));
export const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => add3(a, mul3(sub3(b, a), k));
export const unit3 = (a: Vec3): Vec3 => {
  const l = len3(a);
  return l < 1e-12 ? v3(0, 0, 1) : mul3(a, 1 / l);
};
const EPS = 1e-7;

/* ------------------------------------------------------------------ view */

/** Oblique depth: 45°, half length (as in Vietnamese textbooks). */
const DC = 0.5 * Math.SQRT1_2;

export interface View3 {
  /** Turn of the scene about the vertical axis through `pivot`, degrees. */
  yaw: number;
  pivot: Vec3;
}

function turn(p: Vec3, view: View3): Vec3 {
  if (!view.yaw) return p;
  const r = (view.yaw * Math.PI) / 180;
  const dx = p.x - view.pivot.x;
  const dy = p.y - view.pivot.y;
  return { x: view.pivot.x + dx * Math.cos(r) - dy * Math.sin(r), y: view.pivot.y + dx * Math.sin(r) + dy * Math.cos(r), z: p.z };
}

/** Where a 3D point is drawn on the page. */
export function project(p: Vec3, view: View3): Vec {
  const q = turn(p, view);
  return { x: q.x + DC * q.y, y: q.z + DC * q.y };
}

/** The direction one looks along (away from the eye), in scene coordinates. */
export function viewDirection(view: View3): Vec3 {
  // in the turned frame: (−DC, 1, −DC) keeps the drawing unchanged; turn it back
  const d = v3(-DC, 1, -DC);
  if (!view.yaw) return d;
  const r = (-view.yaw * Math.PI) / 180;
  return { x: d.x * Math.cos(r) - d.y * Math.sin(r), y: d.x * Math.sin(r) + d.y * Math.cos(r), z: d.z };
}

/* ------------------------------------------------------------------ solids */

export interface Face {
  /** Vertex indices, in order around the face. */
  idx: number[];
  /** Outward unit normal and offset: inside is n·x < d. */
  n: Vec3;
  d: number;
}

export interface Polyhedron {
  verts: Vec3[];
  faces: Face[];
  /** Edges as vertex index pairs (each once). */
  edges: [number, number][];
}

/**
 * Faces and edges of the convex hull of a few points (a solid's vertices): every plane
 * through three of them with all the others on one side is a face (coplanar ones merged).
 */
export function convexHull(verts: Vec3[]): Polyhedron {
  const n = verts.length;
  const scale = Math.max(1, ...verts.map((p) => len3(p)));
  const tol = 1e-6 * scale;
  const faces: Face[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        let nn = cross3(sub3(verts[j], verts[i]), sub3(verts[k], verts[i]));
        if (len3(nn) < tol) continue;
        nn = unit3(nn);
        let d = dot3(nn, verts[i]);
        let pos = 0;
        let neg = 0;
        const on: number[] = [];
        for (let m = 0; m < n; m++) {
          const s = dot3(nn, verts[m]) - d;
          if (s > tol) pos++;
          else if (s < -tol) neg++;
          else on.push(m);
        }
        if (pos && neg) continue;
        if (pos) {
          nn = mul3(nn, -1);
          d = -d;
        }
        const key = on.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        faces.push({ idx: orderAround(on, verts, nn), n: nn, d });
      }
  const edges: [number, number][] = [];
  const ek = new Set<string>();
  for (const f of faces)
    f.idx.forEach((a, t) => {
      const b = f.idx[(t + 1) % f.idx.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!ek.has(key)) {
        ek.add(key);
        edges.push(a < b ? [a, b] : [b, a]);
      }
    });
  return { verts, faces, edges };
}

/** Indices of coplanar points in order around their centre (counter-clockwise about `n`). */
function orderAround(idx: number[], verts: Vec3[], n: Vec3): number[] {
  const c = mul3(idx.reduce((s, i) => add3(s, verts[i]), v3(0, 0, 0)), 1 / idx.length);
  const u = unit3(sub3(verts[idx[0]], c));
  const w = cross3(n, u);
  return [...idx].sort((a, b) => {
    const pa = sub3(verts[a], c);
    const pb = sub3(verts[b], c);
    return Math.atan2(dot3(pa, w), dot3(pa, u)) - Math.atan2(dot3(pb, w), dot3(pb, u));
  });
}

/** True when the point is strictly inside the solid. */
export function inside(p: Vec3, s: Polyhedron, margin = 1e-6): boolean {
  return s.faces.every((f) => dot3(f.n, p) < f.d - margin);
}

/* ------------------------------------------------------------------ hidden parts */

/** True when a solid hides the point: going towards the eye, one enters one of the solids. */
export function hiddenPoint(p: Vec3, solids: Polyhedron[], view: View3): boolean {
  const toEye = mul3(viewDirection(view), -1);
  for (const s of solids) {
    if (inside(p, s, 1e-5)) return true;
    // the ray p + t·toEye (t > 0) against the convex solid: [t0, t1] inside
    let t0 = 1e-4;
    let t1 = Infinity;
    for (const f of s.faces) {
      const num = f.d - dot3(f.n, p);
      const den = dot3(f.n, toEye);
      if (Math.abs(den) < 1e-12) {
        if (num < 1e-6) {
          t1 = -1;
          break;
        }
        continue;
      }
      const t = num / den;
      if (den > 0) t1 = Math.min(t1, t);
      else t0 = Math.max(t0, t);
    }
    if (t1 > t0 + 1e-5) return true;
  }
  return false;
}

export interface Piece {
  a: Vec;
  b: Vec;
  hidden: boolean;
}

/** A 3D segment cut into seen / hidden pieces, projected. */
export function segmentPieces(a: Vec3, b: Vec3, solids: Polyhedron[], view: View3): Piece[] {
  if (!solids.length) return [{ a: project(a, view), b: project(b, view), hidden: false }];
  const N = 48;
  const hid = (t: number) => hiddenPoint(lerp3(a, b, t), solids, view);
  const out: { t0: number; t1: number; hidden: boolean }[] = [];
  let prev = hid(0.5 / N);
  let start = 0;
  for (let i = 1; i < N; i++) {
    const h = hid((i + 0.5) / N);
    if (h === prev) continue;
    // refine the change between the two samples
    let lo = (i - 0.5) / N;
    let hi = (i + 0.5) / N;
    for (let k = 0; k < 18; k++) {
      const m = (lo + hi) / 2;
      if (hid(m) === prev) lo = m;
      else hi = m;
    }
    out.push({ t0: start, t1: (lo + hi) / 2, hidden: prev });
    start = (lo + hi) / 2;
    prev = h;
  }
  out.push({ t0: start, t1: 1, hidden: prev });
  return out.map((r) => ({ a: project(lerp3(a, b, r.t0), view), b: project(lerp3(a, b, r.t1), view), hidden: r.hidden }));
}

/**
 * Pieces of a solid's own edges: an edge between two faces turned away from the eye is
 * hidden; an edge of a visible face is seen (other solids may still hide parts of it).
 */
export function edgePieces(s: Polyhedron, others: Polyhedron[], view: View3): Piece[][] {
  const look = viewDirection(view);
  const front = s.faces.map((f) => dot3(f.n, look) < -1e-9);
  return s.edges.map(([a, b]) => {
    const fs = s.faces.filter((f) => adjacent(f.idx, a, b));
    const seen = fs.some((f) => front[s.faces.indexOf(f)]);
    if (!seen) return [{ a: project(s.verts[a], view), b: project(s.verts[b], view), hidden: true }];
    return others.length ? segmentPieces(s.verts[a], s.verts[b], others, view) : [{ a: project(s.verts[a], view), b: project(s.verts[b], view), hidden: false }];
  });
}

/** True when a and b follow each other round the face. */
function adjacent(idx: number[], a: number, b: number): boolean {
  const i = idx.indexOf(a);
  const j = idx.indexOf(b);
  if (i < 0 || j < 0) return false;
  const k = Math.abs(i - j);
  return k === 1 || k === idx.length - 1;
}

/* ------------------------------------------------------------------ constructions */

export interface Plane {
  n: Vec3;
  d: number;
}

/** The plane through three points, or null when they are on one line. */
export function planeOf(a: Vec3, b: Vec3, c: Vec3): Plane | null {
  const n = cross3(sub3(b, a), sub3(c, a));
  if (len3(n) < EPS * Math.max(1, len3(sub3(b, a)) * len3(sub3(c, a)))) return null;
  const u = unit3(n);
  return { n: u, d: dot3(u, a) };
}

/** Where line AB meets the plane, or null when parallel. */
export function linePlane(a: Vec3, b: Vec3, pl: Plane): Vec3 | null {
  const d = sub3(b, a);
  const den = dot3(pl.n, d);
  if (Math.abs(den) < EPS * len3(d)) return null;
  return add3(a, mul3(d, (pl.d - dot3(pl.n, a)) / den));
}

/**
 * Where lines AB and CD meet. In space two lines may miss each other: then null (unless
 * they pass within `tol` of each other, a drawing's rounding).
 */
export function lineLine3(a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 | null {
  const u = sub3(b, a);
  const v = sub3(d, c);
  const w = sub3(a, c);
  const A = dot3(u, u);
  const B = dot3(u, v);
  const C = dot3(v, v);
  const D = dot3(u, w);
  const E = dot3(v, w);
  const den = A * C - B * B;
  if (Math.abs(den) < 1e-12 * A * C) return null; // parallel
  const s = (B * E - C * D) / den;
  const t = (A * E - B * D) / den;
  const p = add3(a, mul3(u, s));
  const q = add3(c, mul3(v, t));
  const scale = Math.max(1, Math.sqrt(A), Math.sqrt(C));
  return dist3(p, q) < 1e-4 * scale ? mul3(add3(p, q), 0.5) : null;
}

/** The line where two planes meet: a point on it and its direction, or null when parallel. */
export function planePlane(p: Plane, q: Plane): { o: Vec3; d: Vec3 } | null {
  const d = cross3(p.n, q.n);
  const l = len3(d);
  if (l < 1e-9) return null;
  // the point of the line closest to the origin
  const n1 = p.n;
  const n2 = q.n;
  const o = mul3(add3(mul3(cross3(n2, d), p.d), mul3(cross3(d, n1), q.d)), 1 / (l * l));
  return { o, d: mul3(d, 1 / l) };
}

/** Orthogonal projection of a point on a plane. */
export function footOnPlane(p: Vec3, pl: Plane): Vec3 {
  return sub3(p, mul3(pl.n, dot3(pl.n, p) - pl.d));
}

/** Orthogonal projection of a point on line AB. */
export function footOnLine(p: Vec3, a: Vec3, b: Vec3): Vec3 | null {
  const d = sub3(b, a);
  const dd = dot3(d, d);
  if (dd < EPS) return null;
  return add3(a, mul3(d, dot3(sub3(p, a), d) / dd));
}

/** The section of a convex solid by a plane: its corners in order (empty when it misses). */
export function section(s: Polyhedron, pl: Plane): Vec3[] {
  const side = s.verts.map((p) => dot3(pl.n, p) - pl.d);
  const tol = 1e-7 * Math.max(1, ...s.verts.map((p) => len3(p)));
  const pts: Vec3[] = [];
  const push = (p: Vec3) => {
    if (!pts.some((q) => dist3(q, p) < 1e-6)) pts.push(p);
  };
  side.forEach((v, i) => Math.abs(v) <= tol && push(s.verts[i]));
  for (const [a, b] of s.edges) {
    const sa = side[a];
    const sb = side[b];
    if ((sa > tol && sb < -tol) || (sa < -tol && sb > tol)) push(lerp3(s.verts[a], s.verts[b], sa / (sa - sb)));
  }
  if (pts.length < 3) return [];
  const idx = pts.map((_, i) => i);
  return orderAround(idx, pts, pl.n).map((i) => pts[i]);
}

/** Centre of points. */
export function centroid3(ps: Vec3[]): Vec3 {
  return mul3(ps.reduce((s, p) => add3(s, p), v3(0, 0, 0)), 1 / Math.max(1, ps.length));
}

/**
 * The part of an infinite 3D line worth drawing: where it crosses the space around the
 * solids (their box, a little larger), or a length of `fallback` around `o`.
 */
export function clipLine(o: Vec3, d: Vec3, solids: Polyhedron[], fallback = 6): [Vec3, Vec3] {
  const pts = solids.flatMap((s) => s.verts);
  if (!pts.length) return [add3(o, mul3(d, -fallback / 2)), add3(o, mul3(d, fallback / 2))];
  const lo = v3(Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.min(...pts.map((p) => p.z)));
  const hi = v3(Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.z)));
  const pad = 0.1 * Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, 1);
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const k of ['x', 'y', 'z'] as const) {
    const a = lo[k] - pad;
    const b = hi[k] + pad;
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < a || o[k] > b) return [o, o];
      continue;
    }
    let ta = (a - o[k]) / d[k];
    let tb = (b - o[k]) / d[k];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
  }
  if (!(t1 > t0)) return [o, o];
  return [add3(o, mul3(d, t0)), add3(o, mul3(d, t1))];
}

/* ------------------------------------------------------------------ textbook solids */

export interface Solid3Spec {
  kind: Solid3Kind;
  /** Base: number of sides (3 or 4; regular: 3…8). */
  n: number;
  /** Width (AB), depth (AD), height; for regular bases `w` is the side. */
  w: number;
  d: number;
  h: number;
  /** Base ABCD: D is `skew` cm right of A (parallelogram, trapezoid), CD = `top`·AB (trapezoid). */
  skew?: number;
  top?: number;
  /** Apex above the centre of the base (default) or right above A (SA ⊥ base). */
  apex?: 'center' | 'A';
  /** Where the solid's first vertex sits: page point (x; y) = space point (x, 0, y). */
  x: number;
  y: number;
}

/**
 * Vertices of a textbook solid, in the order of its usual name: base A, B, C, (D…), then
 * the apex S (pyramids) or the top A′, B′, C′… (prisms, boxes).
 */
export function solidVertices(s: Solid3Spec): Vec3[] {
  const o = v3(s.x, 0, s.y);
  const at = (x: number, y: number, z = 0) => add3(o, v3(x, y, z));
  let base: Vec3[];
  if (s.kind === 'pyramidReg' || s.kind === 'prismReg' || s.kind === 'tetra') {
    const n = s.kind === 'tetra' ? 3 : Math.max(3, Math.min(8, Math.round(s.n)));
    // side AB in front (A left, B right), the others going round behind it
    const R = s.w / (2 * Math.sin(Math.PI / n));
    const apothem = s.w / (2 * Math.tan(Math.PI / n));
    const c = v3(s.w / 2, apothem, 0);
    const a0 = Math.atan2(-apothem, -s.w / 2);
    base = Array.from({ length: n }, (_, i) => at(c.x + R * Math.cos(a0 + (2 * Math.PI * i) / n), c.y + R * Math.sin(a0 + (2 * Math.PI * i) / n)));
  } else if (s.n === 3) {
    // the textbook triangle: B in front, A and C behind (the back edge AC hidden)
    base = [at(0, s.d), at(s.w * 0.42, 0), at(s.w, s.d)];
  } else {
    const skew = s.skew ?? 0;
    const top = s.top ?? 1;
    base = [at(0, 0), at(s.w, 0), at(skew + s.w * top, s.d), at(skew, s.d)];
  }
  const h = s.kind === 'tetra' ? s.w * Math.sqrt(2 / 3) : s.h;
  if (s.kind === 'prism' || s.kind === 'box' || s.kind === 'prismReg') return [...base, ...base.map((p) => add3(p, v3(0, 0, h)))];
  const apexBase = s.apex === 'A' ? base[0] : centroid3(base);
  return [...base, add3(apexBase, v3(0, 0, h))];
}

/** Usual names of the vertices: A, B, C, D… then S or A′, B′… */
export function solidNames(s: Pick<Solid3Spec, 'kind' | 'n'>): string[] {
  const n = s.kind === 'tetra' ? 3 : s.kind === 'pyramidReg' || s.kind === 'prismReg' ? Math.max(3, Math.min(8, Math.round(s.n))) : s.n === 3 ? 3 : 4;
  const base = 'ABCDEFGH'.slice(0, n).split('');
  if (s.kind === 'prism' || s.kind === 'box' || s.kind === 'prismReg') return [...base, ...base.map((b) => `${b}′`)];
  return [...base, s.kind === 'tetra' ? 'D' : 'S'];
}
