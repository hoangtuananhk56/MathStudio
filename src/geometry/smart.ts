/**
 * "Smart" picking: one click where a child would point, instead of several picks in a
 * set order. Click inside an angle to mark it, on a segment to take its midpoint, on a
 * triangle (or near one of its vertices) to draw an altitude, a centroid…
 */
import { add, dist, mul, norm, sub, type Values, type Vec } from './engine';
import type { Construction, Id } from './model';
import type { ToolId } from './tools';

/** A side leaving a vertex: its direction and the point at its other end. */
interface Arm {
  dir: number;
  to: Id;
}

const pointOf = (values: Values, id: Id): Vec | null => {
  const v = values.get(id);
  return v?.k === 'point' ? v.p : null;
};

/** Sides (segments, rays, lines through two points, polygon edges) leaving point `v`. */
export function armsAt(c: Construction, values: Values, v: Id): Arm[] {
  const at = pointOf(values, v);
  if (!at) return [];
  const arms: Arm[] = [];
  const push = (to: Id) => {
    const q = pointOf(values, to);
    if (!q || dist(q, at) < 1e-9) return;
    const dir = Math.atan2(q.y - at.y, q.x - at.x);
    if (!arms.some((a) => Math.abs(norm(a.dir - dir)) < 1e-6 || Math.abs(norm(dir - a.dir)) < 1e-6)) arms.push({ dir, to });
  };
  for (const o of c.objects) {
    if (o.style.hidden || !values.get(o.id)) continue;
    const d = o.def;
    if (d.t === 'segment' || d.t === 'vector' || d.t === 'line') {
      if (d.a === v) push(d.b);
      if (d.b === v) push(d.a);
    } else if (d.t === 'ray') {
      if (d.a === v) push(d.b);
    } else if (d.t === 'polygon') {
      const i = d.pts.indexOf(v);
      if (i >= 0) {
        push(d.pts[(i + 1) % d.pts.length]);
        push(d.pts[(i - 1 + d.pts.length) % d.pts.length]);
      }
    } else if (d.t === 'regularPolygon') {
      // vertices of a regular polygon are polyVertex points (or the two picked ones)
      const poly = values.get(o.id);
      if (poly?.k !== 'polygon') continue;
      const ids = [d.a, d.b, ...c.objects.filter((x) => x.def.t === 'polyVertex' && x.def.poly === o.id).sort((p, q) => (p.def as { i: number }).i - (q.def as { i: number }).i).map((x) => x.id)];
      const i = ids.indexOf(v);
      if (i >= 0 && ids.length === poly.pts.length) {
        push(ids[(i + 1) % ids.length]);
        push(ids[(i - 1 + ids.length) % ids.length]);
      }
    }
  }
  return arms;
}

/**
 * The angle a click lands in: the nearest vertex (within `reach` cm) with at least two
 * sides, and the two sides on either side of the click. Returns the definition picks
 * (a, vertex, c) and whether it is the reflex angle.
 */
export function angleAtClick(c: Construction, values: Values, p: Vec, reach: number): { a: Id; b: Id; c: Id; reflex: boolean } | null {
  let best: { a: Id; b: Id; c: Id; reflex: boolean; d: number } | null = null;
  for (const o of c.objects) {
    if (o.style.hidden) continue;
    const at = pointOf(values, o.id);
    if (!at) continue;
    const d = dist(at, p);
    if (d > reach || d < 1e-6 || (best && d >= best.d)) continue;
    const arms = armsAt(c, values, o.id);
    if (arms.length < 2) continue;
    const t = Math.atan2(p.y - at.y, p.x - at.x);
    // the side just before the click (clockwise) and just after it (counter-clockwise)
    const before = arms.reduce((m, x) => (norm(t - x.dir) < norm(t - m.dir) ? x : m));
    const after = arms.reduce((m, x) => (norm(x.dir - t) < norm(m.dir - t) ? x : m));
    if (before.to === after.to) continue;
    const span = norm(after.dir - before.dir);
    best = { a: before.to, b: o.id, c: after.to, reflex: span > Math.PI + 1e-9, d };
  }
  return best && { a: best.a, b: best.b, c: best.c, reflex: best.reflex };
}

/** The two end points of the segment or polygon side under the click. */
export function sideAtClick(c: Construction, values: Values, p: Vec, tol: number): [Id, Id] | null {
  let best: { ends: [Id, Id]; d: number } | null = null;
  const consider = (a: Id, b: Id) => {
    const A = pointOf(values, a);
    const B = pointOf(values, b);
    if (!A || !B) return;
    const L = dist(A, B);
    if (L < 1e-9) return;
    const u = mul(sub(B, A), 1 / L);
    const t = Math.max(0, Math.min(L, (p.x - A.x) * u.x + (p.y - A.y) * u.y));
    const d = dist(p, add(A, mul(u, t)));
    if (d < tol && (!best || d < best.d)) best = { ends: [a, b], d };
  };
  for (const o of c.objects) {
    if (o.style.hidden || !values.get(o.id)) continue;
    const d = o.def;
    if (d.t === 'segment' || d.t === 'vector') consider(d.a, d.b);
    else if (d.t === 'polygon') d.pts.forEach((q, i) => consider(q, d.pts[(i + 1) % d.pts.length]));
  }
  return best ? (best as { ends: [Id, Id] }).ends : null;
}

function inside(pts: Vec[], p: Vec): boolean {
  let on = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) on = !on;
  }
  return on;
}

