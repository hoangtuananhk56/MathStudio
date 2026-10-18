/** Round B: fractions, base and height, diagonals, angle figures, inscribed angles, answers, captions, instruments. */
import { describe, expect, it } from 'vitest';
import { computeAll, fractionParts, type Value, type Values, type Vec } from '../src/geometry/engine';
import { emptyConstruction, type Construction, type GeoObject } from '../src/geometry/model';
import { polygonArea, renderConstruction } from '../src/geometry/render';
import { smartPicks } from '../src/geometry/smart';
import { createFromTool, type ToolId } from '../src/geometry/tools';
import { captionParagraph } from '../src/core/image-ooxml';
import { snapInstrument } from '../src/geometry-editor/instruments';

function withPoints(pts: [string, number, number][]): Construction {
  const c = emptyConstruction();
  c.objects = pts.map(([label, x, y], i): GeoObject => ({ id: `p${i + 1}`, def: { t: 'point', x, y }, style: { label } }));
  return c;
}
function run(c: Construction, tool: ToolId, picks: string[], answer?: string, fresh?: string[]) {
  const r = createFromTool(c, tool, picks, answer, { values: computeAll(c), fresh });
  let objects = [...c.objects, ...r.objects];
  if (r.restyle) objects = objects.map((o) => ({ ...o, style: { ...o.style, ...(r.restyle!.find((x) => x.id === o.id)?.style ?? {}) } }));
  const next = { ...c, objects };
  return { c: next, v: computeAll(next), objs: r.objects };
}
const P = (v: Values, id: string) => (v.get(id) as Extract<Value, { k: 'point' }>).p;
const byLabel = (c: Construction, l: string) => c.objects.find((o) => o.style.label === l)!.id;
const angles = (v: Values, objs: GeoObject[]) => objs.filter((o) => o.def.t === 'angle').map((o) => (v.get(o.id) as Extract<Value, { k: 'angle' }>).deg);
const d = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const poly = (c: Construction, pts: string[]) => {
  c.objects.push({ id: 'poly1', def: { t: 'polygon', pts }, style: {} });
  return c;
};

describe('split a shape into equal parts', () => {
  it('rectangles in columns and rows, triangles and circles in equal pieces', () => {
    const rect: Value = { k: 'polygon', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }] };
    const parts = fractionParts(rect, 4, 2)!;
    expect(parts).toHaveLength(8);
    parts.forEach((q) => expect(polygonArea(q)).toBeCloseTo(1, 9));
    const tri: Value = { k: 'polygon', pts: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 1, y: 3 }] };
    fractionParts(tri, 3)!.forEach((q) => expect(polygonArea(q)).toBeCloseTo(3, 9));
    const circ: Value = { k: 'circle', c: { x: 0, y: 0 }, r: 2 };
    const pie = fractionParts(circ, 4)!;
    expect(pie).toHaveLength(4);
    pie.forEach((q) => expect(polygonArea(q)).toBeCloseTo(Math.PI, 1));
    const hex: Value = { k: 'polygon', pts: Array.from({ length: 6 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 3), y: Math.sin((i * Math.PI) / 3) })) };
    const six = fractionParts(hex, 6)!;
    six.forEach((q) => expect(polygonArea(q)).toBeCloseTo(polygonArea(hex.pts) / 6, 9));
  });

  it('the tool colours the first parts and shows 3/4', () => {
    const c = poly(withPoints([['A', 0, 0], ['B', 4, 0], ['C', 4, 2], ['D', 0, 2]]), ['p1', 'p2', 'p3', 'p4']);
    expect(smartPicks('fraction', c, computeAll(c), { x: 1, y: 1 }, null, { tol: 0.2, reach: 1 })).toEqual(['poly1']);
    const r = run(c, 'fraction', ['poly1'], '4; 3; 1');
    const f = r.v.get(r.objs[0].id) as Extract<Value, { k: 'fraction' }>;
    expect(f.parts).toHaveLength(4);
    expect(f.filled).toEqual([0, 1, 2]);
    r.c.objects[r.c.objects.length - 1].style.showValue = true;
    expect(renderConstruction(r.c, r.v, { mode: 'export', view: r.c.view, scale: 1 }).svg).toContain('>3/4<');
  });
});

