import { describe, expect, it } from 'vitest';
import { computeAll, type Value, type Vec } from '../src/geometry/engine';
import { compileExpression } from '../src/geometry/expr';
import { emptyConstruction, type Def, type GeoObject } from '../src/geometry/model';

function build(defs: Record<string, Def>) {
  const c = emptyConstruction();
  c.objects = Object.entries(defs).map(([id, def]): GeoObject => ({ id, def, style: {} }));
  return computeAll(c);
}
const P = (x: number, y: number): Def => ({ t: 'point', x, y });
function pt(v: Value | null | undefined): Vec {
  if (!v || v.k !== 'point') throw new Error('not a point: ' + JSON.stringify(v));
  return v.p;
}
const close = (a: Vec, x: number, y: number) => {
  expect(a.x).toBeCloseTo(x, 6);
  expect(a.y).toBeCloseTo(y, 6);
};

describe('geometry engine', () => {
  it('midpoint and line–line intersection', () => {
    const v = build({
      A: P(0, 0), B: P(4, 0), C: P(0, 4), D: P(4, 4),
      M: { t: 'midpoint', a: 'A', b: 'D' },
      l1: { t: 'line', a: 'A', b: 'D' }, l2: { t: 'line', a: 'B', b: 'C' },
      I: { t: 'intersection', a: 'l1', b: 'l2', index: 0 },
    });
    close(pt(v.get('M')), 2, 2);
    close(pt(v.get('I')), 2, 2);
  });

  it('segment intersections are undefined outside the segment', () => {
    const v = build({
      A: P(0, 0), B: P(1, 0), C: P(3, -1), D: P(3, 1),
      s: { t: 'segment', a: 'A', b: 'B' }, t: { t: 'segment', a: 'C', b: 'D' },
      I: { t: 'intersection', a: 's', b: 't', index: 0 },
    });
    expect(v.get('I')).toBeNull();
  });

  it('circle through 3 points (circumcircle)', () => {
    const v = build({ A: P(1, 0), B: P(-1, 0), C: P(0, 1), c: { t: 'circle3', a: 'A', b: 'B', c: 'C' } });
    const c = v.get('c')!;
    expect(c.k).toBe('circle');
    if (c.k === 'circle') {
      close(c.c, 0, 0);
      expect(c.r).toBeCloseTo(1, 9);
    }
  });

  it('line–circle and circle–circle intersections', () => {
    const v = build({
      O: P(0, 0), A: P(5, 0), c: { t: 'circle', center: 'O', through: 'A' },
      X1: P(-10, 3), X2: P(10, 3), l: { t: 'line', a: 'X1', b: 'X2' },
      I0: { t: 'intersection', a: 'l', b: 'c', index: 0 }, I1: { t: 'intersection', a: 'l', b: 'c', index: 1 },
      O2: P(6, 0), c2: { t: 'circleR', center: 'O2', r: 5 },
      J0: { t: 'intersection', a: 'c', b: 'c2', index: 0 },
    });
    close(pt(v.get('I0')), -4, 3);
    close(pt(v.get('I1')), 4, 3);
    const j = pt(v.get('J0'));
    expect(j.x).toBeCloseTo(3, 9);
    expect(Math.abs(j.y)).toBeCloseTo(4, 9);
  });

  it('perpendicular, parallel, perpendicular bisector, angle bisector', () => {
    const v = build({
      A: P(0, 0), B: P(4, 0), C: P(1, 3),
      ab: { t: 'line', a: 'A', b: 'B' },
      h: { t: 'perpendicular', line: 'ab', through: 'C' },
      H: { t: 'intersection', a: 'h', b: 'ab', index: 0 },
      p: { t: 'parallel', line: 'ab', through: 'C' },
      m: { t: 'perpBisector', a: 'A', b: 'B' },
      M: { t: 'intersection', a: 'm', b: 'ab', index: 0 },
      bis: { t: 'angleBisector', a: 'B', b: 'A', c: 'C' },
    });
    close(pt(v.get('H')), 1, 0);
    const par = v.get('p')!;
    expect(par.k === 'straight' && Math.abs(par.d.y)).toBeCloseTo(0, 9);
    close(pt(v.get('M')), 2, 0);
    const bis = v.get('bis')!;
    if (bis.k !== 'straight') throw new Error();
    // angle BAC is between 0° and atan2(3,1); the bisector halves it
    expect(Math.atan2(bis.d.y, bis.d.x)).toBeCloseTo(Math.atan2(3, 1) / 2, 9);
  });

  it('tangents from an external point', () => {
    const v = build({
      O: P(0, 0), A: P(1, 0), c: { t: 'circle', center: 'O', through: 'A' }, P: P(2, 0),
      t0: { t: 'tangent', circle: 'c', through: 'P', index: 0 },
      T: { t: 'intersection', a: 't0', b: 'c', index: 0 },
    });
    const T = pt(v.get('T'));
    // OT ⟂ PT
    expect(T.x * (T.x - 2) + T.y * T.y).toBeCloseTo(0, 6);
    expect(Math.hypot(T.x, T.y)).toBeCloseTo(1, 6);
  });

  it('regular polygon, vertices and angles', () => {
    const v = build({
      A: P(0, 0), B: P(1, 0), sq: { t: 'regularPolygon', a: 'A', b: 'B', n: 4 },
      C: { t: 'polyVertex', poly: 'sq', i: 2 }, D: { t: 'polyVertex', poly: 'sq', i: 3 },
      ang: { t: 'angle', a: 'B', b: 'A', c: 'D' },
      tri: { t: 'angle', a: 'C', b: 'A', c: 'B' },
    });
    close(pt(v.get('C')), 1, 1);
    close(pt(v.get('D')), 0, 1);
    const ang = v.get('ang')!;
    expect(ang.k === 'angle' && ang.deg).toBeCloseTo(90, 9);
    // the non-reflex angle regardless of point order
    const tri = v.get('tri')!;
    expect(tri.k === 'angle' && tri.deg).toBeCloseTo(45, 9);
  });

  it('transformations', () => {
    const v = build({
      O: P(0, 0), A: P(2, 1), X: P(0, 5),
      ax: { t: 'line', a: 'O', b: 'X' },
      R: { t: 'image', of: 'A', tr: { k: 'reflectLine', line: 'ax' } },
      S: { t: 'image', of: 'A', tr: { k: 'reflectPoint', center: 'O' } },
      Q: { t: 'image', of: 'A', tr: { k: 'rotate', center: 'O', deg: 90 } },
      V: { t: 'vector', a: 'O', b: 'X' },
      T: { t: 'image', of: 'A', tr: { k: 'translate', vector: 'V' } },
      K: { t: 'image', of: 'A', tr: { k: 'dilate', center: 'O', factor: 2 } },
    });
    close(pt(v.get('R')), -2, 1);
    close(pt(v.get('S')), -2, -1);
    close(pt(v.get('Q')), -1, 2);
    close(pt(v.get('T')), 2, 6);
    close(pt(v.get('K')), 4, 2);
  });

  it('dependent objects become undefined when their input is', () => {
    const v = build({
      A: P(0, 0), B: P(0, 0), // coincident -> no segment
      s: { t: 'segment', a: 'A', b: 'B' },
      M: { t: 'pointOn', on: 's', param: 1 },
    });
    expect(v.get('s')).toBeNull();
    expect(v.get('M')).toBeNull();
  });
});

describe('function expressions', () => {
  const f = (s: string, x: number) => compileExpression(s)(x);
  it('evaluates school functions', () => {
    expect(f('x^2-2x+1', 3)).toBe(4);
    expect(f('2x', 5)).toBe(10);
    expect(f('-x^2', 3)).toBe(-9);
    expect(f('sin(pi/2)', 0)).toBeCloseTo(1, 12);
    expect(f('sqrt(x)+abs(-2)', 9)).toBe(5);
    expect(f('3sin x', Math.PI / 2)).toBeCloseTo(3, 12);
    expect(f('(x+1)(x-1)', 3)).toBe(8);
    expect(f('2^x^2', 2)).toBe(16); // right-associative power
  });
  it('rejects bad input', () => {
    expect(() => compileExpression('x+')).toThrow();
    expect(() => compileExpression('foo(x)')).toThrow();
  });
});
