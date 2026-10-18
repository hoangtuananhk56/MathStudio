/**
 * Editing operations on a construction, independent of the UI: moving whole
 * objects (by moving the free points they are built from), nudging, copy/paste,
 * picking objects inside a rectangle, and keeping intersections from jumping.
 */
import { computeAll, intersect, dist, type Values, type Vec } from './engine';
import { dependencies, isPointDef, type Construction, type GeoObject, type Id } from './model';
import { nextId, nextPointName, nextRayName } from './tools';

/** Objects whose own coordinates can be changed: free points and texts. */
export function isMovable(o: GeoObject): boolean {
  return o.def.t === 'point' || o.def.t === 'text' || o.def.t === 'numberLine';
}

/**
 * The free points (and texts) an object is built from, itself included. Moving them
 * all by the same vector moves the object rigidly (a segment, a triangle, a circle…).
 */
export function freeAncestors(c: Construction, ids: Iterable<Id>): Id[] {
  const byId = new Map(c.objects.map((o) => [o.id, o]));
  const seen = new Set<Id>();
  const out: Id[] = [];
  const visit = (id: Id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const o = byId.get(id);
    if (!o) return;
    if (isMovable(o)) out.push(id);
    for (const d of dependencies(o.def)) visit(d);
  };
  for (const id of ids) visit(id);
  return out;
}

/** Positions of the given movable objects (start of a drag). */
export function positionsOf(c: Construction, ids: Id[]): Map<Id, Vec> {
  const m = new Map<Id, Vec>();
  for (const o of c.objects) {
    if (ids.includes(o.id) && (o.def.t === 'point' || o.def.t === 'text' || o.def.t === 'numberLine')) m.set(o.id, { x: o.def.x, y: o.def.y });
  }
  return m;
}

/** Puts the movable objects at their start positions shifted by `delta`. */
export function translateFrom(c: Construction, start: Map<Id, Vec>, delta: Vec): Construction {
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return {
    ...c,
    objects: c.objects.map((o) => {
      const p = start.get(o.id);
      if (!p || (o.def.t !== 'point' && o.def.t !== 'text' && o.def.t !== 'numberLine')) return o;
      return { ...o, def: { ...o.def, x: r(p.x + delta.x), y: r(p.y + delta.y) } };
    }),
  };
}

/** Moves the given objects (through their free points) by `delta`. */
export function moveObjects(c: Construction, ids: Iterable<Id>, delta: Vec): Construction {
  const free = freeAncestors(c, ids);
  return translateFrom(c, positionsOf(c, free), delta);
}

export interface GroupTransform {
  /** degrees, counter-clockwise */
  rotate?: number;
  /** size factor */
  scale?: number;
  /** mirror left–right ('h') or top–bottom ('v') */
  flip?: 'h' | 'v';
}

/**
 * Turns, mirrors or resizes the selection about `centre`, through the free points (and
 * sizes) it is built from, so constructions keep their properties.
 */
export function transformObjects(c: Construction, ids: Iterable<Id>, tr: GroupTransform, centre: Vec): Construction {
  const free = new Set(freeAncestors(c, ids));
  // also the sized objects the selection depends on (circles with a radius, solids, polar points)
  const byId = new Map(c.objects.map((o) => [o.id, o]));
  const deps = new Set<Id>();
  const visit = (id: Id) => {
    if (deps.has(id)) return;
    deps.add(id);
    const o = byId.get(id);
    if (o) for (const d of dependencies(o.def)) visit(d);
  };
  for (const id of ids) visit(id);
  const values = computeAll(c);
  const k = tr.scale ?? 1;
  const a = ((tr.rotate ?? 0) * Math.PI) / 180;
  const map = (p: Vec): Vec => {
    let x = p.x - centre.x;
    let y = p.y - centre.y;
    if (tr.flip === 'h') x = -x;
    if (tr.flip === 'v') y = -y;
    const rx = (x * Math.cos(a) - y * Math.sin(a)) * k;
    const ry = (x * Math.sin(a) + y * Math.cos(a)) * k;
    return { x: Math.round((centre.x + rx) * 1000) / 1000, y: Math.round((centre.y + ry) * 1000) / 1000 };
  };
  const turnDeg = (deg: number) => {
    let d = deg;
    if (tr.flip === 'h') d = 180 - d;
    if (tr.flip === 'v') d = -d;
    return Math.round((d + (tr.rotate ?? 0)) * 100) / 100;
  };
  return {
    ...c,
    objects: c.objects.map((o) => {
      const d = o.def;
      if (free.has(o.id) && (d.t === 'point' || d.t === 'text' || d.t === 'numberLine')) {
        const q = map({ x: d.x, y: d.y });
        return d.t === 'numberLine' ? { ...o, def: { ...d, ...q, unit: Math.round(d.unit * k * 1000) / 1000 } } : { ...o, def: { ...d, ...q } };
      }
      if (!deps.has(o.id)) return o;
      if (d.t === 'pointPolar') return { ...o, def: { ...d, r: d.r * k, deg: turnDeg(d.deg) } };
      if (d.t === 'pointOn') {
        const host = values.get(d.on);
        if (host?.k === 'circle' || host?.k === 'arc') return { ...o, def: { ...d, param: (turnDeg((d.param * 180) / Math.PI) * Math.PI) / 180 } };
        return { ...o, def: { ...d, param: d.param * k } };
      }
      if (d.t === 'circleR') return { ...o, def: { ...d, r: d.r * k } };
      if (d.t === 'solid') return { ...o, def: { ...d, w: d.w * k, d: d.d * k, h: d.h * k } };
      if (d.t === 'segment' || d.t === 'line' || d.t === 'ray') {
        const ext = o.style.extent;
        return Array.isArray(ext) ? { ...o, style: { ...o.style, extent: [ext[0] * k, ext[1] * k] as [number, number] } } : o;
      }
      return o;
    }),
  };
}

