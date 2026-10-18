/** "Gõ đề ra hình": typical Vietnamese exercises become figures. */
import { describe, expect, it } from 'vitest';
import { computeAll, type Value, type Values, type Vec } from '../src/geometry/engine';
import { figureFromText } from '../src/geometry/fromText';
import type { Construction } from '../src/geometry/model';

const get = (c: Construction) => {
  const v = computeAll(c);
  const P = (l: string): Vec => {
    const o = c.objects.find((x) => x.style.label === l && v.get(x.id)?.k === 'point');
    if (!o) throw new Error(`no ${l}`);
    return (v.get(o.id) as Extract<Value, { k: 'point' }>).p;
  };
  return { v, P };
};
const d = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const angleAt = (a: Vec, o: Vec, b: Vec) => (Math.acos(((a.x - o.x) * (b.x - o.x) + (a.y - o.y) * (b.y - o.y)) / (d(a, o) * d(b, o))) * 180) / Math.PI;
const rightMarks = (c: Construction, v: Values) => [...v.entries()].filter(([id, x]) => x?.k === 'angle' && Math.abs(x.deg - 90) < 1e-6 && !c.objects.find((o) => o.id === id)?.style.hidden).length;

describe('figures from the wording of an exercise', () => {
  it('right triangle with two legs, altitude and midpoint', () => {
    const r = figureFromText('Cho tam giác ABC vuông tại A có AB = 3 cm, AC = 4 cm. Kẻ đường cao AH. Gọi M là trung điểm của BC.');
    const { v, P } = get(r.construction);
    expect(d(P('B'), P('C'))).toBeCloseTo(5, 6);
    expect(angleAt(P('B'), P('A'), P('C'))).toBeCloseTo(90, 6);
    expect(angleAt(P('A'), P('H'), P('B'))).toBeCloseTo(90, 6);
    expect(d(P('M'), P('B'))).toBeCloseTo(2.5, 6);
    expect(rightMarks(r.construction, v)).toBeGreaterThanOrEqual(2);
    expect(r.missed).toEqual([]);
  });

  it('isosceles triangle with its altitude', () => {
    const r = figureFromText('Cho tam giác ABC cân tại A, đường cao AH.');
    const { P } = get(r.construction);
    expect(d(P('A'), P('B'))).toBeCloseTo(d(P('A'), P('C')), 6);
    expect(d(P('H'), P('B'))).toBeCloseTo(d(P('H'), P('C')), 6);
  });

  it('two sides and the angle between them; a perpendicular with its foot', () => {
    const r = figureFromText('Cho tam giác ABC có AB = 5 cm, BC = 6 cm, góc B = 60°. Kẻ AH vuông góc với BC tại H.');
    const { P } = get(r.construction);
    expect(d(P('A'), P('B'))).toBeCloseTo(5, 6);
    expect(d(P('B'), P('C'))).toBeCloseTo(6, 6);
    expect(angleAt(P('A'), P('B'), P('C'))).toBeCloseTo(60, 6);
    expect(d(P('H'), P('B'))).toBeCloseTo(2.5, 6);
  });

  it('equilateral triangle with a side; altitudes meeting at H', () => {
    const r = figureFromText('Cho tam giác đều ABC cạnh 4 cm. Các đường cao BD, CE cắt nhau tại H.');
    const { P } = get(r.construction);
    expect(d(P('A'), P('B'))).toBeCloseTo(4, 6);
    expect(d(P('H'), P('A'))).toBeCloseTo(d(P('H'), P('B')), 6); // the centre of an equilateral triangle
    expect(angleAt(P('B'), P('D'), P('A'))).toBeCloseTo(90, 6);
  });

  it('rectangle with its diagonals crossing at O', () => {
    const r = figureFromText('Cho hình chữ nhật ABCD có AB = 6 cm, BC = 4 cm. Gọi O là giao điểm của AC và BD.');
    const { P } = get(r.construction);
    expect(d(P('A'), P('B'))).toBeCloseTo(6, 6);
    expect(d(P('B'), P('C'))).toBeCloseTo(4, 6);
    expect(P('O').x).toBeCloseTo(3, 9);
    expect(P('O').y).toBeCloseTo(2, 9);
  });

  it('circle with two tangents from an outside point', () => {
    const r = figureFromText('Cho đường tròn (O; 3 cm) và điểm M nằm ngoài đường tròn. Từ M kẻ hai tiếp tuyến MA, MB với đường tròn.');
    const { P } = get(r.construction);
    expect(d(P('A'), P('O'))).toBeCloseTo(3, 6);
    expect(d(P('B'), P('O'))).toBeCloseTo(3, 6);
    expect(angleAt(P('O'), P('A'), P('M'))).toBeCloseTo(90, 6);
  });

  it('reflection, point on a side and a centroid', () => {
    const r = figureFromText('Cho tam giác ABC. Gọi M là trung điểm của BC. Lấy D đối xứng với A qua M. G là trọng tâm của tam giác ABC.');
    const { P } = get(r.construction);
    const M = P('M');
    expect(d(P('D'), M)).toBeCloseTo(d(P('A'), M), 6);
    const g = P('G');
    expect(g.x).toBeCloseTo((P('A').x + P('B').x + P('C').x) / 3, 6);
  });

  it('impossible sides and unknown wording are reported', () => {
    expect(() => figureFromText('Cho tam giác ABC có AB = 1 cm, AC = 2 cm, BC = 10 cm.')).toThrow(/tam giác/);
    const r = figureFromText('Cho tam giác ABC. Vẽ hình bông hoa đẹp.');
    expect(r.missed).toContain('Vẽ hình bông hoa đẹp');
    expect(() => figureFromText('Một bài toán không có hình.')).toThrow(/Chưa nhận ra/);
  });
});
