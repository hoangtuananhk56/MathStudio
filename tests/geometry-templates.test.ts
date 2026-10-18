/** Every template builds, computes and renders; names are the textbook ones. */
import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/geometry/engine';
import { renderConstruction } from '../src/geometry/render';
import { TEMPLATES } from '../src/geometry/templates';

describe('template library', () => {
  for (const t of TEMPLATES) {
    it(`${t.grade} · ${t.vi}`, () => {
      const c = t.build();
      const v = computeAll(c);
      const broken = c.objects.filter((o) => !o.style.hidden && !v.get(o.id));
      expect(broken.map((o) => `${o.id}:${o.def.t}`)).toEqual([]);
      const svg = renderConstruction(c, v, { mode: 'export', view: c.view, scale: 1 }).svg;
      expect(svg.length).toBeGreaterThan(200);
      // visible point names are unique
      const names = c.objects.filter((o) => !o.style.hidden && o.style.label && v.get(o.id)?.k === 'point' && o.style.showLabel !== false).map((o) => o.style.label);
      expect(new Set(names).size).toBe(names.length);
    });
  }
  it('ids are unique and grades are in range', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    TEMPLATES.forEach((t) => expect(t.grade >= 2 && t.grade <= 10).toBe(true));
  });
});
