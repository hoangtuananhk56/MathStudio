/** Angles, precise construction, snapping, triangle and quadrilateral tools. */
import { describe, expect, it } from 'vitest';
import { computeAll, type Value, type Values, type Vec } from '../src/geometry/engine';
import { emptyConstruction, type Construction, type Def, type GeoObject } from '../src/geometry/model';
import { formatAngle, renderConstruction } from '../src/geometry/render';
import { snapPoint } from '../src/geometry/snap';
import { createFromTool, parseNumbers, type ToolId } from '../src/geometry/tools';

const P = (x: number, y: number): Def => ({ t: 'point', x, y });

function withPoints(pts: [string, number, number][]): Construction {
  const c = emptyConstruction();
  c.objects = pts.map(([label, x, y], i): GeoObject => ({ id: `p${i + 1}`, def: P(x, y), style: { label } }));
  return c;
}

/** Runs a tool on a construction and returns the new construction and its values. */
function run(c: Construction, tool: ToolId, picks: string[], answer?: string, clicks?: Vec[]) {
  const r = createFromTool(c, tool, picks, answer, { values: computeAll(c), clicks });
  const next = { ...c, objects: [...c.objects, ...r.objects] };
  return { c: next, v: computeAll(next), objs: r.objects };
}

function point(v: Values, c: Construction, label: string): Vec {
  const o = c.objects.find((x) => x.style.label === label);
  const val = o && v.get(o.id);
  if (!val || val.k !== 'point') throw new Error(`no point ${label}`);
  return val.p;
}
const d = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const angleAt = (a: Vec, v: Vec, b: Vec) => {
  const u = { x: a.x - v.x, y: a.y - v.y };
  const w = { x: b.x - v.x, y: b.y - v.y };
  return (Math.acos((u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y))) * 180) / Math.PI;
};
const anglesOf = (v: Values) => [...v.values()].filter((x): x is Extract<Value, { k: 'angle' }> => x?.k === 'angle');

describe('engine: new objects', () => {
  it('triangle centres, incircle, projection and polar points', () => {
    const c = withPoints([['A', 0, 0], ['B', 4, 0], ['C', 0, 3]]);
    c.objects.push(
      { id: 'G', def: { t: 'center', kind: 'centroid', a: 'p1', b: 'p2', c: 'p3' }, style: {} },
      { id: 'H', def: { t: 'center', kind: 'orthocenter', a: 'p1', b: 'p2', c: 'p3' }, style: {} },
      { id: 'O', def: { t: 'center', kind: 'circumcenter', a: 'p1', b: 'p2', c: 'p3' }, style: {} },
      { id: 'I', def: { t: 'center', kind: 'incenter', a: 'p1', b: 'p2', c: 'p3' }, style: {} },
      { id: 'ic', def: { t: 'incircle', a: 'p1', b: 'p2', c: 'p3' }, style: {} },
      { id: 'bc', def: { t: 'line', a: 'p2', b: 'p3' }, style: {} },
      { id: 'F', def: { t: 'foot', point: 'p1', line: 'bc' }, style: {} },
      { id: 'Q', def: { t: 'pointPolar', center: 'p1', r: 2, deg: 90 }, style: {} },
    );
    const v = computeAll(c);
    const get = (id: string) => (v.get(id) as Extract<Value, { k: 'point' }>).p;
    expect(get('G').x).toBeCloseTo(4 / 3, 9);
    expect(get('G').y).toBeCloseTo(1, 9);
    expect(d(get('H'), { x: 0, y: 0 })).toBeCloseTo(0, 9); // right angle at A
    expect(get('O').x).toBeCloseTo(2, 9);
    expect(get('O').y).toBeCloseTo(1.5, 9);
    expect(get('I').x).toBeCloseTo(1, 9); // 3-4-5 triangle: r = 1
    const ic = v.get('ic') as Extract<Value, { k: 'circle' }>;
    expect(ic.r).toBeCloseTo(1, 9);
    expect(d(get('F'), { x: 1.44, y: 1.92 })).toBeCloseTo(0, 9);
    expect(get('Q').y).toBeCloseTo(2, 9);
  });

  it('reflex angles and the angle between two lines', () => {
    const c = withPoints([['A', 1, 0], ['O', 0, 0], ['B', 0, 1], ['X', -1, 1], ['Y', 1, 1]]);
    c.objects.push(
      { id: 'ang', def: { t: 'angle', a: 'p1', b: 'p2', c: 'p3', reflex: true }, style: {} },
      { id: 'l1', def: { t: 'line', a: 'p2', b: 'p4' }, style: {} }, // y = -x
      { id: 'l2', def: { t: 'line', a: 'p2', b: 'p5' }, style: {} }, // y = x
      { id: 'al', def: { t: 'angleLines', l1: 'l1', l2: 'l2', s1: 1, s2: 1 }, style: {} },
    );
    const v = computeAll(c);
    expect((v.get('ang') as Extract<Value, { k: 'angle' }>).deg).toBeCloseTo(270, 9);
    expect((v.get('al') as Extract<Value, { k: 'angle' }>).deg).toBeCloseTo(90, 9);
  });
});

