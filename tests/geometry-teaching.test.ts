/** Textbook conventions: short lines, rays Ox, angle texts, constructions with their marks. */
import { describe, expect, it } from 'vitest';
import { computeAll, type Value, type Values, type Vec } from '../src/geometry/engine';
import { emptyConstruction, type Construction, type GeoObject, type Style } from '../src/geometry/model';
import { autoSpan, distanceToDrawn, drawnSpan, renderConstruction } from '../src/geometry/render';
import { createFromTool, type ToolId } from '../src/geometry/tools';

type Straight = Extract<Value, { k: 'straight' }>;

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

const svgOf = (c: Construction, v: Values = computeAll(c)) => renderConstruction(c, v, { mode: 'export', view: c.view, scale: 1 }).svg;
const byLabel = (c: Construction, l: string) => c.objects.find((o) => o.style.label === l)!;
const pointOf = (v: Values, id: string) => (v.get(id) as Extract<Value, { k: 'point' }>).p;
const angles = (v: Values) => [...v.values()].filter((x): x is Extract<Value, { k: 'angle' }> => x?.k === 'angle');
const d = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

describe('lines are drawn short, as in textbooks', () => {
  it('a line runs a little past its points, not across the page', () => {
    const c = withPoints([['A', 0, 0], ['B', 4, 0]]);
    c.objects.push({ id: 'l', def: { t: 'line', a: 'p1', b: 'p2' }, style: {} });
    const v = computeAll(c);
    const [t0, t1] = autoSpan(c.objects[2], v.get('l') as Straight, c, v);
    expect(t0).toBeCloseTo(-0.7, 9);
    expect(t1).toBeCloseTo(4.7, 9);
    // clicking the line far beyond its drawn part does not hit it
    expect(distanceToDrawn(c.objects[2], v.get('l')!, c, v, c.view, { x: 7, y: 0 })).toBeGreaterThan(2);
  });

  it('a dragged extent and the full-width option are respected', () => {
    const c = withPoints([['A', 0, 0], ['B', 4, 0]]);
    const style: Style = { extent: [1, 2] };
    c.objects.push({ id: 'l', def: { t: 'line', a: 'p1', b: 'p2' }, style });
    const v = computeAll(c);
    expect(drawnSpan(c.objects[2], v.get('l') as Straight, c, v, c.view)).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    c.objects[2].style = { extent: 'full' };
    const full = drawnSpan(c.objects[2], v.get('l') as Straight, c, v, c.view)!;
    expect(full[0].x).toBeCloseTo(c.view.xmin, 9);
  });

  it('a perpendicular reaches its base line and gets a right-angle square', () => {
    const c = withPoints([['A', 0, 0], ['B', 6, 0], ['M', 2, 3]]);
    c.objects.push({ id: 'ab', def: { t: 'line', a: 'p1', b: 'p2' }, style: {} });
    const r = run(c, 'perpendicular', ['ab', 'p3']);
    const l = r.objs.find((o) => o.def.t === 'perpendicular')!;
    const span = drawnSpan(l, r.v.get(l.id) as Straight, r.c, r.v, r.c.view)!;
    expect(Math.min(span[0].y, span[1].y)).toBeLessThan(-0.5); // goes past the foot (2; 0)
    expect(Math.max(span[0].y, span[1].y)).toBeGreaterThan(3.5); // and past M
    expect(angles(r.v)[0].deg).toBeCloseTo(90, 9);
  });

  it('a perpendicular bisector comes with equal ticks and a right angle', () => {
    const r = run(withPoints([['A', 0, 0], ['B', 4, 0]]), 'perpBisector', ['p1', 'p2']);
    expect(r.objs.filter((o) => o.style.ticks === 1)).toHaveLength(2);
    expect(angles(r.v)[0].deg).toBeCloseTo(90, 9);
  });
});

