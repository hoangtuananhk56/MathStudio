/** Computes the current value (coordinates) of every object of a construction. */
import { compileExpression } from './expr';
import type { Construction, Def, Id, SolidKind, Transform } from './model';
import {
  add3,
  centroid3,
  clipLine,
  convexHull,
  edgePieces,
  footOnLine,
  footOnPlane,
  lerp3,
  linePlane,
  lineLine3,
  planeOf,
  planePlane,
  project,
  section,
  segmentPieces,
  solidVertices,
  sub3,
  type Piece,
  type Polyhedron,
  type Vec3,
  type View3,
} from './space';

/** A horizontal circle seen in perspective: the half behind (top half on screen) may be hidden. */
export interface SolidEllipse {
  c: Vec;
  rx: number;
  ry: number;
  backHidden: boolean;
}

export interface Vec {
  x: number;
  y: number;
}

export type StraightKind = 'line' | 'segment' | 'ray' | 'vector';

export type Value =
  /** A point; `p3` is its place in space for solid geometry (p is then where it is drawn). */
  | { k: 'point'; p: Vec; p3?: Vec3 }
  /** Infinite line / segment / ray / vector through `a` towards `b` (d = unit direction). */
  | { k: 'straight'; kind: StraightKind; a: Vec; b: Vec; d: Vec }
  | { k: 'circle'; c: Vec; r: number }
  /** Arc / sector from angle a0 counter-clockwise to a1 (radians). */
  | { k: 'arc'; c: Vec; r: number; a0: number; a1: number; sector: boolean }
  | { k: 'polygon'; pts: Vec[] }
  /** Angle mark at vertex v from direction a0 counter-clockwise to a1 (the non-reflex angle). */
  | { k: 'angle'; v: Vec; a0: number; a1: number; deg: number; side: number }
  | { k: 'text'; p: Vec; text: string; latex: boolean }
  /** Equal parts of a shape; `filled` lists the coloured ones. */
  | { k: 'fraction'; parts: Vec[][]; filled: number[] }
  /** Number line: `o` is where `from` sits; one step is `unit` cm. */
  | { k: 'numberLine'; o: Vec; from: number; to: number; step: number; unit: number; marks: number[] }
  /** A solid in oblique projection: its vertices, edges (hidden ones dashed) and ellipses. */
  | { k: 'solid'; kind: SolidKind; verts: Vec[]; edges: { a: number; b: number; hidden: boolean }[]; ellipses: SolidEllipse[]; circles: { c: Vec; r: number }[] }
  | { k: 'function'; f: (x: number) => number; from?: number; to?: number }
  /** A 3D solid: its vertices (drawn and in space), its faces, its edges cut into seen / hidden pieces. */
  | { k: 'solid3'; verts: Vec[]; v3: Vec3[]; hull: Polyhedron; edges: Piece[][] }
  /** A segment in space (also a drawn line where two planes meet), cut into seen / hidden pieces. */
  | { k: 'seg3'; a: Vec; b: Vec; a3: Vec3; b3: Vec3; pieces: Piece[] }
  /** A section of a solid: its corners (drawn and in space) and its sides cut into pieces. */
  | { k: 'section3'; pts: Vec[]; pts3: Vec3[]; pieces: Piece[] };

/** Solid geometry while evaluating: how the scene is drawn, and the solids so far (they hide things). */
interface Scene {
  view: View3;
  /** The first solid sets the pivot of the turn. */
  pivotSet: boolean;
  solids: Polyhedron[];
}

export type Values = Map<Id, Value | null>;

const EPS = 1e-9;

/* ------------------------------ vector helpers ----------------------------- */

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => len(sub(a, b));
export const unit = (a: Vec): Vec => {
  const l = len(a);
  return l < EPS ? { x: 1, y: 0 } : mul(a, 1 / l);
};
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });
export const angleOf = (a: Vec): number => Math.atan2(a.y, a.x);
const rotate = (p: Vec, c: Vec, rad: number): Vec => {
  const v = sub(p, c);
  return add(c, { x: v.x * Math.cos(rad) - v.y * Math.sin(rad), y: v.x * Math.sin(rad) + v.y * Math.cos(rad) });
};
/** Angle normalised to [0, 2π). */
export const norm = (a: number): number => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

function straight(kind: StraightKind, a: Vec, b: Vec): Value | null {
  if (dist(a, b) < EPS) return null;
  return { k: 'straight', kind, a, b, d: unit(sub(b, a)) };
}

/** Parameter t of the projection of p on the straight object (0 at a, len at b). */
function along(s: { a: Vec; d: Vec }, p: Vec): number {
  return dot(sub(p, s.a), s.d);
}