describe('triangle tools', () => {
  const base = () => withPoints([['A', 0, 0], ['B', 4, 0]]);

  it('isosceles: apex on the perpendicular bisector, equal legs marked', () => {
    const { c, v, objs } = run(base(), 'triangleIso', ['p1', 'p2']);
    const C = point(v, c, 'C');
    expect(d(C, point(v, c, 'A'))).toBeCloseTo(d(C, point(v, c, 'B')), 9);
    expect(objs.filter((o) => o.style.ticks === 1)).toHaveLength(2);
  });

  it('right and right-isosceles triangles have a right angle at A', () => {
    for (const tool of ['triangleRight', 'triangleRightIso'] as const) {
      const { c, v } = run(base(), tool, ['p1', 'p2']);
      expect(angleAt(point(v, c, 'B'), point(v, c, 'A'), point(v, c, 'C'))).toBeCloseTo(90, 9);
      expect(anglesOf(v).some((a) => Math.abs(a.deg - 90) < 1e-9)).toBe(true);
    }
  });

  it('triangle from three sides, and impossible sides are rejected', () => {
    const c0 = withPoints([['A', 0, 0]]);
    const { c, v } = run(c0, 'triangleSSS', ['p1'], '5; 4; 3');
    const [A, B, C] = ['A', 'B', 'C'].map((l) => point(v, c, l));
    expect(d(B, C)).toBeCloseTo(5, 9);
    expect(d(C, A)).toBeCloseTo(4, 9);
    expect(d(A, B)).toBeCloseTo(3, 9);
    expect(() => run(c0, 'triangleSSS', ['p1'], '1; 2; 10')).toThrow(/bất đẳng thức tam giác/);
  });

  const tri = () => withPoints([['A', 1, 3], ['B', 0, 0], ['C', 5, 0]]);

  it('altitude: foot on BC, AH ⟂ BC, with a right-angle mark', () => {
    const { c, v } = run(tri(), 'altitude', ['p1', 'p2', 'p3']);
    const H = point(v, c, 'D');
    expect(H.y).toBeCloseTo(0, 9);
    expect(H.x).toBeCloseTo(1, 9);
    expect(anglesOf(v).some((a) => Math.abs(a.deg - 90) < 1e-9)).toBe(true);
  });

  it('median ends at the midpoint, bisector splits the angle equally, midline is parallel', () => {
    const m = run(tri(), 'median', ['p1', 'p2', 'p3']);
    expect(point(m.v, m.c, 'D').x).toBeCloseTo(2.5, 9);
    const b = run(tri(), 'bisectorIn', ['p1', 'p2', 'p3']);
    const [a1, a2] = anglesOf(b.v);
    expect(a1.deg).toBeCloseTo(a2.deg, 9);
    const ml = run(tri(), 'midline', ['p1', 'p2', 'p3']);
    const M = point(ml.v, ml.c, 'D');
    const N = point(ml.v, ml.c, 'E');
    expect(M.y).toBeCloseTo(N.y, 9); // parallel to BC (horizontal)
  });

  it('centroid / orthocentre / circumcircle / incircle use conventional names', () => {
    expect(run(tri(), 'centroid', ['p1', 'p2', 'p3']).objs[0].style.label).toBe('G');
    expect(run(tri(), 'orthocenter', ['p1', 'p2', 'p3']).objs[0].style.label).toBe('H');
    expect(run(tri(), 'circumcircle', ['p1', 'p2', 'p3']).objs[0].style.label).toBe('O');
    expect(run(tri(), 'incircle', ['p1', 'p2', 'p3']).objs[0].style.label).toBe('I');
  });
});

