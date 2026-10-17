/**
 * Writes Word-ready packages for every sample so `scripts/word-render.ps1` can
 * insert them into a real Word document and export a PDF for visual checks.
 * Runs only when WORD_EXPORT is set to an output directory.
 */
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { buildEquationPackage, buildEquationPackageAsync, MATH_FONTS } from '../src/core/equation';
import type { Layout } from '../src/core/ooxml';
import { TABS, TEMPLATE_PALETTES } from '../src/editor/mathtype/data';
import { SAMPLES } from './samples';

const out = process.env.WORD_EXPORT;
const fill = (l: string) => l.replace(/#0|#@/g, ' x ').replace(/#\?/g, ' a ');

it.skipIf(!out)('exports packages for Word rendering', async () => {
  mkdirSync(out!, { recursive: true });
  const items: { label: string; xml: string }[] = [];
  const add = (label: string, latex: string, layout: Layout, fontId = 'stix', number?: number) =>
    items.push({ label, xml: buildEquationPackage(latex, { layout, fontId, sizePt: 12, number }) });

  const only = process.env.WORD_EXPORT_SET ?? 'samples';
  if (only === 'samples') {
    for (const font of MATH_FONTS) for (const s of SAMPLES) add(`${font.label} | ${s.name}`, s.latex, 'inline', font.id);
  }
  if (only === 'mathtype') {
    for (const p of [...TEMPLATE_PALETTES, ...TABS]) for (const it2 of p.items) add(`${p.id} | ${it2.insert}`, fill(it2.insert), 'inline');
  }
  if (only === 'compare') {
    for (const s of SAMPLES) {
      add(`STIX | ${s.name}`, s.latex, 'inline', 'stix');
      add(`MathType look | ${s.name}`, s.latex, 'inline', 'mathtype');
    }
  }
  if (only === 'layouts') {
    const q = String.raw`x=\frac{-b\pm\sqrt{b^{2}-4ac}}{2a}`;
    add('display', q, 'display');
    add('right-numbered (1)', q, 'right', 'stix', 1);
    add('right-numbered (2)', String.raw`\int_{0}^{1}x^{2}\,\mathrm{d}x=\frac{1}{3}`, 'right', 'stix', 2);
    add('left-numbered (3)', String.raw`\sin^{2}x+\cos^{2}x=1`, 'left', 'stix', 3);
  }
  if (only === 'images') {
    const env = {
      fontPt: 12,
      rasterize: async (svg: string, w: number, h: number) =>
        (await sharp(Buffer.from(svg), { density: 300 }).resize(w, h, { fit: 'fill' }).png().toBuffer()).toString('base64'),
    };
    const pic = async (label: string, latex: string, layout: Layout, number?: number) =>
      items.push({ label, xml: await buildEquationPackageAsync(latex, { layout, fontId: 'times', kind: 'image', number }, env) });
    for (const s of SAMPLES) {
      await pic(`picture | ${s.name}`, s.latex, 'inline');
      items.push({ label: `omml | ${s.name}`, xml: buildEquationPackage(s.latex, { layout: 'inline', fontId: 'stix', sizePt: 12 }) });
    }
    await pic('picture display', String.raw`x=\frac{-b\pm\sqrt{b^{2}-4ac}}{2a}`, 'display');
    await pic('picture right (1)', String.raw`\int_{0}^{1}x^{2}\,\mathrm{d}x=\frac{1}{3}`, 'right', 1);
    await pic('picture left (2)', String.raw`\sin^{2}x+\cos^{2}x=1`, 'left', 2);
  }
  writeFileSync(join(out!, 'packages.json'), JSON.stringify(items));
});