describe('base and height (year 5)', () => {
  it('foot inside the base: dashed height with a right angle', () => {
    const c = poly(withPoints([['A', 1, 3], ['B', 0, 0], ['C', 5, 0]]), ['p1', 'p2', 'p3']);
    expect(smartPicks('baseHeight', c, computeAll(c), { x: 2.5, y: 0.02 }, null, { tol: 0.2, reach: 1 })).toEqual(['p2', 'p3', 'p1']);
    const r = run(c, 'baseHeight', ['p2', 'p3', 'p1']);
    expect(P(r.v, byLabel(r.c, 'H'))).toEqual({ x: 1, y: 0 });
    expect(r.objs.filter((o) => o.def.t === 'segment')).toHaveLength(1);
    expect(angles(r.v, r.objs)[0]).toBeCloseTo(90, 9);
  });

  it('obtuse triangle: the base is extended to the foot', () => {
    const c = poly(withPoints([['A', -2, 3], ['B', 0, 0], ['C', 5, 0]]), ['p1', 'p2', 'p3']);
    const r = run(c, 'baseHeight', ['p2', 'p3', 'p1']);
    expect(P(r.v, byLabel(r.c, 'H')).x).toBeCloseTo(-2, 9);
    expect(r.objs.filter((o) => o.def.t === 'segment')).toHaveLength(2); // height + extension
    expect(angles(r.v, r.objs)[0]).toBeCloseTo(90, 9);
  });
});

describe('diagonals (year 8)', () => {
  const marks = (pts: [number, number][]) => {
    const c = poly(withPoints(pts.map(([x, y], i): [string, number, number] => ['ABCD'[i], x, y])), ['p1', 'p2', 'p3', 'p4']);
    const r = run(c, 'diagonals', ['poly1']);
    return { ticks: r.objs.filter((o) => o.def.t === 'segment').map((o) => o.style.ticks ?? 0), right: r.objs.some((o) => o.def.t === 'angle'), r };
  };
  it('rectangle: four equal halves; rhombus: right angle; parallelogram: two pairs; trapezoid: none', () => {
    expect(marks([[0, 0], [4, 0], [4, 2], [0, 2]]).ticks).toEqual([1, 1, 1, 1]);
    const rh = marks([[0, 0], [3, -1], [6, 0], [3, 1]]);
    expect(rh.ticks).toEqual([1, 1, 2, 2]);
    expect(rh.right).toBe(true);
    expect(marks([[0, 0], [4, 0], [5, 2], [1, 2]]).ticks).toEqual([1, 1, 2, 2]);
    const tz = marks([[0, 0], [6, 0], [4, 2], [1, 2]]);
    expect(tz.ticks).toEqual([0, 0, 0, 0]);
    expect(P(tz.r.v, byLabel(tz.r.c, 'O'))).toBeDefined();
  });
});

describe('angle figures (years 6–7)', () => {
  it('two crossing lines: vertical angles equal, adjacent ones add up to 180°', () => {
    const r = run(withPoints([['A', 0, 0]]), 'crossLines', ['p1'], undefined, ['p1']);
    expect(r.c.objects[0].style.label).toBe('O');
    const [a1, a2, a3, a4] = angles(r.v, r.objs);
    expect(a1).toBeCloseTo(a3, 9);
    expect(a2).toBeCloseTo(a4, 9);
    expect(a1 + a2).toBeCloseTo(180, 9);
    expect(r.objs.filter((o) => o.def.t === 'angle').map((o) => o.style.label)).toEqual(['1', '2', '3', '4']);
  });

  it('parallel lines and a transversal: corresponding angles equal, co-interior add to 180°', () => {
    const r = run(withPoints([['M', 0, 0]]), 'parallelTransversal', ['p1']);
    const [A1, A2, A3, A4, B1, B2, B3, B4] = angles(r.v, r.objs);
    expect(A1).toBeCloseTo(B1, 9);
    expect(A2).toBeCloseTo(B2, 9);
    expect(A3).toBeCloseTo(B3, 9);
    expect(A4).toBeCloseTo(B4, 9);
    expect(A4 + B1).toBeCloseTo(180, 9); // same side, between the lines
    expect(r.objs.filter((o) => o.def.t === 'line' || o.def.t === 'parallel').map((o) => o.style.label)).toEqual(['a', 'b', 'c']);
  });

  it('opposite ray Ox′', () => {
    const c = withPoints([['O', 0, 0], ['x', 3, 1]]);
    c.objects[1].style.dot = false;
    c.objects.push({ id: 'r1', def: { t: 'ray', a: 'p1', b: 'p2' }, style: {} });
    const r = run(c, 'oppositeRay', ['r1']);
    const tip = r.objs.find((o) => o.def.t === 'image')!;
    expect(tip.style).toMatchObject({ label: "x'", dot: false });
    expect(P(r.v, tip.id)).toEqual({ x: -3, y: -1 });
    expect(() => run(withPoints([['A', 0, 0], ['B', 1, 0]]), 'oppositeRay', ['p1'])).toThrow(/tia/);
  });
});