/** Whether a point lying on the carrier line is inside the segment / ray. */
function onStraight(s: Extract<Value, { k: 'straight' }>, p: Vec): boolean {
  const t = along(s, p);
  if (s.kind === 'line') return true;
  if (t < -1e-7) return false;
  if (s.kind === 'ray') return true;
  return t <= dist(s.a, s.b) + 1e-7;
}

function onArc(a: Extract<Value, { k: 'arc' }>, p: Vec): boolean {
  const ang = norm(angleOf(sub(p, a.c)) - a.a0);
  return ang <= norm(a.a1 - a.a0) + 1e-7;
}

/* ------------------------------- intersections ------------------------------ */

type Curve = { kind: 'straight'; v: Extract<Value, { k: 'straight' }> } | { kind: 'round'; c: Vec; r: number; arc?: Extract<Value, { k: 'arc' }> };

function asCurve(v: Value | null): Curve | null {
  if (!v) return null;
  if (v.k === 'straight') return { kind: 'straight', v };
  if (v.k === 'circle') return { kind: 'round', c: v.c, r: v.r };
  if (v.k === 'arc') return { kind: 'round', c: v.c, r: v.r, arc: v };
  return null;
}

function lineLine(a: Extract<Value, { k: 'straight' }>, b: Extract<Value, { k: 'straight' }>): Vec[] {
  const den = cross(a.d, b.d);
  if (Math.abs(den) < EPS) return [];
  const t = cross(sub(b.a, a.a), b.d) / den;
  return [add(a.a, mul(a.d, t))];
}

function lineCircle(s: Extract<Value, { k: 'straight' }>, c: Vec, r: number): Vec[] {
  const t0 = along(s, c);
  const foot = add(s.a, mul(s.d, t0));
  const h = dist(foot, c);
  if (h > r + 1e-9) return [];
  const w = Math.sqrt(Math.max(0, r * r - h * h));
  return w < 1e-9 ? [foot] : [add(foot, mul(s.d, -w)), add(foot, mul(s.d, w))];
}

function circleCircle(c1: Vec, r1: number, c2: Vec, r2: number): Vec[] {
  const d = dist(c1, c2);
  if (d < EPS || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const u = unit(sub(c2, c1));
  const m = add(c1, mul(u, a));
  return h < 1e-9 ? [m] : [add(m, mul(perp(u), h)), add(m, mul(perp(u), -h))];
}

export function intersect(va: Value | null, vb: Value | null): Vec[] {
  const a = asCurve(va);
  const b = asCurve(vb);
  if (!a || !b) return [];
  let pts: Vec[];
  if (a.kind === 'straight' && b.kind === 'straight') pts = lineLine(a.v, b.v);
  else if (a.kind === 'straight' && b.kind === 'round') pts = lineCircle(a.v, b.c, b.r);
  else if (a.kind === 'round' && b.kind === 'straight') pts = lineCircle(b.v, a.c, a.r);
  else pts = circleCircle((a as { c: Vec }).c, (a as { r: number }).r, (b as { c: Vec }).c, (b as { r: number }).r);
  const keep = (c: Curve, p: Vec) => (c.kind === 'straight' ? onStraight(c.v, p) : !c.arc || onArc(c.arc, p));
  return pts.filter((p) => keep(a, p) && keep(b, p));
}

/* ------------------------------ transformations ----------------------------- */

function transformPoint(p: Vec, tr: Transform, values: Values): Vec | null {
  const get = (id: Id) => values.get(id) ?? null;
  switch (tr.k) {
    case 'reflectLine': {
      const l = get(tr.line);
      if (!l || l.k !== 'straight') return null;
      const foot = add(l.a, mul(l.d, along(l, p)));
      return sub(mul(foot, 2), p);
    }
    case 'reflectPoint': {
      const c = get(tr.center);
      return c?.k === 'point' ? sub(mul(c.p, 2), p) : null;
    }
    case 'rotate': {
      const c = get(tr.center);
      return c?.k === 'point' ? rotate(p, c.p, (tr.deg * Math.PI) / 180) : null;
    }
    case 'translate': {
      const v = get(tr.vector);
      return v?.k === 'straight' ? add(p, sub(v.b, v.a)) : null;
    }
    case 'dilate': {
      const c = get(tr.center);
      return c?.k === 'point' ? add(c.p, mul(sub(p, c.p), tr.factor)) : null;
    }
  }
}

function transformValue(v: Value | null, tr: Transform, values: Values): Value | null {
  if (!v) return null;
  const T = (p: Vec) => transformPoint(p, tr, values);
  switch (v.k) {
    case 'point': {
      const p = T(v.p);
      return p && { k: 'point', p };
    }
    case 'straight': {
      const a = T(v.a);
      const b = T(v.b);
      return a && b ? straight(v.kind, a, b) : null;
    }
    case 'circle': {
      const c = T(v.c);
      const edge = T(add(v.c, { x: v.r, y: 0 }));
      return c && edge ? { k: 'circle', c, r: dist(c, edge) } : null;
    }
    case 'polygon': {
      const pts = v.pts.map(T);
      return pts.every(Boolean) ? { k: 'polygon', pts: pts as Vec[] } : null;
    }
    default:
      return null;
  }
}

/* ------------------------------ triangle centres ----------------------------- */

function circumcenter(a: Vec, b: Vec, c: Vec): Vec | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < EPS) return null;
  const sq = (p: Vec) => p.x * p.x + p.y * p.y;
  return {
    x: (sq(a) * (b.y - c.y) + sq(b) * (c.y - a.y) + sq(c) * (a.y - b.y)) / d,
    y: (sq(a) * (c.x - b.x) + sq(b) * (a.x - c.x) + sq(c) * (b.x - a.x)) / d,
  };
}

