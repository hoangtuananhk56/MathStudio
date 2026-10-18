import { describe, expect, it } from 'vitest';
import { Fig } from '../src/geometry/builder';
import { computeAll } from '../src/geometry/engine';
import type { Construction } from '../src/geometry/model';
import { renderConstruction } from '../src/geometry/render';
import { dist3, type Vec3 } from '../src/geometry/space';
import { createFromTool, parseRatio, pick3At } from '../src/geometry/tools';

/** A pyramid S.ABCD made with the tool, its anchor at (0; 0). */
function pyramid(tool: 'spPyramid' | 'spPyramidA' | 'spPyramidPar' = 'spPyramid'): Fig {
  const f = new Fig();
  const at = f.pt('A', 0, 0);
  f.tool(tool, [at], '5; 4; 5', { fresh: [at] });
  return f;
}

const p3 = (f: Fig, label: string): Vec3 => {
  const v = f.values.get(f.id(label));
  if (v?.k !== 'point' || !v.p3) throw new Error(`no 3D point ${label}`);
  return v.p3;
};

describe('solid geometry tools', () => {
  it('a pyramid comes with its named vertices; the clicked point only places it', () => {
    const f = pyramid();
    const labels = f.c.objects.filter((o) => o.def.t === 'v3').map((o) => o.style.label);
    expect(labels).toEqual(['A', 'B', 'C', 'D', 'S']);
    // the anchor was hidden and lost its name to the vertex
    expect(f.c.objects[0].style.hidden).toBe(true);
    expect(p3(f, 'S').z).toBe(5);
  });

  it('a textbook exercise: O = AC ∩ BD, M midpoint of SC, (SAC) ∩ (SBD), I = AM ∩ SO', () => {
    const f = pyramid('spPyramidPar');
    f.tool('spCross', ['A', 'C', 'B', 'D']);
    f.name(f.c.objects[f.c.objects.length - 1].id, 'O');
    f.tool('spMid', ['S', 'C']);
    f.name(f.c.objects[f.c.objects.length - 1].id, 'M');
    f.tool('spPlaneLine', ['S', 'A', 'C', 'S', 'B', 'D']);
    f.tool('spCross', ['A', 'M', 'S', 'O']);
    f.name(f.c.objects[f.c.objects.length - 1].id, 'I');
    const [S, O, I, A, C] = ['S', 'O', 'I', 'A', 'C'].map((n) => p3(f, n));
    // O is the middle of AC (parallelogram); I on SO, two thirds of the way from S (centroid of SAC)
    expect(dist3(O, { x: (A.x + C.x) / 2, y: (A.y + C.y) / 2, z: 0 })).toBeLessThan(1e-9);
    const SI = dist3(S, I) / dist3(S, O);
    expect(SI).toBeCloseTo(2 / 3, 6);
    // the line where the planes meet is drawn through S and O
    const gl = f.values.get(f.c.objects.find((o) => o.def.t === 'planeLine3')!.id);
    expect(gl?.k).toBe('seg3');
  });

  it('sections get their corners named', () => {
    const f = pyramid();
    f.tool('spMid', ['S', 'B']);
    f.name(f.c.objects[f.c.objects.length - 1].id, 'M');
    f.tool('spMid', ['S', 'C']);
    f.name(f.c.objects[f.c.objects.length - 1].id, 'N');
    f.tool('spMid', ['S', 'D']);
    f.name(f.c.objects[f.c.objects.length - 1].id, 'P');
    f.tool('spSection', ['M', 'N', 'P']);
    const sec = f.c.objects.find((o) => o.def.t === 'section3')!;
    const v = f.values.get(sec.id);
    expect(v?.k === 'section3' && v.pts3.length).toBe(4);
    // M, N, P are corners already; the fourth one (on SA) is new and named
    const corners = f.c.objects.filter((o) => o.def.t === 'secV3');
    expect(corners).toHaveLength(1);
    expect(corners[0].style.label).toBeTruthy();
    expect(p3(f, corners[0].style.label!).z).toBeCloseTo(2.5, 6);
  });

  it('parallels and projections', () => {
    const f = pyramid('spPyramidA');
    f.tool('spMid', ['S', 'B']);
    f.name(f.c.objects[f.c.objects.length - 1].id, 'M');
    // through M, parallel to BC, meeting SC: the midpoint of SC
    f.tool('spParallel', ['M', 'B', 'C', 'S', 'C']);
    const N = f.c.objects.filter((o) => o.def.t === 'cross3').pop()!;
    const n3 = (f.values.get(N.id) as { p3: Vec3 }).p3;
    const S = p3(f, 'S');
    const C = p3(f, 'C');
    expect(dist3(n3, { x: (S.x + C.x) / 2, y: (S.y + C.y) / 2, z: (S.z + C.z) / 2 })).toBeLessThan(1e-9);
    // SA ⊥ base: the projection of S on (ABC) is A
    f.tool('spFoot', ['S', 'A', 'B', 'C']);
    const H = f.c.objects.filter((o) => o.def.t === 'foot3').pop()!;
    expect(dist3((f.values.get(H.id) as { p3: Vec3 }).p3, p3(f, 'A'))).toBeLessThan(1e-9);
  });

  it('a click on an edge makes a point on it, dragged by its ratio', () => {
    const f = pyramid();
    const v = computeAll(f.c);
    const A = v.get(f.id('A')) as { p: { x: number; y: number } };
    const S = v.get(f.id('S')) as { p: { x: number; y: number } };
    const click = { x: A.p.x + (S.p.x - A.p.x) / 3, y: A.p.y + (S.p.y - A.p.y) / 3 + 0.01 };
    const r = pick3At(f.c, v, click, 0.2)!;
    const made = r.con.objects.find((o) => o.id === r.id)!;
    expect(made.def).toMatchObject({ t: 'on3', k: expect.closeTo(1 / 3, 2) });
    // clicking a vertex picks it
    expect(pick3At(f.c, v, S.p, 0.2)!.id).toBe(f.id('S'));
    // empty space: nothing
    expect(pick3At(f.c, v, { x: 40, y: 40 }, 0.2)).toBeNull();
  });

  it('ratios as typed by teachers', () => {
    expect(parseRatio('1/3')).toBeCloseTo(1 / 3);
    expect(parseRatio('0,5')).toBe(0.5);
    expect(parseRatio('2 : 3')).toBeCloseTo(2 / 3);
    expect(parseRatio('25%')).toBe(0.25);
    expect(() => createFromTool(pyramid().c, 'spOn', [pyramid().id('S'), pyramid().id('A')], '1')).toThrow();
  });

  it('turning the scene redraws it, every object still drawn', () => {
    const f = pyramid();
    f.tool('spCross', ['A', 'C', 'B', 'D']);
    for (const yaw of [0, 40, 180, -90]) {
      const c: Construction = { ...f.c, yaw3: yaw };
      const v = computeAll(c);
      expect([...v.values()].every((x) => x !== null)).toBe(true);
      const svg = renderConstruction(c, v, { mode: 'export', view: { xmin: -4, xmax: 10, ymin: -4, ymax: 8 }, scale: 1 }).svg;
      expect(svg).toContain('stroke-dasharray');
    }
  });
});
