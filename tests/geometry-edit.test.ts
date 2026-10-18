/** Moving, selecting, copying; stable intersections; labels, point styles and areas. */
import { describe, expect, it } from 'vitest';
import { computeAll, type Value, type Values } from '../src/geometry/engine';
import { copyClosure, freeAncestors, moveObjects, objectsInRect, pasteObjects, stabilizeIntersections, transformObjects } from '../src/geometry/edit';
import { emptyConstruction, type Construction, type GeoObject } from '../src/geometry/model';
import { labelRuns, polygonArea, polygonPerimeter, renderConstruction } from '../src/geometry/render';
import { createFromTool, TOOL_KEYS } from '../src/geometry/tools';

function withPoints(pts: [string, number, number][]): Construction {
  const c = emptyConstruction();
  c.objects = pts.map(([label, x, y], i): GeoObject => ({ id: `p${i + 1}`, def: { t: 'point', x, y }, style: { label } }));
  return c;
}
const pt = (v: Values, id: string) => (v.get(id) as Extract<Value, { k: 'point' }>).p;
const svgOf = (c: Construction) => renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 }).svg;

describe('moving whole objects', () => {
  it('dragging a segment moves both of its end points', () => {
    const c = withPoints([['A', 0, 0], ['B', 3, 0], ['C', 9, 9]]);
    c.objects.push({ id: 's', def: { t: 'segment', a: 'p1', b: 'p2' }, style: {} });
    expect(freeAncestors(c, ['s']).sort()).toEqual(['p1', 'p2']);
    const v = computeAll(moveObjects(c, ['s'], { x: 1, y: 2 }));
    expect(pt(v, 'p1')).toEqual({ x: 1, y: 2 });
    expect(pt(v, 'p2')).toEqual({ x: 4, y: 2 });
    expect(pt(v, 'p3')).toEqual({ x: 9, y: 9 }); // untouched
  });

  it('a template keeps its shape when moved (rectangle built on hidden helpers)', () => {
    let c = withPoints([['A', 0, 0], ['B', 4, 0]]);
    c = { ...c, objects: [...c.objects, ...createFromTool(c, 'rectangle', ['p1', 'p2'], undefined, { values: computeAll(c) }).objects] };
    const poly = c.objects.find((o) => o.def.t === 'polygon')!;
    const before = (computeAll(c).get(poly.id) as Extract<Value, { k: 'polygon' }>).pts;
    const after = (computeAll(moveObjects(c, [poly.id], { x: -2, y: 1.5 })).get(poly.id) as Extract<Value, { k: 'polygon' }>).pts;
    after.forEach((p, i) => {
      expect(p.x).toBeCloseTo(before[i].x - 2, 9);
      expect(p.y).toBeCloseTo(before[i].y + 1.5, 9);
    });
  });

  it('a rubber band picks the objects fully inside it', () => {
    const c = withPoints([['A', 0, 0], ['B', 2, 0], ['C', 6, 0]]);
    c.objects.push({ id: 's', def: { t: 'segment', a: 'p1', b: 'p2' }, style: {} }, { id: 't', def: { t: 'segment', a: 'p2', b: 'p3' }, style: {} });
    expect(objectsInRect(c, computeAll(c), { x: -1, y: -1 }, { x: 3, y: 1 })).toEqual(['p1', 'p2', 's']);
  });
});

describe('copy and paste', () => {
  it('copies what the selection is built from, with new names, shifted', () => {
    const c = withPoints([['A', 0, 0], ['B', 3, 0], ['C', 0, 2]]);
    c.objects.push({ id: 'poly1', def: { t: 'polygon', pts: ['p1', 'p2', 'p3'] }, style: {} });
    const clip = copyClosure(c, ['poly1']);
    expect(clip.map((o) => o.id)).toEqual(['p1', 'p2', 'p3', 'poly1']);
    const r = pasteObjects(c, clip, { x: 1, y: -1 });
    expect(r.c.objects).toHaveLength(8);
    const copy = r.c.objects.slice(4);
    expect(copy.slice(0, 3).map((o) => o.style.label)).toEqual(['D', 'E', 'F']);
    const v = computeAll(r.c);
    const newPoly = copy[3];
    expect(newPoly.def.t === 'polygon' && newPoly.def.pts).toEqual(copy.slice(0, 3).map((o) => o.id));
    expect((v.get(newPoly.id) as Extract<Value, { k: 'polygon' }>).pts[0]).toEqual({ x: 1, y: -1 });
  });
});

