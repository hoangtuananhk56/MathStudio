import { describe, expect, it } from 'vitest';
import {
  centroid3,
  cross3,
  len3,
  sub3,
  convexHull,
  dist3,
  edgePieces,
  footOnPlane,
  hiddenPoint,
  linePlane,
  lineLine3,
  planeOf,
  planePlane,
  project,
  section,
  segmentPieces,
  solidNames,
  solidVertices,
  v3,
  type Vec3,
  type View3,
} from '../src/geometry/space';

const view: View3 = { yaw: 0, pivot: v3(0, 0, 0) };
const close = (a: Vec3, b: Vec3) => expect(dist3(a, b)).toBeLessThan(1e-6);

/** S.ABCD, base 4 × 3, height 4, apex above the centre. */
const pyramid = () => solidVertices({ kind: 'pyramid', n: 4, w: 4, d: 3, h: 4, x: 0, y: 0 });

describe('solid geometry', () => {
  it('textbook solids: vertices, names, faces and edges', () => {
    const cube = solidVertices({ kind: 'box', n: 4, w: 2, d: 2, h: 2, x: 0, y: 0 });
    expect(solidNames({ kind: 'box', n: 4 })).toEqual(['A', 'B', 'C', 'D', 'A′', 'B′', 'C′', 'D′']);
    const hull = convexHull(cube);
    expect(hull.faces).toHaveLength(6);
    expect(hull.edges).toHaveLength(12);
    const p = convexHull(pyramid());
    expect(solidNames({ kind: 'pyramid', n: 4 })).toEqual(['A', 'B', 'C', 'D', 'S']);
    expect(p.faces).toHaveLength(5);
    expect(p.edges).toHaveLength(8);
    const hex = solidVertices({ kind: 'pyramidReg', n: 6, w: 2, d: 0, h: 3, x: 0, y: 0 });
    expect(convexHull(hex).faces).toHaveLength(7);
    // a regular base: all sides equal, AB in front from (0,0,0) to (w,0,0)
    for (let i = 0; i < 6; i++) expect(dist3(hex[i], hex[(i + 1) % 6])).toBeCloseTo(2, 6);
    close(hex[0], v3(0, 0, 0));
    close(hex[1], v3(2, 0, 0));
    // the regular tetrahedron: all six edges equal
    const t = solidVertices({ kind: 'tetra', n: 3, w: 3, d: 0, h: 0, x: 0, y: 0 });
    const tl = convexHull(t).edges.map(([i, j]) => dist3(t[i], t[j]));
    for (const l of tl) expect(l).toBeCloseTo(3, 6);
  });

  it('the page position of a solid is its first vertex', () => {
    const v = solidVertices({ kind: 'box', n: 4, w: 3, d: 2, h: 2, x: 1, y: -2 });
    expect(project(v[0], view)).toEqual({ x: 1, y: -2 });
    // depth goes up and to the right, half length
    const d = project(v[3], view);
    expect(d.x - 1).toBeCloseTo(Math.SQRT1_2, 6);
    expect(d.y + 2).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('hidden lines as in the textbook: the back edges at D are dashed', () => {
    const cube = convexHull(solidVertices({ kind: 'box', n: 4, w: 2, d: 2, h: 2, x: 0, y: 0 }));
    const pieces = edgePieces(cube, [], view);
    const hidden = cube.edges.filter((_, i) => pieces[i].every((p) => p.hidden)).map(([a, b]) => 'ABCDEFGH'[a] + 'ABCDEFGH'[b]);
    // A B C D on the base, E F G H = A′ B′ C′ D′ on top: hidden DA, DC, DD′
    expect(hidden.sort()).toEqual(['AD', 'CD', 'DH']);
    expect(hiddenPoint(v3(0, 2, 0), [cube], view)).toBe(true); // D
    expect(hiddenPoint(v3(2, 0, 2), [cube], view)).toBe(false); // B′
    // turned half way round, the other side is seen
    const back = edgePieces(cube, [], { yaw: 180, pivot: v3(1, 1, 1) });
    expect(cube.edges.filter((_, i) => back[i].every((p) => p.hidden)).length).toBe(3);
  });

  it('a segment through the solid is hidden inside it', () => {
    const cube = convexHull(solidVertices({ kind: 'box', n: 4, w: 2, d: 2, h: 2, x: 0, y: 0 }));
    // the diagonal A C′ crosses the inside: hidden
    const diag = segmentPieces(v3(0, 0, 0), v3(2, 2, 2), [cube], view);
    expect(diag.every((p) => p.hidden)).toBe(true);
    // the front face diagonal A B′ is seen
    expect(segmentPieces(v3(0, 0, 0), v3(2, 0, 2), [cube], view).every((p) => !p.hidden)).toBe(true);
    // a segment from outside in front, going in: seen, then hidden
    const kinds = segmentPieces(v3(1, -2, 1), v3(1, 1, 1), [cube], view).map((p) => p.hidden);
    expect(kinds).toEqual([false, true]);
  });

  it('meeting points and lines', () => {
    const [A, B, C, D, S] = pyramid();
    const O = lineLine3(A, C, B, D)!;
    close(O, centroid3([A, B, C, D]));
    // SA and BC do not meet (skew lines)
    expect(lineLine3(S, A, B, C)).toBeNull();
    // (SAC) ∩ (SBD) is the line SO
    const l = planePlane(planeOf(S, A, C)!, planeOf(S, B, D)!)!;
    const onLine = (p: Vec3) => len3(cross3(sub3(p, l.o), l.d)) < 1e-6;
    expect(onLine(S)).toBe(true);
    expect(onLine(O)).toBe(true);
    // the midpoint M of SC; line AM meets (SBD) on SO
    const M = v3((S.x + C.x) / 2, (S.y + C.y) / 2, (S.z + C.z) / 2);
    const I = linePlane(A, M, planeOf(S, B, D)!)!;
    expect(onLine(I)).toBe(true);
    // the foot of S on the base is the centre O (regular apex)
    close(footOnPlane(S, planeOf(A, B, C)!), O);
  });

  it('sections', () => {
    const cube = convexHull(solidVertices({ kind: 'box', n: 4, w: 2, d: 2, h: 2, x: 0, y: 0 }));
    // a plane parallel to the base: a square
    const sq = section(cube, { n: v3(0, 0, 1), d: 1 });
    expect(sq).toHaveLength(4);
    // the plane through the midpoints of three edges at one corner cuts a triangle off
    const tri = section(cube, planeOf(v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1))!);
    expect(tri).toHaveLength(3);
    // the plane through the cube's centre perpendicular to a diagonal: a regular hexagon
    const hex = section(cube, { n: v3(1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)), d: Math.sqrt(3) });
    expect(hex).toHaveLength(6);
    const sides = hex.map((p, i) => dist3(p, hex[(i + 1) % 6]));
    for (const s of sides) expect(s).toBeCloseTo(Math.SQRT2, 6);
    // a plane missing the solid
    expect(section(cube, { n: v3(0, 0, 1), d: 5 })).toEqual([]);
  });
});
