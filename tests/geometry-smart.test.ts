/** One-click picking, tools by school year, step-by-step texts, broken lines. */
import { describe, expect, it } from 'vitest';
import { computeAll, type Value } from '../src/geometry/engine';
import { FAMILIES, familyOf, isPrimary, stepCount, stepText, toolsForGrade } from '../src/geometry/grades';
import { emptyConstruction, type Construction, type GeoObject } from '../src/geometry/model';
import { angleAtClick, armsAt, sideAtClick, smartPicks, triangleAtClick } from '../src/geometry/smart';
import { ALL_TOOLS, createFromTool } from '../src/geometry/tools';

function withPoints(pts: [string, number, number][]): Construction {
  const c = emptyConstruction();
  c.objects = pts.map(([label, x, y], i): GeoObject => ({ id: `p${i + 1}`, def: { t: 'point', x, y }, style: { label } }));
  return c;
}

/** Triangle ABC: A(0;3), B(0;0), C(4;0), right angle at B. */
const triangle = () => {
  const c = withPoints([['A', 0, 3], ['B', 0, 0], ['C', 4, 0]]);
  c.objects.push({ id: 'poly1', def: { t: 'polygon', pts: ['p1', 'p2', 'p3'] }, style: {} });
  return c;
};
const opts = { tol: 0.2, reach: 1.5 };

describe('clicking inside an angle', () => {
  it('finds the vertex and the two sides around the click', () => {
    const c = triangle();
    const v = computeAll(c);
    expect(armsAt(c, v, 'p2').map((a) => a.to).sort()).toEqual(['p1', 'p3']);
    const a = angleAtClick(c, v, { x: 0.4, y: 0.4 }, 1.5)!; // inside the corner at B
    expect(a.b).toBe('p2');
    expect([a.a, a.c].sort()).toEqual(['p1', 'p3']);
    expect(a.reflex).toBe(false);
    // the angle at C, clicked just inside it
    expect(angleAtClick(c, v, { x: 3.4, y: 0.2 }, 1.5)!.b).toBe('p3');
  });

  it('between rays Ox, Oy, Oz picks the two rays around the click, and the reflex side', () => {
    const c = withPoints([['O', 0, 0], ['x', 3, 0], ['y', 0, 3], ['z', -3, 0]]);
    c.objects.push(
      { id: 'r1', def: { t: 'ray', a: 'p1', b: 'p2' }, style: {} },
      { id: 'r2', def: { t: 'ray', a: 'p1', b: 'p3' }, style: {} },
      { id: 'r3', def: { t: 'ray', a: 'p1', b: 'p4' }, style: {} },
    );
    const v = computeAll(c);
    const a = angleAtClick(c, v, { x: -0.5, y: 0.6 }, 1.5)!; // between Oy and Oz
    expect([a.a, a.c].sort()).toEqual(['p3', 'p4']);
    const below = angleAtClick(c, v, { x: 0.3, y: -0.6 }, 1.5)!; // under the x axis: from Oz round to Ox, 180°
    expect([below.a, below.c].sort()).toEqual(['p2', 'p4']);
  });

  it('an angle mark from a click keeps the reflex part when clicked there', () => {
    const c = withPoints([['O', 0, 0], ['A', 3, 0], ['B', 0, 3]]);
    c.objects.push({ id: 's1', def: { t: 'segment', a: 'p1', b: 'p2' }, style: {} }, { id: 's2', def: { t: 'segment', a: 'p1', b: 'p3' }, style: {} });
    const v = computeAll(c);
    const a = angleAtClick(c, v, { x: -0.5, y: -0.5 }, 1.5)!;
    expect(a.reflex).toBe(true);
    const r = createFromTool(c, 'angle', [a.a, a.b, a.c], undefined, { values: v, reflex: a.reflex });
    const next = { ...c, objects: [...c.objects, ...r.objects] };
    const ang = computeAll(next).get(r.objects[0].id) as Extract<Value, { k: 'angle' }>;
    expect(ang.deg).toBeCloseTo(270, 9);
  });
});

describe('one click on what the tool works on', () => {
  it('midpoint of the clicked side', () => {
    const c = triangle();
    const v = computeAll(c);
    expect(sideAtClick(c, v, { x: 2, y: 0.05 }, 0.2)).toEqual(['p2', 'p3']);
    expect(smartPicks('midpoint', c, v, { x: 2, y: 0.05 }, null, opts)).toEqual(['p2', 'p3']);
    expect(smartPicks('midpoint', c, v, { x: 2, y: 0.05 }, 'p2', opts)).toBeNull(); // on a point: pick points as before
  });

  it('altitude from the vertex nearest the click; centroid from a click inside', () => {
    const c = triangle();
    const v = computeAll(c);
    expect(triangleAtClick(c, v, { x: 1, y: 1 }, 0.2)).toEqual(['p1', 'p2', 'p3']);
    expect(smartPicks('altitude', c, v, { x: 0.3, y: 2.3 }, null, opts)).toEqual(['p1', 'p2', 'p3']);
    expect(smartPicks('altitude', c, v, { x: 3, y: 0 }, 'p3', opts)).toEqual(['p3', 'p1', 'p2']);
    expect(smartPicks('centroid', c, v, { x: 1, y: 1 }, null, opts)).toEqual(['p1', 'p2', 'p3']);
    expect(smartPicks('centroid', c, v, { x: 9, y: 9 }, null, opts)).toBeNull();
  });
});

describe('tools by school year', () => {
  it('grows from year to year and keeps every tool reachable', () => {
    const g2 = toolsForGrade(2)!;
    const g3 = toolsForGrade(3)!;
    const g7 = toolsForGrade(7)!;
    expect(g2.has('polyline')).toBe(true);
    expect(g2.has('ray')).toBe(false); // rays come in year 6
    expect([...g2].every((t) => g3.has(t))).toBe(true);
    expect(g7.has('triangleSSS')).toBe(true);
    const all = toolsForGrade(10)!;
    const missing = ALL_TOOLS.map((t) => t.id).filter((t) => !all.has(t));
    expect(missing).toEqual([]);
    expect(toolsForGrade('all')).toBeNull();
    expect(isPrimary(5)).toBe(true);
    expect(isPrimary(6)).toBe(false);
  });

  it('families group the shape kinds', () => {
    expect(familyOf('triangleIso')?.id).toBe('tri');
    expect(familyOf('rhombus')?.id).toBe('quad');
    expect(familyOf('segment')).toBeNull();
    for (const f of FAMILIES) expect(new Set(f.members).size).toBe(f.members.length);
  });

  it('every tool has a step text for each of its steps', () => {
    for (const t of ALL_TOOLS) {
      for (let i = 0; i < stepCount(t.id); i++) {
        expect(stepText(t.id, i, 'vi').length).toBeGreaterThan(3);
        expect(stepText(t.id, i, 'en').length).toBeGreaterThan(3);
      }
    }
    expect(stepText('triangle', 1, 'vi')).toContain('thứ hai');
  });
});

describe('broken line', () => {
  it('joins the points in order with segments', () => {
    const c = withPoints([['A', 0, 0], ['B', 2, 1], ['C', 4, 0], ['D', 5, 2]]);
    const r = createFromTool(c, 'polyline', ['p1', 'p2', 'p3', 'p4']);
    expect(r.objects.map((o) => o.def.t === 'segment' && [o.def.a, o.def.b])).toEqual([['p1', 'p2'], ['p2', 'p3'], ['p3', 'p4']]);
  });
});
