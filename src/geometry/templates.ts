/**
 * Ready-made figures for the exercises met most often, by school year. Each one is a
 * normal dynamic construction: inserted, it can be dragged, renamed and completed.
 */
import { Fig } from './builder';
import type { Construction } from './model';

export interface Template {
  id: string;
  grade: number;
  vi: string;
  en: string;
  build(): Construction;
}

const T = (id: string, grade: number, vi: string, en: string, build: () => Fig): Template => ({ id, grade, vi, en, build: () => build().c });

export const TEMPLATES: Template[] = [
  /* ---------------- lớp 2 ---------------- */
  T('polyline', 2, 'Đường gấp khúc ABCD', 'Broken line ABCD', () => {
    const f = new Fig();
    f.pt('A', 0, 0);
    f.pt('B', 2, 2);
    f.pt('C', 4.5, 0.5);
    f.pt('D', 6.5, 2.5);
    for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'D']]) f.seg(a, b, { showValue: true });
    return f;
  }),
  T('tangram', 2, 'Ghép hình (7 mảnh tangram)', 'Tangram (7 pieces)', () => {
    // a 8 cm square cut into the 7 classic pieces; each piece has its own corners, so it moves alone
    const f = new Fig();
    const pieces: [number, number][][] = [
      [[0, 0], [8, 0], [4, 4]],
      [[0, 0], [4, 4], [0, 8]],
      [[8, 0], [8, 4], [6, 2]],
      [[6, 2], [8, 4], [6, 6], [4, 4]],
      [[4, 4], [6, 6], [2, 6]],
      [[0, 8], [2, 6], [6, 6], [4, 8]],
      [[4, 8], [8, 4], [8, 8]],
    ];
    const colours = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c'];
    pieces.forEach((pts, i) => {
      const ids = pts.map(([x, y]) => f.add('p', { t: 'point', x: x * 0.6, y: y * 0.6 }, { dot: false, showLabel: false }));
      f.add('poly', { t: 'polygon', pts: ids }, { fill: colours[i], fillOpacity: 0.85 });
    });
    return f;
  }),
  T('collinear', 2, 'Ba điểm thẳng hàng', 'Three points in a line', () => {
    const f = new Fig();
    f.pt('A', 0, 0);
    f.pt('B', 2.5, 0.6);
    f.pt('C', 5, 1.2);
    f.pt('D', 2, 2.4);
    f.add('l', { t: 'line', a: f.id('A'), b: f.id('C') });
    return f;
  }),
  T('quad', 2, 'Hình tứ giác ABCD', 'Quadrilateral ABCD', () => {
    const f = new Fig();
    f.pt('A', 0, 0);
    f.pt('B', 4.5, 0);
    f.pt('C', 5, 2.8);
    f.pt('D', 1, 3.2);
    f.poly(['A', 'B', 'C', 'D']);
    return f;
  }),
  /* ---------------- lớp 3 ---------------- */
  T('rect34', 3, 'Hình chữ nhật 4 cm × 3 cm', 'Rectangle 4 cm × 3 cm', () => {
    const f = new Fig();
    for (const [l, x, y] of [['A', 0, 0], ['B', 4, 0], ['C', 4, 3], ['D', 0, 3]] as const) f.pt(l, x, y);
    f.poly(['A', 'B', 'C', 'D']);
    f.seg('A', 'B', { showValue: true, hidden: false });
    f.seg('B', 'C', { showValue: true });
    for (const [a, v, b] of [['B', 'A', 'D'], ['A', 'B', 'C'], ['B', 'C', 'D'], ['C', 'D', 'A']] as const) f.angle(a, v, b);
    return f;
  }),
  T('square3', 3, 'Hình vuông cạnh 3 cm', 'Square, side 3 cm', () => {
    const f = new Fig();
    for (const [l, x, y] of [['A', 0, 0], ['B', 3, 0], ['C', 3, 3], ['D', 0, 3]] as const) f.pt(l, x, y);
    f.poly(['A', 'B', 'C', 'D']);
    for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']] as const) f.seg(a, b, { ticks: 1 });
    f.angle('B', 'A', 'D');
    return f;
  }),
  T('circleRadius', 3, 'Hình tròn tâm O, bán kính OA, đường kính MN', 'Circle O, radius OA, diameter MN', () => {
    const f = new Fig();
    f.pt('O', 0, 0);
    const A = f.pt('A', 1.5, 2);
    f.add('c', { t: 'circle', center: f.id('O'), through: A });
    f.seg('O', 'A');
    f.add('p', { t: 'pointOn', on: f.c.objects[f.c.objects.length - 2].id, param: Math.PI * 0.92 }, { label: 'M' });
    f.add('p', { t: 'image', of: f.id('M'), tr: { k: 'reflectPoint', center: f.id('O') } }, { label: 'N' });
    f.seg('M', 'N');
    return f;
  }),
  T('midpoint', 3, 'Trung điểm M của đoạn thẳng AB', 'Midpoint M of AB', () => {
    const f = new Fig();
    f.pt('A', 0, 0);
    f.pt('B', 5, 0);
    f.seg('A', 'B');
    f.tool('midpoint', ['A', 'B'], undefined, { halves: true });
    f.name(f.c.objects.filter((o) => o.def.t === 'midpoint'), 'M');
    return f;
  }),
  /* ---------------- lớp 4 ---------------- */
  T('perpLines', 4, 'Hai đường thẳng vuông góc', 'Perpendicular lines', () => {
    const f = new Fig();
    f.pt('A', -2.5, 0, { dot: false, showLabel: false });
    f.pt('B', 2.5, 0, { dot: false, showLabel: false });
    const ab = f.add('l', { t: 'line', a: f.id('A'), b: f.id('B') });
    f.pt('O', 0, 0);
    f.pt('C', 0, 2.2, { dot: false, showLabel: false });
    f.pt('D', 0, -2.2, { dot: false, showLabel: false });
    const cd = f.add('l', { t: 'line', a: f.id('D'), b: f.id('C') });
    f.add('ang', { t: 'angleLines', l1: ab, l2: cd, s1: 1, s2: 1 });
    return f;
  }),
  T('parallelLines', 4, 'Hai đường thẳng song song', 'Parallel lines', () => {
    const f = new Fig();
    f.pt('A', 0, 0);
    f.pt('B', 5, 0);
    f.pt('C', 1, 1.8);
    const ab = f.add('l', { t: 'line', a: f.id('A'), b: f.id('B') }, { label: 'a', showLabel: true });
    f.add('l', { t: 'parallel', line: ab, through: f.id('C') }, { label: 'b', showLabel: true });
    return f;
  }),
  T('parallelogram', 4, 'Hình bình hành ABCD', 'Parallelogram ABCD', () => {
    const f = new Fig();
    f.pt('A', 0, 0);
    f.pt('B', 4.5, 0);
    f.pt('C', 5.8, 2.5);
    f.names(f.tool('parallelogram', ['A', 'B', 'C']), ['D']);
    return f;
  }),
  T('rhombus', 4, 'Hình thoi ABCD', 'Rhombus ABCD', () => {
    const f = new Fig();
    f.pt('A', 0, 0);
    f.pt('B', 3, -1.4);
    f.pt('C', 6, 0);
    f.pt('D', 3, 1.4);
    f.poly(['A', 'B', 'C', 'D']);
    for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']] as const) f.seg(a, b, { ticks: 1 });
    return f;
  }),
  T('angleKinds', 4, 'Góc nhọn, góc vuông, góc tù, góc bẹt', 'Acute, right, obtuse and straight angles', () => {
    const f = new Fig();
    const kinds: [number, number][] = [[50, 0], [90, 4], [130, 8.5], [180, 13.5]];
    kinds.forEach(([deg, x], i) => {
      const O = f.pt(['O', 'P', 'Q', 'R'][i], x, 0);
      const a = f.add('p', { t: 'pointPolar', center: O, r: 2.4, deg: 0 }, { dot: false, showLabel: false });
      const b = f.add('p', { t: 'pointPolar', center: O, r: 2.4, deg }, { dot: false, showLabel: false });
      f.add('l', { t: 'ray', a: O, b: a });
      f.add('l', { t: 'ray', a: O, b });
      f.add('ang', { t: 'angle', a, b: O, c: b }, deg === 90 ? {} : { showValue: true });
    });
    return f;
  }),
  /* ---------------- lớp 5 ---------------- */
  T('triangleHeight', 5, 'Tam giác ABC, đáy BC, chiều cao AH', 'Triangle ABC, base BC, height AH', () => {
    const f = new Fig();
    f.pt('A', 1.5, 3);
    f.pt('B', 0, 0);
    f.pt('C', 5, 0);
    f.poly(['A', 'B', 'C']);
    f.tool('baseHeight', ['B', 'C', 'A']);
    return f;
  }),
  T('trapezoidHeight', 5, 'Hình thang ABCD có chiều cao AH', 'Trapezoid ABCD with height AH', () => {
    const f = new Fig();
    f.pt('A', 1, 2.5);
    f.pt('B', 4, 2.5);
    f.pt('C', 5.5, 0);
    f.pt('D', 0, 0);
    f.poly(['A', 'B', 'C', 'D']);
    f.tool('baseHeight', ['D', 'C', 'A']);
    return f;
  }),
  T('pie', 5, 'Hình tròn chia 4 phần, tô 1 phần', 'Circle in quarters, one coloured', () => {
    const f = new Fig();
    f.pt('O', 0, 0, { showLabel: false });
    const R = f.pt('R', 2, 0, { hidden: true });
    const c = f.add('c', { t: 'circle', center: f.id('O'), through: R });
    f.add('frac', { t: 'fraction', of: c, n: 4, filled: [0] }, { showValue: true });
    return f;
  }),
  T('cuboid', 5, 'Hình hộp chữ nhật ABCD.A′B′C′D′', 'Cuboid ABCD.A′B′C′D′', () => {
    const f = new Fig();
    const A = f.pt('A', 0, 0);
    f.tool('cuboid', [A], '4; 3; 2,5');
    return f;
  }),
  T('cube', 5, 'Hình lập phương ABCD.A′B′C′D′', 'Cube ABCD.A′B′C′D′', () => {
    const f = new Fig();
    f.tool('cube', [f.pt('A', 0, 0)], '3');
    return f;
  }),
  T('cylinder', 5, 'Hình trụ', 'Cylinder', () => {
    const f = new Fig();
    f.tool('cylinder', [f.pt('O', 0, 0)], '1,5; 3,5');
    return f;
  }),
  /* ---------------- lớp 6 ---------------- */
  T('angleXOY', 6, 'Góc xOy', 'Angle xOy', () => {
    const f = new Fig();
    const O = f.pt('O', 0, 0);
    const x = f.pt('x', 4, 0, { dot: false });
    const y = f.pt('y', 2.4, 2.8, { dot: false });
    f.add('l', { t: 'ray', a: O, b: x });
    f.add('l', { t: 'ray', a: O, b: y });
    f.add('ang', { t: 'angle', a: x, b: O, c: y });
    return f;
  }),
  T('oppositeRays', 6, 'Hai tia đối nhau Ox, Oy', 'Opposite rays Ox, Oy', () => {
    const f = new Fig();
    const O = f.pt('O', 0, 0);
    const x = f.pt('x', 3.5, 0, { dot: false });
    const y = f.pt('y', -3.5, 0, { dot: false });
    f.add('l', { t: 'ray', a: O, b: x });
    f.add('l', { t: 'ray', a: O, b: y });
    return f;
  }),
  T('hexagon', 6, 'Lục giác đều ABCDEF', 'Regular hexagon ABCDEF', () => {
    const f = new Fig();
    f.pt('A', 0, 0);
    f.pt('B', 2.5, 0);
    f.names(f.tool('regularPolygon', ['A', 'B'], '6'), ['C', 'D', 'E', 'F']);
    return f;
  }),
  T('symmetryAxis', 6, 'Hình có trục đối xứng (tam giác cân)', 'Shape with an axis of symmetry', () => {
    const f = new Fig();
    f.pt('B', 0, 0);
    f.pt('C', 4, 0);
    const made = f.tool('triangleIso', ['B', 'C']);
    f.name(made, 'A');
    f.tool('perpBisector', ['B', 'C']);
    const axis = f.c.objects.find((o) => o.def.t === 'perpBisector');
    if (axis) f.style(axis.id, { dash: 'dashed', label: 'd', showLabel: true });
    return f;
  }),
  /* ---------------- lớp 7 ---------------- */
  T('isoAltitude', 7, 'Tam giác ABC cân tại A, đường cao AH', 'Isosceles triangle ABC, altitude AH', () => {
    const f = new Fig();
    f.pt('B', 0, 0);
    f.pt('C', 4.5, 0);
    f.name(f.tool('triangleIso', ['B', 'C']), 'A');
    f.names(f.tool('altitude', ['A', 'B', 'C']), ['H']);
    return f;
  }),
  T('rightTriangle', 7, 'Tam giác ABC vuông tại A', 'Right triangle ABC (right angle at A)', () => {
    const f = new Fig();
    f.pt('A', 0, 0);
    f.pt('B', 0, 3);
    f.pt('C', 4, 0);
    f.poly(['A', 'B', 'C']);
    f.angle('B', 'A', 'C');
    return f;
  }),
  T('crossing', 7, 'Hai đường thẳng cắt nhau (góc đối đỉnh)', 'Crossing lines (vertical angles)', () => {
    const f = new Fig();
    f.tool('crossLines', [f.pt('O', 0, 0)], undefined, { fresh: ['O'] });
    return f;
  }),
  T('transversal', 7, 'Hai đường thẳng song song và một cát tuyến', 'Parallel lines and a transversal', () => {
    const f = new Fig();
    const M = f.pt('M', 0, 0);
    f.tool('parallelTransversal', [M], undefined, { fresh: [M] });
    return f;
  }),
  T('congruent', 7, 'Hai tam giác bằng nhau ABC và DEF', 'Congruent triangles ABC and DEF', () => {
    const f = new Fig();
    const pts: [string, number, number][] = [['A', 1.2, 2.8], ['B', 0, 0], ['C', 4, 0], ['D', 7.2, 2.8], ['E', 6, 0], ['F', 10, 0]];
    pts.forEach(([l, x, y]) => f.pt(l, x, y));
    f.poly(['A', 'B', 'C']);
    f.poly(['D', 'E', 'F']);
    for (const [[a, b], [d, e], k] of [[['A', 'B'], ['D', 'E'], 1], [['B', 'C'], ['E', 'F'], 2], [['C', 'A'], ['F', 'D'], 3]] as const) {
      f.seg(a, b, { ticks: k });
      f.seg(d, e, { ticks: k });
    }
    return f;
  }),
  T('medians', 7, 'Ba đường trung tuyến và trọng tâm G', 'The three medians and the centroid G', () => {
    const f = new Fig();
    f.pt('A', 1.5, 4);
    f.pt('B', 0, 0);
    f.pt('C', 5.5, 0);
    f.poly(['A', 'B', 'C']);
    f.tool('medians3', ['A', 'B', 'C']);
    return f;
  }),
  T('prism', 7, 'Hình lăng trụ đứng tam giác ABC.A′B′C′', 'Right prism ABC.A′B′C′', () => {
    const f = new Fig();
    f.tool('prism3', [f.pt('P', 0, 0)], '4; 3; 3,5', { fresh: ['P'] });
    return f;
  }),
  /* ---------------- lớp 8 ---------------- */
  T('midline', 8, 'Đường trung bình MN của tam giác ABC', 'Midline MN of triangle ABC', () => {
    const f = new Fig();
    f.pt('A', 1.5, 3.5);
    f.pt('B', 0, 0);
    f.pt('C', 5.5, 0);
    f.poly(['A', 'B', 'C']);
    f.names(f.tool('midline', ['A', 'B', 'C']), ['M', 'N']);
    return f;
  }),
  T('thales', 8, 'Định lí Thales: DE ∥ BC', 'Intercept theorem: DE ∥ BC', () => {
    const f = new Fig();
    f.pt('A', 2, 4);
    f.pt('B', 0, 0);
    f.pt('C', 6, 0);
    f.poly(['A', 'B', 'C']);
    const ab = f.add('s', { t: 'segment', a: f.id('A'), b: f.id('B') }, { hidden: true });
    const D = f.add('p', { t: 'pointOn', on: ab, param: 2.6 }, { label: 'D' });
    const bc = f.add('l', { t: 'line', a: f.id('B'), b: f.id('C') }, { hidden: true });
    const par = f.add('l', { t: 'parallel', line: bc, through: D }, { hidden: true });
    const ac = f.add('s', { t: 'segment', a: f.id('A'), b: f.id('C') }, { hidden: true });
    f.add('p', { t: 'intersection', a: par, b: ac, index: 0 }, { label: 'E' });
    f.seg('D', 'E');
    return f;
  }),
  T('parallelogramDiagonals', 8, 'Hình bình hành ABCD và hai đường chéo', 'Parallelogram ABCD and its diagonals', () => {
    const f = new Fig();
    f.pt('A', 0, 0);
    f.pt('B', 4.5, 0);
    f.pt('C', 6, 2.6);
    f.names(f.tool('parallelogram', ['A', 'B', 'C']), ['D']);
    const poly = f.c.objects.find((o) => o.def.t === 'polygon')!;
    f.tool('diagonals', [poly.id]);
    return f;
  }),
  T('isoTrapezoid', 8, 'Hình thang cân ABCD', 'Isosceles trapezoid ABCD', () => {
    const f = new Fig();
    f.pt('A', 0, 0);
    f.pt('B', 6, 0);
    f.pt('C', 4.5, 2.5);
    f.names(f.tool('trapezoidIso', ['A', 'B', 'C']), ['D']);
    return f;
  }),
  T('pyramid', 8, 'Hình chóp tứ giác đều S.ABCD', 'Square pyramid S.ABCD', () => {
    const f = new Fig();
    f.tool('pyramid4', [f.pt('A', 0, 0)], '4; 4; 4');
    return f;
  }),
  /* ---------------- lớp 9 ---------------- */
  T('tangentAtA', 9, 'Đường tròn (O) và tiếp tuyến tại A', 'Circle (O) and the tangent at A', () => {
    const f = new Fig();
    f.pt('O', 0, 0);
    const R = f.pt('R', 2, 0, { hidden: true });
    const c = f.add('c', { t: 'circle', center: f.id('O'), through: R });
    const A = f.add('p', { t: 'pointOn', on: c, param: 1.0 }, { label: 'A' });
    f.tool('tangent', [A, c]);
    return f;
  }),
  T('twoTangents', 9, 'Hai tiếp tuyến cắt nhau tại M', 'Two tangents meeting at M', () => {
    const f = new Fig();
    f.pt('O', 0, 0);
    const R = f.pt('R', 2, 0, { hidden: true });
    const c = f.add('c', { t: 'circle', center: f.id('O'), through: R });
    f.pt('M', 5, 0);
    f.names(f.tool('tangent', ['M', c]), ['A', 'B']);
    f.seg('O', 'M', { dash: 'dashed' });
    return f;
  }),
  T('inscribed', 9, 'Góc nội tiếp và góc ở tâm', 'Inscribed and central angles', () => {
    const f = new Fig();
    f.pt('O', 0, 0);
    const R = f.pt('R', 2.4, 0, { hidden: true });
    const c = f.add('c', { t: 'circle', center: f.id('O'), through: R });
    f.names(f.tool('inscribedAngle', [c]), ['A', 'B', 'M']);
    return f;
  }),
  T('cyclicQuad', 9, 'Tứ giác ABCD nội tiếp đường tròn (O)', 'Cyclic quadrilateral ABCD', () => {
    const f = new Fig();
    f.pt('O', 0, 0);
    const R = f.pt('R', 2.5, 0, { hidden: true });
    const c = f.add('c', { t: 'circle', center: f.id('O'), through: R });
    ['A', 'B', 'C', 'D'].forEach((l, i) => f.add('p', { t: 'pointOn', on: c, param: [3.7, 5.3, 0.5, 2.1][i] }, { label: l }));
    f.poly(['A', 'B', 'C', 'D']);
    return f;
  }),
  T('circumscribed', 9, 'Tam giác ABC nội tiếp đường tròn (O)', 'Triangle ABC inscribed in a circle (O)', () => {
    const f = new Fig();
    f.pt('A', 1.2, 3.2);
    f.pt('B', 0, 0);
    f.pt('C', 4.5, 0);
    f.poly(['A', 'B', 'C']);
    f.tool('circumcircle', ['A', 'B', 'C']);
    return f;
  }),
  T('rightAltitude', 9, 'Tam giác vuông ABC, đường cao AH (hệ thức lượng)', 'Right triangle ABC with altitude AH', () => {
    const f = new Fig();
    f.pt('A', 1.8, 2.4);
    f.pt('B', 0, 0);
    f.pt('C', 5, 0);
    f.poly(['A', 'B', 'C']);
    f.angle('B', 'A', 'C');
    f.names(f.tool('altitude', ['A', 'B', 'C']), ['H']);
    return f;
  }),
  T('cone', 9, 'Hình nón', 'Cone', () => {
    const f = new Fig();
    f.tool('cone', [f.pt('O', 0, 0)], '1,8; 3,5');
    return f;
  }),
  T('sphere', 9, 'Hình cầu', 'Sphere', () => {
    const f = new Fig();
    f.tool('sphere', [f.pt('O', 0, 0)], '2');
    return f;
  }),
  /* ---------------- lớp 10 ---------------- */
  T('vectorSum', 10, 'Tổng hai vectơ (quy tắc hình bình hành)', 'Sum of two vectors (parallelogram rule)', () => {
    const f = new Fig();
    f.pt('A', 0, 0);
    f.pt('B', 4, 0);
    f.pt('D', 1.2, 2.4);
    const ab = f.add('v', { t: 'vector', a: f.id('A'), b: f.id('B') });
    f.add('v', { t: 'vector', a: f.id('A'), b: f.id('D') });
    void ab;
    const ad = f.c.objects[f.c.objects.length - 1].id;
    f.add('p', { t: 'image', of: f.id('B'), tr: { k: 'translate', vector: ad } }, { label: 'C' });
    f.seg('B', 'C', { dash: 'dashed' });
    f.seg('D', 'C', { dash: 'dashed' });
    f.add('v', { t: 'vector', a: f.id('A'), b: f.id('C') }, { width: 1.8 });
    return f;
  }),
  T('parabola', 10, 'Đồ thị y = x² − 2x − 1', 'Graph of y = x² − 2x − 1', () => {
    const f = new Fig({ axes: true, grid: true, view: { xmin: -3, xmax: 5, ymin: -3, ymax: 4 } });
    f.add('f', { t: 'function', expr: 'x^2-2x-1', from: -1.4, to: 3.4 }, { label: 'y = x² − 2x − 1', showLabel: false });
    f.pt('I', 1, -2);
    return f;
  }),
];

export const templatesForGrade = (g: number | 'all') => TEMPLATES.filter((t) => g === 'all' || t.grade <= g);
