import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/geometry/engine';
import { figureFromText } from '../src/geometry/fromText';
import type { Construction } from '../src/geometry/model';
import { dist3, type Vec3 } from '../src/geometry/space';

function at(c: Construction, label: string): Vec3 {
  const v = computeAll(c);
  const o = c.objects.find((x) => x.style.label === label && v.get(x.id)?.k === 'point');
  const val = o ? v.get(o.id) : null;
  if (val?.k !== 'point' || !val.p3) throw new Error(`no 3D point ${label}`);
  return val.p3;
}
const mid = (a: Vec3, b: Vec3): Vec3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

describe('solid geometry exercises (grade 11) typed as text', () => {
  it('pyramid with a parallelogram base: centre, midpoint, (SAC) ∩ (SBD), AM ∩ (SBD)', () => {
    const r = figureFromText(
      'Cho hình chóp S.ABCD có đáy ABCD là hình bình hành tâm O. Gọi M là trung điểm của SC. Tìm giao tuyến của (SAC) và (SBD). Tìm giao điểm I của AM và (SBD).',
    );
    const c = r.construction;
    expect(c.objects.some((o) => o.def.t === 'solid3')).toBe(true);
    const [S, A, C, O, M, I] = ['S', 'A', 'C', 'O', 'M', 'I'].map((n) => at(c, n));
    expect(dist3(O, mid(A, C))).toBeLessThan(1e-9);
    expect(dist3(M, mid(S, C))).toBeLessThan(1e-9);
    // I is the centroid of triangle SAC: on SO, two thirds from S
    expect(dist3(S, I) / dist3(S, O)).toBeCloseTo(2 / 3, 6);
    // the line where the planes meet is drawn, as part of the answer
    const gl = c.objects.find((o) => o.def.t === 'planeLine3');
    expect(gl?.style.answer).toBe(true);
    expect(c.objects.find((o) => o.style.label === 'I')?.style.answer).toBe(true);
    // every sentence understood
    expect(r.sentences.every((s) => s.status === 'ok')).toBe(true);
  });

  it('tetrahedron: points on edges and the section (MNP)', () => {
    const r = figureFromText(
      'Cho tứ diện ABCD. Gọi M, N lần lượt là trung điểm của AB, AC. Lấy điểm P thuộc cạnh BD sao cho BP = 2PD. Xác định thiết diện của tứ diện cắt bởi mặt phẳng (MNP).',
    );
    const c = r.construction;
    const [B, D, P] = ['B', 'D', 'P'].map((n) => at(c, n));
    expect(dist3(B, P) / dist3(B, D)).toBeCloseTo(2 / 3, 6);
    const sec = computeAll(c).get(c.objects.find((o) => o.def.t === 'section3')!.id);
    expect(sec?.k === 'section3' && sec.pts3.length).toBe(4);
    // the fourth corner (on CD) is named
    expect(c.objects.filter((o) => o.def.t === 'secV3')).toHaveLength(1);
  });

  it('SA ⊥ (ABCD), square base: the projection of A on SB', () => {
    const r = figureFromText('Cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh 4 cm, SA vuông góc với mặt phẳng (ABCD). Gọi H là hình chiếu của A trên SB.');
    const c = r.construction;
    const [S, A, B, H] = ['S', 'A', 'B', 'H'].map((n) => at(c, n));
    // S right above A; AH ⊥ SB
    expect(Math.hypot(S.x - A.x, S.y - A.y)).toBeLessThan(1e-9);
    const sb = { x: B.x - S.x, y: B.y - S.y, z: B.z - S.z };
    const ah = { x: H.x - A.x, y: H.y - A.y, z: H.z - A.z };
    expect(sb.x * ah.x + sb.y * ah.y + sb.z * ah.z).toBeCloseTo(0, 9);
    expect(dist3(A, B)).toBeCloseTo(4, 9);
  });
});