/** Incentre and inradius of triangle abc. */
function incircle(a: Vec, b: Vec, c: Vec): { c: Vec; r: number } | null {
  const la = dist(b, c);
  const lb = dist(a, c);
  const lc = dist(a, b);
  const per = la + lb + lc;
  const area = Math.abs(cross(sub(b, a), sub(c, a))) / 2;
  if (per < EPS || area < EPS) return null;
  return { c: mul(add(add(mul(a, la), mul(b, lb)), mul(c, lc)), 1 / per), r: (2 * area) / per };
}

/** Builds an angle value from two ray directions at v, as the non-reflex angle unless `reflex`. */
function angleValue(v: Vec, d0: Vec, d1: Vec, reflex = false): Value {
  // Length of the shorter side, so the mark can shrink to fit inside short sides.
  const side = Math.min(len(d0), len(d1));
  let a0 = angleOf(d0);
  let a1 = angleOf(d1);
  if (norm(a1 - a0) > Math.PI) [a0, a1] = [a1, a0];
  if (reflex) [a0, a1] = [a1, a0];
  return { k: 'angle', v, a0, a1, deg: (norm(a1 - a0) * 180) / Math.PI, side };
}

/* --------------------------------- fractions --------------------------------- */

/** Splits a circle or polygon into equal parts (see the `fraction` definition). */
export function fractionParts(base: Value, n: number, rows = 1): Vec[][] | null {
  n = Math.max(1, Math.min(60, Math.round(n)));
  rows = Math.max(1, Math.min(20, Math.round(rows)));
  if (base.k === 'circle') {
    // sectors from the top, clockwise, as pies are drawn in textbooks
    const steps = Math.max(4, Math.ceil(96 / n));
    const parts: Vec[][] = [];
    for (let i = 0; i < n; i++) {
      const pts: Vec[] = [base.c];
      for (let k = 0; k <= steps; k++) {
        const a = Math.PI / 2 - (2 * Math.PI * (i + k / steps)) / n;
        pts.push(add(base.c, { x: base.r * Math.cos(a), y: base.r * Math.sin(a) }));
      }
      parts.push(pts);
    }
    return parts;
  }
  if (base.k !== 'polygon' || base.pts.length < 3) return null;
  const P = base.pts;
  const lerp = (a: Vec, b: Vec, t: number) => add(a, mul(sub(b, a), t));
  if (P.length === 4) {
    // n columns × rows rows over the quadrilateral ABCD (equal for parallelograms)
    const at = (u: number, v: number) => lerp(lerp(P[0], P[1], u), lerp(P[3], P[2], u), v);
    const parts: Vec[][] = [];
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < n; i++) {
        parts.push([at(i / n, r / rows), at((i + 1) / n, r / rows), at((i + 1) / n, (r + 1) / rows), at(i / n, (r + 1) / rows)]);
      }
    }
    return parts;
  }
  if (P.length === 3) {
    // slices from the third vertex to equal pieces of the opposite side: equal areas
    return Array.from({ length: n }, (_, i) => [P[2], lerp(P[0], P[1], i / n), lerp(P[0], P[1], (i + 1) / n)]);
  }
  // other polygons: slices from the centre cutting the perimeter into equal lengths
  const g = mul(P.reduce((acc, q) => add(acc, q), { x: 0, y: 0 }), 1 / P.length);
  const edges = P.map((q, i) => ({ a: q, b: P[(i + 1) % P.length], l: dist(q, P[(i + 1) % P.length]) }));
  const total = edges.reduce((acc, e) => acc + e.l, 0);
  const pointAt = (s: number): { p: Vec; edge: number } => {
    let rest = s;
    for (let i = 0; i < edges.length; i++) {
      if (rest <= edges[i].l + 1e-12 || i === edges.length - 1) return { p: lerp(edges[i].a, edges[i].b, Math.min(1, rest / (edges[i].l || 1))), edge: i };
      rest -= edges[i].l;
    }
    return { p: P[0], edge: 0 };
  };
  const parts: Vec[][] = [];
  for (let i = 0; i < n; i++) {
    const s0 = pointAt((total * i) / n);
    const s1 = pointAt((total * (i + 1)) / n);
    const pts = [g, s0.p];
    for (let e = s0.edge; e !== s1.edge; e = (e + 1) % edges.length) pts.push(edges[e].b);
    pts.push(s1.p);
    parts.push(pts);
  }
  return parts;
}