/** Visible objects lying entirely inside a world rectangle (rubber-band selection). */
export function objectsInRect(c: Construction, values: Values, a: Vec, b: Vec): Id[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const inside = (p: Vec) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  const out: Id[] = [];
  for (const o of c.objects) {
    const v = values.get(o.id);
    if (!v || o.style.hidden) continue;
    let ok = false;
    switch (v.k) {
      case 'point':
      case 'text':
        ok = inside(v.p);
        break;
      case 'straight':
        ok = inside(v.a) && inside(v.b);
        break;
      case 'circle':
        ok = inside({ x: v.c.x - v.r, y: v.c.y - v.r }) && inside({ x: v.c.x + v.r, y: v.c.y + v.r });
        break;
      case 'arc':
        ok = inside(v.c);
        break;
      case 'polygon':
        ok = v.pts.every(inside);
        break;
      case 'angle':
        ok = inside(v.v);
        break;
      case 'fraction':
        ok = v.parts.every((pp) => pp.every(inside));
        break;
      case 'numberLine':
        ok = inside(v.o) && inside({ x: v.o.x + ((v.to - v.from) / v.step) * v.unit, y: v.o.y });
        break;
      case 'solid':
        ok = v.verts.every(inside);
        break;
      default:
        ok = false;
    }
    if (ok) out.push(o.id);
  }
  return out;
}

/** The objects to copy: the selection and everything it is built from. */
export function copyClosure(c: Construction, ids: Iterable<Id>): GeoObject[] {
  const byId = new Map(c.objects.map((o) => [o.id, o]));
  const need = new Set<Id>();
  const visit = (id: Id) => {
    if (need.has(id) || !byId.has(id)) return;
    need.add(id);
    for (const d of dependencies(byId.get(id)!.def)) visit(d);
  };
  for (const id of ids) visit(id);
  // keep construction order so definitions still come after what they use
  return c.objects.filter((o) => need.has(o.id)).map((o) => structuredClone(o));
}

/**
 * Adds copies of `clip` to the construction, shifted by `offset`, with fresh ids and
 * names (A, B… for points, x, y… for ray ends). Returns the new ids of visible copies.
 */
export function pasteObjects(c: Construction, clip: GeoObject[], offset: Vec, keepNames = false): { c: Construction; ids: Id[] } {
  const map = new Map<Id, Id>();
  const taken = new Set<string>();
  const names = new Set<string>();
  const ren = (id: Id) => map.get(id) ?? id;
  const added: GeoObject[] = [];
  for (const src of clip) {
    const prefix = src.id.replace(/\d+$/, '') || 'o';
    const id = nextId(c, prefix, taken);
    taken.add(id);
    map.set(src.id, id);
  }
  for (const src of clip) {
    const def = renameDef(structuredClone(src.def), ren);
    if (def.t === 'point' || def.t === 'text' || def.t === 'numberLine') {
      def.x = Math.round((def.x + offset.x) * 1000) / 1000;
      def.y = Math.round((def.y + offset.y) * 1000) / 1000;
    }
    const style = { ...src.style };
    if (style.label && isPointDef(src.def) && !style.hidden) {
      // templates keep their names (O, H, M…) when they are still free
      const free = keepNames && !names.has(style.label) && !c.objects.some((o) => o.style.label === style.label);
      if (!free) style.label = style.dot === false ? nextRayName(c, names) : nextPointName(c, names);
      names.add(style.label);
    }
    added.push({ id: map.get(src.id)!, def, style });
  }
  return { c: { ...c, objects: [...c.objects, ...added] }, ids: added.filter((o) => !o.style.hidden).map((o) => o.id) };
}

function renameDef(def: GeoObject['def'], ren: (id: Id) => Id): GeoObject['def'] {
  const d = def as unknown as Record<string, unknown>;
  for (const k of ['a', 'b', 'c', 'on', 'poly', 'center', 'point', 'line', 'through', 'circle', 'l1', 'l2', 'of']) {
    if (typeof d[k] === 'string') d[k] = ren(d[k] as string);
  }
  if (def.t === 'polygon') def.pts = def.pts.map(ren);
  if (def.t === 'image') {
    const tr = def.tr as unknown as Record<string, unknown>;
    for (const k of ['line', 'center', 'vector']) if (typeof tr[k] === 'string') tr[k] = ren(tr[k] as string);
  }
  return def;
}

/**
 * While dragging, a line–circle or circle–circle intersection keeps the solution
 * nearest to where it was, instead of jumping to the other one.
 */
export function stabilizeIntersections(next: Construction, nextValues: Values, prev: Values): Construction {
  let changed = false;
  const objects = next.objects.map((o) => {
    if (o.def.t !== 'intersection') return o;
    const before = prev.get(o.id);
    if (before?.k !== 'point') return o;
    const pts = intersect(nextValues.get(o.def.a) ?? null, nextValues.get(o.def.b) ?? null);
    if (pts.length < 2) return o;
    const k: 0 | 1 = dist(pts[1], before.p) < dist(pts[0], before.p) ? 1 : 0;
    if (k === o.def.index) return o;
    changed = true;
    return { ...o, def: { ...o.def, index: k } };
  });
  return changed ? { ...next, objects } : next;
}
