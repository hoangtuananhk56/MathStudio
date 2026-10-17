import { describe, expect, it } from 'vitest';
import { renderSvg, type ImageFont } from '../src/core/render-svg';
import { SAMPLES } from './samples';

describe('LaTeX -> SVG (MathJax)', () => {
  for (const font of ['termes', 'stix2', 'newcm'] as ImageFont[]) {
    it(`renders every sample with ${font}`, async () => {
      for (const s of SAMPLES) {
        const r = await renderSvg(s.latex, false, font);
        expect(r.svg, s.name).toMatch(/^<svg[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
        expect(r.svg, s.name).not.toContain('currentColor');
        expect(r.svg, s.name).not.toContain('<use'); // self-contained
        expect(r.svg, s.name).not.toMatch(/merror|data-mjx-error/);
        expect(r.width, s.name).toBeGreaterThan(0);
        expect(r.height + r.depth, s.name).toBeGreaterThan(0);
      }
    });
  }

  it('loads dynamic glyph ranges (arrows, double-struck)', async () => {
    const r = await renderSvg(String.raw`A\Leftrightarrow B,\ x\in\mathbb{R},\ \overrightarrow{AB}`, false, 'termes');
    expect(r.svg).toContain('<path');
  });

  it('keeps the whole expression in one picture (no inline line-break pieces)', async () => {
    const r = await renderSvg('x+y=z', false, 'termes');
    expect((r.svg.match(/<path/g) ?? []).length).toBe(5);
    expect((r.svg.match(/<svg/g) ?? []).length).toBe(1);
    expect(r.width).toBeGreaterThan(2.5);
  });

  it('reports depth below the baseline for fractions', async () => {
    const r = await renderSvg(String.raw`\frac{a}{b}`, false, 'termes');
    expect(r.depth).toBeGreaterThan(0.2);
  });

  it('produces well-formed XML even when the TeX contains "<" or "&"', async () => {
    const r = await renderSvg(String.raw`60<x<70 \text{ \& } a>b`, true, 'termes');
    expect(r.svg).not.toContain('data-');
    expect(new DOMParser().parseFromString(r.svg, 'image/svg+xml').getElementsByTagName('parsererror').length).toBe(0);
  });

  it('rejects invalid TeX', async () => {
    await expect(renderSvg(String.raw`\frac{a`, false, 'termes')).rejects.toThrow();
  });
});