describe('rays have an origin and an end: Ox', () => {
  it('a ray to a point clicked in empty space ends with a small letter and no dot', () => {
    const r = run(withPoints([['O', 0, 0], ['B', 3, 1]]), 'ray', ['p1', 'p2'], undefined, ['p2']);
    const tip = r.c.objects.find((o) => o.id === 'p2')!;
    expect(tip.style).toMatchObject({ label: 'x', dot: false });
    const ray = r.objs[0];
    const span = drawnSpan(ray, r.v.get(ray.id) as Straight, r.c, r.v, r.c.view)!;
    expect(d(span[1], { x: 3, y: 1 })).toBeCloseTo(0, 9); // ends at the letter
    const svg = svgOf(r.c, r.v);
    expect(svg).toMatch(/>x<\/text>/);
    expect((svg.match(/<circle /g) ?? []).length).toBe(1); // only O has a dot
  });

  it('a ray through an existing point A is ray OA and runs past A', () => {
    const r = run(withPoints([['O', 0, 0], ['A', 3, 0]]), 'ray', ['p1', 'p2']);
    expect(r.c.objects[1].style.label).toBe('A');
    const span = drawnSpan(r.objs[0], r.v.get(r.objs[0].id) as Straight, r.c, r.v, r.c.view)!;
    expect(span[1].x).toBeCloseTo(3.7, 9);
  });

  it('drawing an angle of 60°: rays Ox and Oy with the size shown', () => {
    const r = run(withPoints([['B', 3, 0], ['O', 0, 0]]), 'angleFixed', ['p1', 'p2'], '60', ['p1']);
    expect(r.c.objects[0].style).toMatchObject({ label: 'x', dot: false });
    expect(r.objs.find((o) => o.def.t === 'image')!.style).toMatchObject({ label: 'y', dot: false });
    expect(angles(r.v)[0].deg).toBeCloseTo(60, 9);
    expect(svgOf(r.c, r.v)).toContain('>60°<');
  });

  it('an angle drawn in empty space is xOy', () => {
    const r = run(withPoints([['A', 3, 0], ['B', 0, 0]]), 'angleFixed', ['p1', 'p2'], '45', ['p1', 'p2']);
    expect(r.c.objects.map((o) => o.style.label).slice(0, 2)).toEqual(['x', 'O']);
  });

  it('the angle bisector is a ray Ot with the two halves marked equal', () => {
    const r = run(withPoints([['A', 3, 0], ['O', 0, 0], ['B', 0, 3]]), 'angleBisector', ['p1', 'p2', 'p3']);
    expect(r.objs.some((o) => o.def.t === 'ray')).toBe(true);
    expect(r.objs.find((o) => o.style.dot === false)!.style.label).toBe('t');
    const [h1, h2] = angles(r.v);
    expect(h1.deg).toBeCloseTo(45, 9);
    expect(h2.deg).toBeCloseTo(45, 9);
    expect(r.objs.filter((o) => o.style.arcTicks === 1)).toHaveLength(2);
  });
});

describe('triangles with given angles', () => {
  it('two sides and the included angle', () => {
    const r = run(withPoints([['A', 0, 0]]), 'triangleSAS', ['p1'], '4; 60; 3');
    const [A, B, C] = ['A', 'B', 'C'].map((l) => pointOf(r.v, byLabel(r.c, l).id));
    expect(d(A, B)).toBeCloseTo(4, 9);
    expect(d(A, C)).toBeCloseTo(3, 9);
    expect(angles(r.v)[0].deg).toBeCloseTo(60, 9);
    expect(() => run(withPoints([['A', 0, 0]]), 'triangleSAS', ['p1'], '4; 200; 3')).toThrow();
  });

  it('a side and the two angles next to it', () => {
    const r = run(withPoints([['A', 0, 0]]), 'triangleASA', ['p1'], '5; 60; 45');
    const [a1, a2] = angles(r.v);
    expect(a1.deg).toBeCloseTo(60, 9);
    expect(a2.deg).toBeCloseTo(45, 9);
    expect(pointOf(r.v, byLabel(r.c, 'C').id).y).toBeGreaterThan(0);
    expect(() => run(withPoints([['A', 0, 0]]), 'triangleASA', ['p1'], '5; 100; 90')).toThrow(/180/);
  });
});

describe('angle texts', () => {
  const tri = () => {
    const c = withPoints([['A', 1, 3], ['B', 0, 0], ['C', 5, 0]]);
    c.objects.push({ id: 'poly', def: { t: 'polygon', pts: ['p1', 'p2', 'p3'] }, style: {} });
    return c;
  };

  it('a custom text such as 60° is written upright, a name such as α in italics', () => {
    const c = tri();
    c.objects.push({ id: 'b', def: { t: 'angle', a: 'p3', b: 'p2', c: 'p1' }, style: { label: '60°', showLabel: true } });
    c.objects.push({ id: 'c', def: { t: 'angle', a: 'p1', b: 'p3', c: 'p2' }, style: { label: 'α', showLabel: true } });
    const svg = svgOf(c);
    expect(svg).toMatch(/<text [^>]*style="[^"]*"[^>]*>60°<\/text>/);
    expect(svg).not.toMatch(/italic">60°/);
    expect(svg).toMatch(/italic">α</);
  });

  it('moves off a line that runs along the bisector', () => {
    const c = withPoints([['A', -2, 0], ['O', 0, 0], ['B', 2, 0.0001], ['T', 0, 3]]);
    c.objects.push(
      { id: 'up', def: { t: 'segment', a: 'p2', b: 'p4' }, style: {} },
      { id: 'ang', def: { t: 'angle', a: 'p3', b: 'p2', c: 'p1' }, style: { showValue: true } },
    );
    const svg = renderConstruction(c, computeAll(c), { mode: 'edit', view: c.view, scale: 40 }).svg;
    const m = svg.match(/<text x="([\d.]+)" y="[\d.]+"[^>]*>180°<\/text>/)!;
    const vertexX = (0 - c.view.xmin) * 40;
    // the text is centred to one side of the vertical segment, not across it
    const textW = '180°'.length * 15 * 0.85 * 0.5;
    const cx = parseFloat(m[1]) + textW / 2;
    expect(Math.abs(cx - vertexX)).toBeGreaterThan(10);
  });
});