describe('quadrilateral tools', () => {
  const ab = () => withPoints([['A', 0, 0], ['B', 4, 0]]);

  it('rectangle has four right angles and keeps them when D is dragged', () => {
    const r = run(ab(), 'rectangle', ['p1', 'p2']);
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((l) => point(r.v, r.c, l));
    for (const [x, y, z] of [[D, A, B], [A, B, C], [B, C, D], [C, D, A]]) expect(angleAt(x, y, z)).toBeCloseTo(90, 9);
    // drag D along its hidden perpendicular
    const dObj = r.c.objects.find((o) => o.style.label === 'D')!;
    const moved = { ...r.c, objects: r.c.objects.map((o) => (o.id === dObj.id && o.def.t === 'pointOn' ? { ...o, def: { ...o.def, param: 7 } } : o)) };
    const v2 = computeAll(moved);
    expect(angleAt(point(v2, moved, 'A'), point(v2, moved, 'B'), point(v2, moved, 'C'))).toBeCloseTo(90, 9);
  });

  it('parallelogram, rhombus, trapezoids', () => {
    const pg = run(withPoints([['A', 0, 0], ['B', 4, 0], ['C', 5, 2]]), 'parallelogram', ['p1', 'p2', 'p3']);
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((l) => point(pg.v, pg.c, l));
    expect(d(A, B)).toBeCloseTo(d(D, C), 9);
    expect(d(A, D)).toBeCloseTo(d(B, C), 9);

    const rh = run(ab(), 'rhombus', ['p1', 'p2']);
    const R = ['A', 'B', 'C', 'D'].map((l) => point(rh.v, rh.c, l));
    for (let i = 0; i < 4; i++) expect(d(R[i], R[(i + 1) % 4])).toBeCloseTo(4, 9);

    const tz = run(withPoints([['A', 0, 0], ['B', 6, 0], ['C', 5, 3]]), 'trapezoid', ['p1', 'p2', 'p3']);
    expect(point(tz.v, tz.c, 'D').y).toBeCloseTo(3, 9); // CD ∥ AB

    const ti = run(withPoints([['A', 0, 0], ['B', 6, 0], ['C', 5, 3]]), 'trapezoidIso', ['p1', 'p2', 'p3']);
    const [IA, IB, IC, ID] = ['A', 'B', 'C', 'D'].map((l) => point(ti.v, ti.c, l));
    expect(d(IA, ID)).toBeCloseTo(d(IB, IC), 9);

    const tr = run(ab(), 'trapezoidRight', ['p1', 'p2']);
    const [TA, TB, TC, TD] = ['A', 'B', 'C', 'D'].map((l) => point(tr.v, tr.c, l));
    expect(angleAt(TB, TA, TD)).toBeCloseTo(90, 9);
    expect(TC.y).toBeCloseTo(TD.y, 9);
  });
});