/** Whether p is inside the polygon (even–odd rule). */
export function insidePolygon(pts: Vec[], p: Vec): boolean {
  let on = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) on = !on;
  }
  return on;
}

/* ----------------------------------- solids ----------------------------------- */

/** Depth direction of the oblique projection used in textbooks: 45°, shortened by half. */
export const DEPTH: Vec = { x: 0.5 * Math.SQRT1_2, y: 0.5 * Math.SQRT1_2 };

/**
 * Vertices, edges and ellipses of a solid with its front-left-bottom corner (box shapes) or
 * the centre of its base (round shapes) at `at`. Vertex order follows textbook names:
 * cuboid ABCD.A′B′C′D′ (A front-left, D behind A), pyramids S.ABCD / S.ABC, prism ABC.A′B′C′,
 * cylinder O, O′; cone O, S; sphere O.
 */
export function solidShape(kind: SolidKind, at: Vec, w: number, d: number, h: number, apexOverA = false): Extract<Value, { k: 'solid' }> {
  const dv = mul(DEPTH, d);
  const up = (p: Vec, k = h) => add(p, { x: 0, y: k });
  const E = (a: number, b: number, hidden = false) => ({ a, b, hidden });
  const base: Extract<Value, { k: 'solid' }> = { k: 'solid', kind, verts: [], edges: [], ellipses: [], circles: [] };
  switch (kind) {
    case 'cube':
    case 'cuboid': {
      const A = at;
      const B = add(A, { x: w, y: 0 });
      const C = add(B, dv);
      const D = add(A, dv);
      base.verts = [A, B, C, D, up(A), up(B), up(C), up(D)];
      base.edges = [E(0, 1), E(1, 2), E(2, 3, true), E(3, 0, true), E(4, 5), E(5, 6), E(6, 7), E(7, 4), E(0, 4), E(1, 5), E(2, 6), E(3, 7, true)];
      return base;
    }
    case 'pyramid4': {
      const A = at;
      const B = add(A, { x: w, y: 0 });
      const C = add(B, dv);
      const D = add(A, dv);
      // S above the centre (regular pyramid) or right above A (SA ⊥ base)
      const S = apexOverA ? up(A) : up(mul(add(A, C), 0.5));
      base.verts = [A, B, C, D, S];
      base.edges = [E(0, 1), E(1, 2), E(2, 3, true), E(3, 0, true), E(4, 0), E(4, 1), E(4, 2), E(4, 3, !apexOverA)];
      return base;
    }
    case 'pyramid3':
    case 'prism3': {
      // B in front, A and C behind: the back edge AC is hidden
      const A = add(at, dv);
      const C = add(add(at, { x: w, y: 0 }), dv);
      const B = add(at, { x: w * 0.42, y: 0 });
      if (kind === 'prism3') {
        base.verts = [A, B, C, up(A), up(B), up(C)];
        base.edges = [E(0, 1), E(1, 2), E(2, 0, true), E(3, 4), E(4, 5), E(5, 3), E(0, 3), E(1, 4), E(2, 5)];
      } else {
        const S = apexOverA ? up(A) : up(mul(add(add(A, B), C), 1 / 3));
        base.verts = [A, B, C, S];
        base.edges = [E(0, 1), E(1, 2), E(2, 0, true), E(3, 0), E(3, 1), E(3, 2)];
      }
      return base;
    }
    case 'cylinder': {
      const r = w / 2;
      const O = at;
      const O2 = up(O);
      const ry = r * 0.32;
      base.verts = [O, O2, add(O, { x: -r, y: 0 }), add(O, { x: r, y: 0 }), add(O2, { x: -r, y: 0 }), add(O2, { x: r, y: 0 })];
      base.edges = [E(2, 4), E(3, 5), E(0, 1, true)];
      base.ellipses = [{ c: O, rx: r, ry, backHidden: true }, { c: O2, rx: r, ry, backHidden: false }];
      return base;
    }
    case 'cone': {
      const r = w / 2;
      const O = at;
      const S = up(O);
      base.verts = [O, S, add(O, { x: -r, y: 0 }), add(O, { x: r, y: 0 })];
      base.edges = [E(1, 2), E(1, 3), E(0, 1, true)];
      base.ellipses = [{ c: O, rx: r, ry: r * 0.32, backHidden: true }];
      return base;
    }
    case 'sphere': {
      const r = w / 2;
      base.verts = [at];
      base.circles = [{ c: at, r }];
      base.ellipses = [{ c: at, rx: r, ry: r * 0.3, backHidden: true }];
      return base;
    }
  }
}

