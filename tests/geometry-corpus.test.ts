/** "Gõ đề ra hình" on a corpus of real exercises: each figure is checked, and coverage measured. */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeAll, type Value, type Values, type Vec } from '../src/geometry/engine';
import { figureFromText } from '../src/geometry/fromText';
import type { Construction } from '../src/geometry/model';
import { EXERCISES, type Expect } from './corpus/exercises';

const d = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

function check(c: Construction, v: Values, e: Expect): string[] {
  const bad: string[] = [];
  const P = (l: string): Vec | null => {
    const o = c.objects.find((x) => x.style.label === l && v.get(x.id)?.k === 'point');
    return o ? (v.get(o.id) as Extract<Value, { k: 'point' }>).p : null;
  };
  const need = (l: string) => {
    const p = P(l);
    if (!p) bad.push(`thiếu điểm ${l}`);
    return p;
  };
  const two = (s: string) => s.match(/[A-Z]'?|[a-z]'?/g)!;
  for (const l of e.points ?? []) need(l);
  for (const s of e.segments ?? []) {
    const [a, b] = two(s).map(need);
    if (!a || !b) continue;
    const drawn = c.objects.some((o) => {
      if (o.style.hidden) return false;
      const val = v.get(o.id);
      if (val?.k === 'straight') return [val.a, val.b].every((q) => d(q, a) < 1e-6 || d(q, b) < 1e-6) && d(val.a, val.b) > 1e-6;
      if (val?.k === 'polygon') return val.pts.some((q, i) => { const r = val.pts[(i + 1) % val.pts.length]; return (d(q, a) < 1e-6 && d(r, b) < 1e-6) || (d(q, b) < 1e-6 && d(r, a) < 1e-6); });
      if (val?.k === 'solid') return val.edges.some((ed) => [val.verts[ed.a], val.verts[ed.b]].every((q) => d(q, a) < 1e-6 || d(q, b) < 1e-6));
      return false;
    });
    if (!drawn) bad.push(`chưa vẽ ${s}`);
  }
  for (const [a, o, b] of e.right ?? []) {
    const [A, O, Bp] = [a, o, b].map(need);
    if (!A || !O || !Bp) continue;
    const dotp = (A.x - O.x) * (Bp.x - O.x) + (A.y - O.y) * (Bp.y - O.y);
    if (Math.abs(dotp) > 1e-6 * (1 + d(A, O) * d(Bp, O))) bad.push(`${a}${o} không ⊥ ${o}${b}`);
  }
  for (const [m, a, b] of e.mid ?? []) {
    const [M, A, Bp] = [m, a, b].map(need);
    if (M && A && Bp && d(M, { x: (A.x + Bp.x) / 2, y: (A.y + Bp.y) / 2 }) > 1e-6) bad.push(`${m} không là trung điểm ${a}${b}`);
  }
  for (const [p, a, b] of e.on ?? []) {
    const [X, A, Bp] = [p, a, b].map(need);
    if (X && A && Bp && Math.abs((Bp.x - A.x) * (X.y - A.y) - (Bp.y - A.y) * (X.x - A.x)) > 1e-6 * (1 + d(A, Bp) ** 2)) bad.push(`${p} không thuộc ${a}${b}`);
  }
  for (const [s1, s2] of e.parallel ?? []) {
    const [a, b] = two(s1).map(need);
    const [c2, d2] = two(s2).map(need);
    if (a && b && c2 && d2 && Math.abs((b.x - a.x) * (d2.y - c2.y) - (b.y - a.y) * (d2.x - c2.x)) > 1e-6 * (1 + d(a, b) * d(c2, d2))) bad.push(`${s1} không ∥ ${s2}`);
  }
  for (const [s, L] of Object.entries(e.len ?? {})) {
    const [a, b] = two(s).map(need);
    if (a && b && Math.abs(d(a, b) - L) > 1e-3) bad.push(`${s} = ${d(a, b).toFixed(3)} (cần ${L})`);
  }
  for (const [s1, s2, k] of e.ratio ?? []) {
    const [a, b] = two(s1).map(need);
    const [c2, d2] = two(s2).map(need);
    if (a && b && c2 && d2 && Math.abs(d(a, b) / d(c2, d2) - k) > 1e-3) bad.push(`${s1}/${s2} = ${(d(a, b) / d(c2, d2)).toFixed(3)} (cần ${k.toFixed(3)})`);
  }
  if (e.solid && ![...v.values()].some((x) => x?.k === 'solid')) bad.push('chưa vẽ hình khối');
  for (const [l, [x, y]] of Object.entries(e.at ?? {})) {
    const p = need(l);
    if (p && (Math.abs(p.x - x) > 1e-9 || Math.abs(p.y - y) > 1e-9)) bad.push(`${l} ở (${p.x}; ${p.y})`);
  }
  return bad;
}

describe('exercise corpus', () => {
  const stats = new Map<number, { ok: number; all: number }>();
  const lines: string[] = [];
  for (const ex of EXERCISES) {
    it(`lớp ${ex.grade}: ${ex.text.slice(0, 90)}`, () => {
      const r = figureFromText(ex.text);
      const v = computeAll(r.construction);
      const bad = check(r.construction, v, ex.expect);
      const clauses = r.sentences.flatMap((s) => (s.status === 'skip' ? [] : s.clauses));
      const st = stats.get(ex.grade) ?? { ok: 0, all: 0 };
      st.ok += clauses.filter((c) => c.ok).length;
      st.all += clauses.length;
      stats.set(ex.grade, st);
      const notOk = clauses.filter((c) => !c.ok).map((c) => c.text);
      lines.push(`${bad.length || notOk.length ? '✗' : '✓'} [${ex.grade}] ${ex.text}\n${bad.map((b) => `    ! ${b}`).join('\n')}${notOk.length ? `\n    ? ${notOk.join(' | ')}` : ''}${r.sentences.some((s) => s.errors.length) ? `\n    E ${r.sentences.flatMap((s) => s.errors).join(' | ')}` : ''}`);
      expect(bad).toEqual([]);
    });
  }
  it('understands at least 90% of the clauses in every year', () => {
    const report = [...stats.entries()].sort((a, b) => a[0] - b[0]).map(([g, s]) => `lớp ${g}: ${s.ok}/${s.all} = ${((100 * s.ok) / Math.max(1, s.all)).toFixed(1)}%`);
    const all = [...stats.values()].reduce((a, s) => ({ ok: a.ok + s.ok, all: a.all + s.all }), { ok: 0, all: 0 });
    report.push(`tổng: ${all.ok}/${all.all} = ${((100 * all.ok) / all.all).toFixed(1)}%`);
    if (process.env.CORPUS_REPORT) writeFileSync(process.env.CORPUS_REPORT, `${report.join('\n')}\n\n${lines.join('\n')}\n`, 'utf8');
    for (const s of stats.values()) expect(s.ok / Math.max(1, s.all)).toBeGreaterThanOrEqual(0.9);
  });
});