/** The triangle (polygon with 3 vertices) under the click: inside it, or within `tol` of it. */
export function triangleAtClick(c: Construction, values: Values, p: Vec, tol: number): [Id, Id, Id] | null {
  for (const o of [...c.objects].reverse()) {
    if (o.style.hidden || o.def.t !== 'polygon' || o.def.pts.length !== 3) continue;
    const pts = o.def.pts.map((id) => pointOf(values, id));
    if (pts.some((x) => !x)) continue;
    const ps = pts as Vec[];
    const near = ps.some((q, i) => {
      const r = ps[(i + 1) % 3];
      const L = dist(q, r);
      const t = Math.max(0, Math.min(L, ((p.x - q.x) * (r.x - q.x) + (p.y - q.y) * (r.y - q.y)) / L));
      return dist(p, add(q, mul(sub(r, q), t / L))) < tol;
    });
    if (inside(ps, p) || near) return o.def.pts as [Id, Id, Id];
  }
  return null;
}

/** Tools whose first click can complete all their picks. */
export const SMART_TOOLS: ToolId[] = [
  'angle', 'angleBisector', 'midpoint', 'perpBisector',
  'altitude', 'median', 'bisectorIn', 'midline', 'centroid', 'orthocenter', 'circumcircle', 'incircle',
  'baseHeight', 'altitudes3', 'medians3', 'bisectors3', 'diagonals', 'fraction', 'inscribedAngle',
];

/** The shape (polygon or circle, optionally only quadrilaterals) the click is inside; the smallest wins. */
export function shapeAtClick(c: Construction, values: Values, p: Vec, only?: 'quad' | 'circle'): Id | null {
  let best: { id: Id; area: number } | null = null;
  for (const o of c.objects) {
    if (o.style.hidden) continue;
    const v = values.get(o.id);
    let area = Infinity;
    if (v?.k === 'circle' && only !== 'quad' && dist(v.c, p) < v.r) area = Math.PI * v.r * v.r;
    else if (v?.k === 'polygon' && only !== 'circle' && (only !== 'quad' || (v.pts.length === 4 && o.def.t === 'polygon')) && inside(v.pts, p)) {
      area = Math.abs(v.pts.reduce((acc, q, i) => acc + q.x * v.pts[(i + 1) % v.pts.length].y - v.pts[(i + 1) % v.pts.length].x * q.y, 0)) / 2;
    }
    if (area < Infinity && (!best || area < best.area)) best = { id: o.id, area };
  }
  return best?.id ?? null;
}

/**
 * Completes the picks of `tool` from a single click at `p`, when the click is on the
 * thing the tool works on. `hitPoint` is the point under the click, if any. Returns null
 * to fall back to picking one object at a time.
 */
export function smartPicks(
  tool: ToolId, c: Construction, values: Values, p: Vec, hitPoint: Id | null, opts: { tol: number; reach: number },
): Id[] | null {
  switch (tool) {
    case 'angle':
    case 'angleBisector': {
      if (hitPoint) return null; // picking points one by one still works
      const a = angleAtClick(c, values, p, opts.reach);
      return a ? [a.a, a.b, a.c] : null;
    }
    case 'midpoint':
    case 'perpBisector': {
      if (hitPoint) return null;
      const s = sideAtClick(c, values, p, opts.tol);
      return s ? [s[0], s[1]] : null;
    }
    case 'altitude':
    case 'median':
    case 'bisectorIn':
    case 'midline': {
      // the vertex nearest the click, then the other two
      const tri = hitPoint
        ? c.objects.find((o) => !o.style.hidden && o.def.t === 'polygon' && o.def.pts.length === 3 && o.def.pts.includes(hitPoint))?.def
        : null;
      const pts = tri && tri.t === 'polygon' ? (tri.pts as [Id, Id, Id]) : triangleAtClick(c, values, p, opts.tol);
      if (!pts) return null;
      const v = hitPoint && pts.includes(hitPoint)
        ? hitPoint
        : pts.reduce((m, id) => (dist(pointOf(values, id)!, p) < dist(pointOf(values, m)!, p) ? id : m));
      return [v, ...pts.filter((x) => x !== v)];
    }
    case 'centroid':
    case 'orthocenter':
    case 'circumcircle':
    case 'incircle': {
      if (hitPoint) return null;
      return triangleAtClick(c, values, p, opts.tol);
    }
    case 'altitudes3':
    case 'medians3':
    case 'bisectors3':
      return triangleAtClick(c, values, p, opts.tol);
    case 'baseHeight': {
      if (hitPoint) return null;
      const side = sideAtClick(c, values, p, opts.tol);
      if (!side) return null;
      // a triangle side: the height comes from the third vertex; otherwise ask for the vertex
      const tri = c.objects.find((o) => !o.style.hidden && o.def.t === 'polygon' && o.def.pts.length === 3 && side.every((s) => (o.def as { pts: Id[] }).pts.includes(s)));
      const third = tri?.def.t === 'polygon' ? tri.def.pts.find((x) => !side.includes(x)) : undefined;
      return third ? [side[0], side[1], third] : [side[0], side[1]];
    }
    case 'diagonals': {
      const q = shapeAtClick(c, values, p, 'quad');
      return q ? [q] : null;
    }
    case 'fraction': {
      const q = shapeAtClick(c, values, p);
      return q ? [q] : null;
    }
    case 'inscribedAngle': {
      const q = shapeAtClick(c, values, p, 'circle');
      return q ? [q] : null;
    }
    default:
      return null;
  }
}