/* ------------------------------ solid geometry ------------------------------ */

function seg3Value(a3: Vec3, b3: Vec3, scene: Scene): Value | null {
  return { k: 'seg3', a: project(a3, scene.view), b: project(b3, scene.view), a3, b3, pieces: segmentPieces(a3, b3, scene.solids, scene.view) };
}

/* --------------------------------- evaluate --------------------------------- */

function evaluate(def: Def, values: Values, scene: Scene): Value | null {
  const get = (id: Id) => values.get(id) ?? null;
  const p3 = (id: Id): Vec3 | null => {
    const v = get(id);
    return v?.k === 'point' && v.p3 ? v.p3 : null;
  };
  const point3 = (q: Vec3 | null): Value | null => (q && Number.isFinite(q.x + q.y + q.z) ? { k: 'point', p: project(q, scene.view), p3: q } : null);
  const pt = (id: Id): Vec | null => {
    const v = get(id);
    return v?.k === 'point' ? v.p : null;
  };
  switch (def.t) {
    case 'point':
      return { k: 'point', p: { x: def.x, y: def.y } };
    case 'pointOn': {
      const o = get(def.on);
      if (!o) return null;
      if (o.k === 'straight') {
        let t = def.param;
        if (o.kind !== 'line') t = Math.max(0, t);
        if (o.kind === 'segment' || o.kind === 'vector') t = Math.min(dist(o.a, o.b), t);
        return { k: 'point', p: add(o.a, mul(o.d, t)) };
      }
      if (o.k === 'circle' || o.k === 'arc') return { k: 'point', p: add(o.c, { x: o.r * Math.cos(def.param), y: o.r * Math.sin(def.param) }) };
      if (o.k === 'polygon') {
        // param = position along the perimeter
        const n = o.pts.length;
        let t = def.param;
        for (let i = 0; i < n * 4; i++) {
          const a = o.pts[i % n];
          const b = o.pts[(i + 1) % n];
          const l = dist(a, b);
          if (t <= l) return { k: 'point', p: add(a, mul(unit(sub(b, a)), t)) };
          t -= l;
        }
        return { k: 'point', p: o.pts[0] };
      }
      return null;
    }
    case 'midpoint': {
      const a = pt(def.a);
      const b = pt(def.b);
      return a && b ? { k: 'point', p: mul(add(a, b), 0.5) } : null;
    }
    case 'intersection': {
      const pts = intersect(get(def.a), get(def.b));
      const p = pts[Math.min(def.index, pts.length - 1)];
      return pts.length && p ? { k: 'point', p } : null;
    }
    case 'polyVertex': {
      const poly = get(def.poly);
      return poly?.k === 'polygon' && poly.pts[def.i] ? { k: 'point', p: poly.pts[def.i] } : null;
    }
    case 'pointPolar': {
      const c = pt(def.center);
      const rad = (def.deg * Math.PI) / 180;
      return c ? { k: 'point', p: add(c, { x: def.r * Math.cos(rad), y: def.r * Math.sin(rad) }) } : null;
    }
    case 'foot': {
      const p = pt(def.point);
      const l = get(def.line);
      if (!p || !l || l.k !== 'straight') return null;
      return { k: 'point', p: add(l.a, mul(l.d, along(l, p))) };
    }
    case 'center': {
      const a = pt(def.a);
      const b = pt(def.b);
      const c = pt(def.c);
      if (!a || !b || !c) return null;
      if (def.kind === 'centroid') return { k: 'point', p: mul(add(add(a, b), c), 1 / 3) };
      if (def.kind === 'incenter') {
        const ic = incircle(a, b, c);
        return ic ? { k: 'point', p: ic.c } : null;
      }
      const o = circumcenter(a, b, c);
      if (!o) return null;
      // Euler: H = A + B + C − 2O
      return { k: 'point', p: def.kind === 'circumcenter' ? o : sub(add(add(a, b), c), mul(o, 2)) };
    }
    case 'segment':
    case 'line':
    case 'ray':
    case 'vector': {
      const a = pt(def.a);
      const b = pt(def.b);
      return a && b ? straight(def.t, a, b) : null;
    }
    case 'perpendicular':
    case 'parallel': {
      const l = get(def.line);
      const p = pt(def.through);
      if (!l || l.k !== 'straight' || !p) return null;
      const d = def.t === 'parallel' ? l.d : perp(l.d);
      return straight('line', p, add(p, d));
    }
    case 'perpBisector': {
      const a = pt(def.a);
      const b = pt(def.b);
      if (!a || !b || dist(a, b) < EPS) return null;
      const m = mul(add(a, b), 0.5);
      return straight('line', m, add(m, perp(sub(b, a))));
    }
    case 'angleBisector': {
      const a = pt(def.a);
      const b = pt(def.b);
      const c = pt(def.c);
      if (!a || !b || !c) return null;
      const d = add(unit(sub(a, b)), unit(sub(c, b)));
      return len(d) < EPS ? straight('line', b, add(b, perp(unit(sub(a, b))))) : straight('line', b, add(b, d));
    }
    case 'tangent': {
      const c = get(def.circle);
      const p = pt(def.through);
      if (!c || (c.k !== 'circle' && c.k !== 'arc') || !p) return null;
      const d = dist(p, c.c);
      if (d < c.r - 1e-9) return null;
      if (Math.abs(d - c.r) < 1e-9) return straight('line', p, add(p, perp(sub(p, c.c))));
      // Tangent points: on the circle with diameter [O, P].
      const pts = circleCircle(c.c, c.r, mul(add(c.c, p), 0.5), d / 2);
      const t = pts[Math.min(def.index, pts.length - 1)];
      return t ? straight('line', p, t) : null;
    }
    case 'circle': {
      const c = pt(def.center);
      const t = pt(def.through);
      return c && t && dist(c, t) > EPS ? { k: 'circle', c, r: dist(c, t) } : null;
    }
    case 'circleR': {
      const c = pt(def.center);
      return c && def.r > 0 ? { k: 'circle', c, r: def.r } : null;
    }
    case 'circle3': {
      const a = pt(def.a);
      const b = pt(def.b);
      const c = pt(def.c);
      const o = a && b && c ? circumcenter(a, b, c) : null;
      return o && a ? { k: 'circle', c: o, r: dist(o, a) } : null;
    }
    case 'incircle': {
      const a = pt(def.a);
      const b = pt(def.b);
      const c = pt(def.c);
      const ic = a && b && c ? incircle(a, b, c) : null;
      return ic ? { k: 'circle', c: ic.c, r: ic.r } : null;
    }
    case 'arc':
    case 'sector': {
      const c = pt(def.center);
      const a = pt(def.a);
      const b = pt(def.b);
      if (!c || !a || !b || dist(c, a) < EPS) return null;
      return { k: 'arc', c, r: dist(c, a), a0: angleOf(sub(a, c)), a1: angleOf(sub(b, c)), sector: def.t === 'sector' };
    }
    case 'polygon': {
      const pts = def.pts.map(pt);
      return pts.every(Boolean) && pts.length >= 2 ? { k: 'polygon', pts: pts as Vec[] } : null;
    }
    case 'regularPolygon': {
      const a = pt(def.a);
      const b = pt(def.b);
      if (!a || !b || def.n < 3) return null;
      const pts = [a, b];
      const turn = (2 * Math.PI) / def.n;
      for (let i = 2; i < def.n; i++) pts.push(rotate(pts[i - 2], pts[i - 1], -(Math.PI - turn)));
      return { k: 'polygon', pts };
    }
    case 'angle': {
      const a = pt(def.a);
      const v = pt(def.b);
      const c = pt(def.c);
      if (!a || !v || !c || dist(a, v) < EPS || dist(c, v) < EPS) return null;
      return angleValue(v, sub(a, v), sub(c, v), def.reflex);
    }
    case 'angleLines': {
      const l1 = get(def.l1);
      const l2 = get(def.l2);
      if (!l1 || !l2 || l1.k !== 'straight' || l2.k !== 'straight') return null;
      const x = lineLine(l1, l2)[0];
      return x ? angleValue(x, mul(l1.d, def.s1 * 1e6), mul(l2.d, def.s2 * 1e6)) : null;
    }
    case 'image':
      return transformValue(get(def.of), def.tr, values);
    case 'numberLine':
      return { k: 'numberLine', o: { x: def.x, y: def.y }, from: def.from, to: def.to, step: def.step, unit: def.unit, marks: def.marks };
    case 'compassMark': {
      const c = pt(def.center);
      const t = pt(def.through);
      if (!c || !t || dist(c, t) < EPS) return null;
      const mid = angleOf(sub(t, c));
      const half = ((def.span ?? 24) * Math.PI) / 360;
      return { k: 'arc', c, r: dist(c, t), a0: mid - half, a1: mid + half, sector: false };
    }
    case 'solid': {
      const at = pt(def.at);
      return at && def.w > 0 && def.h > 0 ? solidShape(def.kind, at, def.w, def.d, def.h, def.apexOverA) : null;
    }
    case 'solidVertex': {
      const sv = get(def.solid);
      return sv?.k === 'solid' && sv.verts[def.i] ? { k: 'point', p: sv.verts[def.i] } : null;
    }
    case 'fraction': {
      const base = get(def.of);
      const parts = base ? fractionParts(base, def.n, def.rows) : null;
      return parts ? { k: 'fraction', parts, filled: def.filled } : null;
    }
    case 'solid3': {
      const at = pt(def.at);
      if (!at || def.w <= 0 || (def.kind !== 'tetra' && def.h <= 0)) return null;
      const vs = solidVertices({ ...def, x: at.x, y: at.y });
      if (!scene.pivotSet) {
        // the scene turns about the centre of the first solid
        scene.view = { ...scene.view, pivot: centroid3(vs) };
        scene.pivotSet = true;
      }
      const hull = convexHull(vs);
      const edges = edgePieces(hull, scene.solids, scene.view);
      scene.solids.push(hull);
      return { k: 'solid3', verts: vs.map((q) => project(q, scene.view)), v3: vs, hull, edges };
    }
    case 'v3': {
      const s3 = get(def.solid);
      return s3?.k === 'solid3' && s3.v3[def.i] ? point3(s3.v3[def.i]) : null;
    }
    case 'on3': {
      const a = p3(def.a);
      const b = p3(def.b);
      return a && b ? point3(lerp3(a, b, def.k)) : null;
    }
    case 'centroid3': {
      const ps = def.pts.map(p3);
      return ps.length && ps.every(Boolean) ? point3(centroid3(ps as Vec3[])) : null;
    }
    case 'cross3': {
      const [a, b, c, d] = [def.a, def.b, def.c, def.d].map(p3);
      return a && b && c && d ? point3(lineLine3(a, b, c, d)) : null;
    }
    case 'linePlane3': {
      const [a, b, q1, q2, q3] = [def.a, def.b, def.p, def.q, def.r].map(p3);
      const pl = q1 && q2 && q3 ? planeOf(q1, q2, q3) : null;
      return a && b && pl ? point3(linePlane(a, b, pl)) : null;
    }
    case 'foot3': {
      const p = p3(def.p);
      const a = p3(def.a);
      const b = p3(def.b);
      if (!p || !a || !b) return null;
      if (!def.c) return point3(footOnLine(p, a, b));
      const c = p3(def.c);
      const pl = c ? planeOf(a, b, c) : null;
      return pl ? point3(footOnPlane(p, pl)) : null;
    }
    case 'shift3': {
      const [p, a, b] = [def.p, def.a, def.b].map(p3);
      return p && a && b ? point3(add3(p, sub3(b, a))) : null;
    }
    case 'seg3': {
      const a = p3(def.a);
      const b = p3(def.b);
      return a && b ? seg3Value(a, b, scene) : null;
    }
    case 'planeLine3': {
      const ps = [def.a, def.b, def.c, def.d, def.e, def.f].map(p3);
      if (!ps.every(Boolean)) return null;
      const [a, b, c, d, e, f] = ps as Vec3[];
      const P = planeOf(a, b, c);
      const Q = planeOf(d, e, f);
      const l = P && Q ? planePlane(P, Q) : null;
      if (!l) return null;
      const [u, w] = clipLine(l.o, l.d, scene.solids);
      return seg3Value(u, w, scene);
    }
    case 'section3': {
      const s3 = get(def.solid);
      const [a, b, c] = [def.a, def.b, def.c].map(p3);
      const pl = a && b && c ? planeOf(a, b, c) : null;
      if (s3?.k !== 'solid3' || !pl) return null;
      const pts3 = section(s3.hull, pl);
      if (pts3.length < 3) return null;
      const pieces = pts3.flatMap((q, i) => segmentPieces(q, pts3[(i + 1) % pts3.length], scene.solids, scene.view));
      return { k: 'section3', pts: pts3.map((q) => project(q, scene.view)), pts3, pieces };
    }
    case 'secV3': {
      const sec = get(def.section);
      return sec?.k === 'section3' && sec.pts3[def.i] ? point3(sec.pts3[def.i]) : null;
    }
    case 'text':
      return { k: 'text', p: { x: def.x, y: def.y }, text: def.text, latex: !!def.latex };
    case 'function': {
      try {
        return { k: 'function', f: compileExpression(def.expr), from: def.from, to: def.to };
      } catch {
        return null;
      }
    }
  }
}