describe('circles (year 9)', () => {
  it('the inscribed angle is half the central angle on the same arc', () => {
    const c = withPoints([['O', 0, 0], ['R', 3, 0]]);
    c.objects.push({ id: 'c1', def: { t: 'circle', center: 'p1', through: 'p2' }, style: {} });
    const r = run(c, 'inscribedAngle', ['c1']);
    const [central, inscribed] = angles(r.v, r.objs);
    expect(inscribed).toBeCloseTo(central / 2, 9);
  });

  it('tangents from an outside point: contact points, radii and right angles', () => {
    const c = withPoints([['O', 0, 0], ['R', 2, 0], ['P', 5, 0]]);
    c.objects.push({ id: 'c1', def: { t: 'circle', center: 'p1', through: 'p2' }, style: {} });
    const r = run(c, 'tangent', ['p3', 'c1']);
    const rights = angles(r.v, r.objs);
    expect(rights).toHaveLength(2);
    rights.forEach((a) => expect(a).toBeCloseTo(90, 9));
    const contacts = r.objs.filter((o) => o.def.t === 'foot');
    contacts.forEach((o) => expect(d(P(r.v, o.id), { x: 0, y: 0 })).toBeCloseTo(2, 9));
  });
});

describe('the three lines of a triangle', () => {
  it('three altitudes and the orthocentre H', () => {
    const c = poly(withPoints([['A', 1, 4], ['B', 0, 0], ['C', 5, 0]]), ['p1', 'p2', 'p3']);
    const r = run(c, 'altitudes3', ['p1', 'p2', 'p3']);
    expect(r.objs.filter((o) => o.def.t === 'foot')).toHaveLength(3);
    const H = P(r.v, byLabel(r.c, 'H'));
    expect(H.x).toBeCloseTo(1, 9);
    const m = run(c, 'medians3', ['p1', 'p2', 'p3']);
    expect(P(m.v, byLabel(m.c, 'G')).x).toBeCloseTo(2, 9);
  });
});

describe('question and answer, captions, instruments', () => {
  it('answer objects are left out of the question version', () => {
    const c = withPoints([['A', 0, 0], ['B', 3, 0]]);
    c.objects.push({ id: 's1', def: { t: 'segment', a: 'p1', b: 'p2' }, style: { answer: true, dash: 'dashed' } });
    const full = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 }).svg;
    const q = { ...c, answers: 'hide' as const };
    const question = renderConstruction(q, computeAll(q), { mode: 'export', view: q.view, scale: 1 }).svg;
    expect(full).toContain('stroke-dasharray');
    expect(question).not.toContain('stroke-dasharray');
  });

  it('caption paragraph with a SEQ field', () => {
    const p = captionParagraph(3);
    expect(p).toContain('w:instr=" SEQ Hình \\* ARABIC "');
    expect(p).toContain('>3</w:t>');
  });

  it('an instrument dropped near a point sticks to it and lines up with a line through it', () => {
    const c = withPoints([['O', 1, 1], ['A', 4, 4]]);
    c.objects.push({ id: 'r', def: { t: 'ray', a: 'p1', b: 'p2' }, style: {} });
    const s = snapInstrument({ kind: 'protractor', x: 1.1, y: 0.95, rot: 43 }, c, computeAll(c), 0.3);
    expect(s.x).toBe(1);
    expect(s.y).toBe(1);
    expect(s.rot).toBeCloseTo(45, 9);
  });
});

describe('solids', () => {
  it('a cuboid on a point just clicked is ABCD.A′B′C′D′, with three hidden edges', () => {
    const c = withPoints([['A', 0, 0]]);
    const r = run(c, 'cuboid', ['p1'], '4; 3; 2', ['p1']);
    const labels = r.c.objects.filter((o) => r.v.get(o.id)?.k === 'point').map((o) => o.style.label);
    expect(labels).toEqual(['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"]);
    const solid = r.v.get(r.objs[0].id) as Extract<Value, { k: 'solid' }>;
    expect(solid.edges.filter((e) => e.hidden)).toHaveLength(3);
    expect(d(solid.verts[0], solid.verts[1])).toBeCloseTo(4, 9);
    expect(d(solid.verts[0], solid.verts[4])).toBeCloseTo(2, 9);
  });

  it('a pyramid S.ABCD has its apex above the centre of the base', () => {
    const r = run(withPoints([['A', 0, 0]]), 'pyramid4', ['p1'], '4; 4; 5', ['p1']);
    const solid = r.v.get(r.objs[0].id) as Extract<Value, { k: 'solid' }>;
    const [A, , C, , S] = solid.verts;
    expect(S.x).toBeCloseTo((A.x + C.x) / 2, 9);
    expect(r.c.objects.some((o) => o.style.label === 'S')).toBe(true);
  });

  it('number line ticks, marks and errors', () => {
    const r = run(withPoints([['A', 0, 0]]), 'numberLine', ['p1'], '-3; 5; 1; -2 0 3 9', ['p1']);
    const nl = r.v.get(r.objs[0].id) as Extract<Value, { k: 'numberLine' }>;
    expect(nl.marks).toEqual([-2, 0, 3]);
    expect(r.c.objects[0].style.hidden).toBe(true);
    expect(() => run(withPoints([['A', 0, 0]]), 'numberLine', ['p1'], '0; 1000; 1')).toThrow(/vạch/);
  });
});