describe('angle tools', () => {
  it('angle with a given size', () => {
    const r = run(withPoints([['A', 3, 0], ['O', 0, 0]]), 'angleFixed', ['p1', 'p2'], '60');
    const ang = anglesOf(r.v)[0];
    expect(ang.deg).toBeCloseTo(60, 9);
  });

  it('angle between lines takes the sides that were clicked', () => {
    const c0 = withPoints([['O', 0, 0], ['X', 1, 0], ['Y', 0, 1]]);
    c0.objects.push({ id: 'lx', def: { t: 'line', a: 'p1', b: 'p2' }, style: {} }, { id: 'ly', def: { t: 'line', a: 'p1', b: 'p3' }, style: {} });
    // clicking the negative x side and the positive y side
    const r = run(c0, 'angleLines', ['lx', 'ly'], undefined, [{ x: -2, y: 0 }, { x: 0, y: 2 }]);
    const a = anglesOf(r.v)[0];
    expect(a.deg).toBeCloseTo(90, 9);
    const mid = a.a0 + ((a.a1 - a.a0 + 2 * Math.PI) % (2 * Math.PI)) / 2;
    expect(Math.cos(mid)).toBeLessThan(0); // the mark sits in the upper-left quadrant
    expect(Math.sin(mid)).toBeGreaterThan(0);
  });

  it('equal marks on angles cycle through arcs and strokes', () => {
    let c = withPoints([['A', 1, 0], ['O', 0, 0], ['B', 0, 1]]);
    c = run(c, 'angle', ['p1', 'p2', 'p3']).c;
    const id = c.objects[c.objects.length - 1].id;
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = createFromTool(c, 'equalMark', [id]).restyle![0];
      c = { ...c, objects: c.objects.map((o) => (o.id === id ? { ...o, style: { ...o.style, ...r.style } } : o)) };
      const st = c.objects.find((o) => o.id === id)!.style;
      seen.push(`${st.arcs}/${st.arcTicks}`);
    }
    expect(seen).toEqual(['2/0', '3/0', '1/1', '1/2', '1/3', '1/0']);
  });
});

describe('angle rendering', () => {
  it('formats sizes as whole degrees, degrees-minutes or decimals', () => {
    expect(formatAngle(46.85, 'int', 'vn')).toBe('47°');
    expect(formatAngle(46.85, 'dms', 'vn')).toBe('46°51′');
    expect(formatAngle(46.85, 'decimal', 'vn')).toBe('46,9°');
    expect(formatAngle(59.9999, 'dms', 'vn')).toBe('60°');
  });

  it('shows a right-angle square for an angle within 0.05° of 90°', () => {
    const c = withPoints([['A', 1, 0], ['O', 0, 0], ['B', 0.0005, 1]]); // 89.97°
    c.objects.push({ id: 'ang', def: { t: 'angle', a: 'p1', b: 'p2', c: 'p3' }, style: {} });
    const svg = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 }).svg;
    expect(svg).not.toMatch(/A[\d.]+ [\d.]+ 0 0 0/); // no arc command → square corner
  });

  it('adjacent angles keep one radius; overlapping angles are stacked', () => {
    const c = withPoints([['A', 2, 0], ['O', 0, 0], ['B', 1.4, 1.4], ['C', -1, 2]]);
    c.objects.push(
      { id: 'a1', def: { t: 'angle', a: 'p1', b: 'p2', c: 'p3' }, style: {} },
      { id: 'a2', def: { t: 'angle', a: 'p3', b: 'p2', c: 'p4' }, style: {} }, // adjacent
      { id: 'a3', def: { t: 'angle', a: 'p1', b: 'p2', c: 'p4' }, style: { arcs: 1 } }, // overlaps both
    );
    const svg = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 }).svg;
    const radii = [...svg.matchAll(/A([\d.]+) [\d.]+ 0 0 0/g)].map((m) => parseFloat(m[1]));
    expect(radii[0]).toBeCloseTo(radii[1], 6);
    expect(radii[2]).toBeGreaterThan(radii[0]);
  });
});

describe('snapping and input parsing', () => {
  it('aligns with existing points and steps 15° / 0.5 cm with Shift', () => {
    const r = snapPoint({ x: 3.05, y: 1.97 }, { scale: 50, points: [{ x: 3, y: 5 }, { x: -1, y: 2 }], shift: false, grid: false });
    expect(r.p).toEqual({ x: 3, y: 2 });
    expect(r.guides).toHaveLength(2);
    const s = snapPoint({ x: 2.1, y: 2.0 }, { scale: 50, points: [], anchor: { x: 0, y: 0 }, shift: true, grid: false });
    expect(Math.round(s.measure!.deg)).toBe(45);
    expect(s.measure!.length).toBe(3);
  });

  it('parses numbers with semicolons, spaces or commas', () => {
    expect(parseNumbers('5; 4; 3')).toEqual([5, 4, 3]);
    expect(parseNumbers('2,5; 3')).toEqual([2.5, 3]);
    expect(parseNumbers('2 -1')).toEqual([2, -1]);
    expect(parseNumbers('1, 2, 3')).toEqual([1, 2, 3]);
  });
});