/** Evaluates every object in order (definitions only reference earlier objects). */
export function computeAll(c: Construction): Values {
  const values: Values = new Map();
  const scene: Scene = { view: { yaw: c.yaw3 ?? 0, pivot: { x: 0, y: 0, z: 0 } }, pivotSet: false, solids: [] };
  for (const o of c.objects) {
    let v: Value | null = null;
    try {
      v = evaluate(o.def, values, scene);
    } catch {
      v = null;
    }
    values.set(o.id, v);
  }
  return values;
}

/** Inverse of pointOn: the parameter for the position of `p` on object `v`. */
export function paramOn(v: Value, p: Vec): number {
  if (v.k === 'straight') return along(v, p);
  if (v.k === 'circle' || v.k === 'arc') return angleOf(sub(p, v.c));
  if (v.k === 'polygon') {
    // nearest point on the perimeter, as distance along it
    let best = 0;
    let bestD = Infinity;
    let acc = 0;
    for (let i = 0; i < v.pts.length; i++) {
      const a = v.pts[i];
      const b = v.pts[(i + 1) % v.pts.length];
      const l = dist(a, b);
      const t = Math.max(0, Math.min(l, dot(sub(p, a), unit(sub(b, a)))));
      const d = dist(p, add(a, mul(unit(sub(b, a)), t)));
      if (d < bestD) {
        bestD = d;
        best = acc + t;
      }
      acc += l;
    }
    return best;
  }
  return 0;
}

