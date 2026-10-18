import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/geometry/engine';
import { dependencies, emptyConstruction, type Construction, type GeoObject } from '../src/geometry/model';
import { createFromTool, deleteWithDependents, nextPointName } from '../src/geometry/tools';

function withPoints(pts: [string, number, number][]): Construction {
  const c = emptyConstruction();
  c.objects = pts.map(([label, x, y], i): GeoObject => ({ id: `p${i + 1}`, def: { t: 'point', x, y }, style: { label } }));
  return c;
}
const apply = (c: Construction, objs: GeoObject[]) => ({ ...c, objects: [...c.objects, ...objs] });
const labels = (objs: GeoObject[]) => objs.map((o) => o.style.label).filter(Boolean);

describe('geometry tools', () => {
  it('names points A, B, C … and continues after Z', () => {
    const c = withPoints([['A', 0, 0], ['B', 1, 0]]);
    expect(nextPointName(c)).toBe('C');
    const full = withPoints('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l, i) => [l, i, 0] as [string, number, number]));
    expect(nextPointName(full)).toBe('A1');
  });

  it('equilateral triangle and square create the missing named vertices', () => {
    const c = withPoints([['A', 0, 0], ['B', 2, 0]]);
    const tri = createFromTool(c, 'triangleEq', ['p1', 'p2']).objects;
    expect(labels(tri)).toEqual(['C']);
    const sq = createFromTool(c, 'square', ['p1', 'p2']).objects;
    expect(labels(sq)).toEqual(['C', 'D']);
    const v = computeAll(apply(c, sq));
    const D = v.get(sq[2].id);
    expect(D?.k === 'point' && D.p.y).toBeCloseTo(2, 9);
  });

  it('intersection of two circles creates both points with distinct names', () => {
    let c = withPoints([['A', 0, 0], ['B', 3, 0]]);
    const c1 = createFromTool(c, 'circle', ['p1', 'p2']).objects;
    c = apply(c, c1);
    const c2 = createFromTool(c, 'circle', ['p2', 'p1']).objects;
    c = apply(c, c2);
    const pts = createFromTool(c, 'intersect', [c1[0].id, c2[0].id]).objects;
    expect(labels(pts)).toEqual(['C', 'D']);
    const v = computeAll(apply(c, pts));
    expect(pts.every((p) => v.get(p.id)?.k === 'point')).toBe(true);
  });

  it('reflecting a triangle creates A\'B\'C\' and the image polygon', () => {
    let c = withPoints([['A', 0, 0], ['B', 2, 0], ['C', 0, 1], ['X', 5, -1], ['Y', 5, 1]]);
    const poly = createFromTool(c, 'polygon', ['p1', 'p2', 'p3']).objects;
    c = apply(c, poly);
    const axis = createFromTool(c, 'line', ['p4', 'p5']).objects;
    c = apply(c, axis);
    const img = createFromTool(c, 'reflectLine', [poly[0].id, axis[0].id]).objects;
    expect(labels(img)).toEqual(["A'", "B'", "C'"]);
    const v = computeAll(apply(c, img));
    const A1 = v.get(img[0].id);
    expect(A1?.k === 'point' && A1.p.x).toBeCloseTo(10, 9);
    expect(v.get(img[3].id)?.k).toBe('polygon');
  });

  it('equal marks cycle 1→2→3→0 on segments', () => {
    let c = withPoints([['A', 0, 0], ['B', 2, 0]]);
    const s = createFromTool(c, 'segment', ['p1', 'p2']).objects;
    c = apply(c, s);
    const seq: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = createFromTool(c, 'equalMark', [s[0].id]).restyle![0];
      c = { ...c, objects: c.objects.map((o) => (o.id === r.id ? { ...o, style: { ...o.style, ...r.style } } : o)) };
      seq.push(c.objects.find((o) => o.id === s[0].id)!.style.ticks!);
    }
    expect(seq).toEqual([1, 2, 3, 0]);
  });

  it('deleting a point removes everything built on it', () => {
    let c = withPoints([['A', 0, 0], ['B', 2, 0], ['C', 5, 5]]);
    const s = createFromTool(c, 'segment', ['p1', 'p2']).objects;
    c = apply(c, s);
    const m = createFromTool(c, 'midpoint', ['p1', 'p2']).objects;
    c = apply(c, m);
    const after = deleteWithDependents(c, 'p1', dependencies);
    expect(after.objects.map((o) => o.style.label ?? o.id)).toEqual(['B', 'C']);
  });
});