describe('dragging keeps intersections in place', () => {
  it('a line–circle intersection keeps the nearer solution', () => {
    const c = withPoints([['O', 0, 0], ['R', 2, 0], ['A', -3, 0.5], ['B', 3, 0.5]]);
    c.objects.push(
      { id: 'circ', def: { t: 'circle', center: 'p1', through: 'p2' }, style: {} },
      { id: 'l', def: { t: 'line', a: 'p3', b: 'p4' }, style: {} },
      { id: 'X', def: { t: 'intersection', a: 'l', b: 'circ', index: 1 }, style: {} },
    );
    const v0 = computeAll(c);
    const x0 = pt(v0, 'X');
    // turn the line around: the solution order flips
    const flipped: Construction = { ...c, objects: c.objects.map((o) => (o.id === 'p3' ? { ...o, def: { t: 'point', x: 3, y: 0.6 } } : o.id === 'p4' ? { ...o, def: { t: 'point', x: -3, y: 0.6 } } : o)) };
    const fixed = stabilizeIntersections(flipped, computeAll(flipped), v0);
    const x1 = pt(computeAll(fixed), 'X');
    expect(Math.hypot(x1.x - x0.x, x1.y - x0.y)).toBeLessThan(0.2);
  });
});

describe('presentation', () => {
  it('labels with subscripts and superscripts', () => {
    expect(labelRuns('A1')).toEqual([{ s: 'A', pos: 'base' }, { s: '1', pos: 'sub' }]);
    expect(labelRuns('A_{12}')).toEqual([{ s: 'A', pos: 'base' }, { s: '12', pos: 'sub' }]);
    expect(labelRuns("x^2")).toEqual([{ s: 'x', pos: 'base' }, { s: '2', pos: 'sup' }]);
    expect(labelRuns("A'")).toEqual([{ s: 'A′', pos: 'base' }]);
  });

  it('labels of points at the same place do not overlap', () => {
    const c = withPoints([['H', 0, 0], ['M', 0, 0.02], ['A', -3, 0], ['B', 3, 0]]);
    const svg = svgOf(c);
    const pos = (l: string) => {
      const m = svg.match(new RegExp(`<text x="([\\d.-]+)" y="([\\d.-]+)"[^>]*>${l}</text>`))!;
      return { x: +m[1], y: +m[2] };
    };
    const h = pos('H');
    const m = pos('M');
    expect(Math.abs(h.x - m.x) > 9 || Math.abs(h.y - m.y) > 12).toBe(true);
  });

  it('point styles and a dragged label position', () => {
    const c = withPoints([['A', 0, 0], ['B', 2, 0], ['C', 4, 0]]);
    c.objects[0].style = { label: 'A', shape: 'hollow' };
    c.objects[1].style = { label: 'B', shape: 'cross', labelDx: 20, labelDy: -30 };
    const svg = svgOf(c);
    expect(svg).toMatch(/<circle [^>]*fill="#ffffff" stroke=/);
    expect(svg).toMatch(/<path d="M[^"]+M[^"]+" stroke="#111111" stroke-width="1.3"/);
    expect(svg).not.toContain('data-label-for'); // only in the editor
  });

  it('area and perimeter', () => {
    const sq = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }];
    expect(polygonArea(sq)).toBe(6);
    expect(polygonPerimeter(sq)).toBe(10);
    const c = withPoints([['A', 0, 0], ['B', 3, 0], ['C', 3, 2], ['D', 0, 2]]);
    c.objects.push({ id: 'q', def: { t: 'polygon', pts: ['p1', 'p2', 'p3', 'p4'] }, style: { showValue: true } });
    expect(svgOf(c)).toContain('S = 6 cm²');
  });

  it('each tool shortcut is a single distinct key', () => {
    const keys = Object.values(TOOL_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    keys.forEach((k) => expect(k).toMatch(/^[A-Z]$/));
  });
});

describe('turning, mirroring and resizing a selection', () => {
  it('turns a triangle by 90° about a centre, keeping its shape', () => {
    const c = withPoints([['A', 1, 0], ['B', 3, 0], ['C', 1, 2]]);
    c.objects.push({ id: 'poly', def: { t: 'polygon', pts: ['p1', 'p2', 'p3'] }, style: {} });
    const v = computeAll(transformObjects(c, ['poly'], { rotate: 90 }, { x: 0, y: 0 }));
    expect(pt(v, 'p1')).toEqual({ x: 0, y: 1 });
    expect(pt(v, 'p2')).toEqual({ x: 0, y: 3 });
    expect(pt(v, 'p3')).toEqual({ x: -2, y: 1 });
  });

  it('mirrors and resizes, including radii and points on circles', () => {
    const c = withPoints([['O', 2, 0]]);
    c.objects.push(
      { id: 'c1', def: { t: 'circleR', center: 'p1', r: 1 }, style: {} },
      { id: 'M', def: { t: 'pointOn', on: 'c1', param: 0 }, style: { label: 'M' } }, // right of O
    );
    const flipped = computeAll(transformObjects(c, ['M'], { flip: 'h' }, { x: 0, y: 0 }));
    expect(pt(flipped, 'p1')).toEqual({ x: -2, y: 0 });
    expect(pt(flipped, 'M').x).toBeCloseTo(-3, 6); // still on the outer side
    const big = computeAll(transformObjects(c, ['M'], { scale: 2 }, { x: 0, y: 0 }));
    expect((big.get('c1') as Extract<Value, { k: 'circle' }>).r).toBe(2);
    expect(pt(big, 'M').x).toBeCloseTo(6, 6);
  });
});