/** Distance from a world point to an object's drawn shape (for hit testing). */
export function distanceTo(v: Value, p: Vec): number {
  switch (v.k) {
    case 'point':
      return dist(v.p, p);
    case 'straight': {
      let t = along(v, p);
      if (v.kind !== 'line') t = Math.max(0, t);
      if (v.kind === 'segment' || v.kind === 'vector') t = Math.min(dist(v.a, v.b), t);
      return dist(p, add(v.a, mul(v.d, t)));
    }
    case 'circle':
      return Math.abs(dist(p, v.c) - v.r);
    case 'arc': {
      const onCurve = onArc(v, p) ? Math.abs(dist(p, v.c) - v.r) : Infinity;
      const ends = Math.min(
        dist(p, add(v.c, { x: v.r * Math.cos(v.a0), y: v.r * Math.sin(v.a0) })),
        dist(p, add(v.c, { x: v.r * Math.cos(v.a1), y: v.r * Math.sin(v.a1) })),
      );
      return Math.min(onCurve, ends);
    }
    case 'polygon': {
      let best = Infinity;
      for (let i = 0; i < v.pts.length; i++) {
        const s = straight('segment', v.pts[i], v.pts[(i + 1) % v.pts.length]);
        if (s) best = Math.min(best, distanceTo(s, p));
      }
      return best;
    }
    case 'angle':
      return dist(v.v, p) < 0.8 ? Math.abs(dist(v.v, p) - 0.5) : Infinity;
    case 'text':
      return dist(v.p, p);
    case 'fraction':
      return v.parts.some((q) => insidePolygon(q, p)) ? 0 : Infinity;
    case 'numberLine': {
      const end = add(v.o, { x: ((v.to - v.from) / v.step) * v.unit + 0.6, y: 0 });
      const s2 = straight('segment', v.o, end);
      return s2 ? distanceTo(s2, p) : Infinity;
    }
    case 'solid': {
      let best = Infinity;
      for (const e of v.edges) {
        const s2 = straight('segment', v.verts[e.a], v.verts[e.b]);
        if (s2) best = Math.min(best, distanceTo(s2, p));
      }
      for (const el of v.ellipses) {
        const q = { x: (p.x - el.c.x) / el.rx, y: (p.y - el.c.y) / el.ry };
        best = Math.min(best, Math.abs(Math.hypot(q.x, q.y) - 1) * Math.min(el.rx, el.ry));
      }
      for (const ci of v.circles) best = Math.min(best, Math.abs(dist(p, ci.c) - ci.r));
      return best;
    }
    case 'function': {
      const y = v.f(p.x);
      return Number.isFinite(y) ? Math.abs(y - p.y) : Infinity;
    }
    case 'solid3': {
      let best = Infinity;
      for (const [i, j] of v.hull.edges) {
        const s2 = straight('segment', v.verts[i], v.verts[j]);
        if (s2) best = Math.min(best, distanceTo(s2, p));
      }
      return best;
    }
    case 'seg3': {
      const s2 = straight('segment', v.a, v.b);
      return s2 ? distanceTo(s2, p) : dist(v.a, p);
    }
    case 'section3':
      return insidePolygon(v.pts, p) ? 0 : distanceTo({ k: 'polygon', pts: v.pts }, p);
  }
}
