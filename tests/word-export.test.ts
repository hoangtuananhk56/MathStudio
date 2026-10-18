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
import { buildPicturePackage, captionParagraph, figureRun } from '../src/core/image-ooxml';
import { wrapInContentControl } from '../src/core/ooxml';
import { computeAll } from '../src/geometry/engine';
import { emptyConstruction, type Construction, type Def } from '../src/geometry/model';
import { PX_PER_CM, renderConstruction } from '../src/geometry/render';
import { createFromTool } from '../src/geometry/tools';
import { SAMPLES } from './samples';

/** Prefixes every id a definition refers to (to merge separately built figures). */
function rename(def: Def, prefix: string): Def {
  const d = JSON.parse(JSON.stringify(def)) as Record<string, unknown>;
  for (const k of ['a', 'b', 'c', 'on', 'poly', 'center', 'point', 'line', 'through', 'circle', 'l1', 'l2', 'of', 'at', 'solid']) {
    if (typeof d[k] === 'string') d[k] = prefix + (d[k] as string);
  }
  if (Array.isArray(d.pts)) d.pts = (d.pts as string[]).map((x) => prefix + x);
  const tr = d.tr as Record<string, unknown> | undefined;
  if (tr) for (const k of ['line', 'center', 'vector']) if (typeof tr[k] === 'string') tr[k] = prefix + (tr[k] as string);
  return d as unknown as Def;
}

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
  if (only === 'geometry') {
    const raster = async (svg: string, w: number, h: number) =>
      (await sharp(Buffer.from(svg), { density: 300 }).resize(w, h, { fit: 'fill' }).png().toBuffer()).toString('base64');
    const figure = async (label: string, c: Construction, caption?: number) => {
      const fig = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 });
      const px = (cm: number) => Math.max(1, Math.round(cm * PX_PER_CM * 3));
      const png = await raster(fig.svg, px(fig.width), px(fig.height));
      const run = wrapInContentControl(figureRun(fig.width, fig.height, label), 'mt2g|1|');
      items.push({ label, xml: buildPicturePackage(run, caption ? 'display' : 'inline', { svg: fig.svg, pngBase64: png }, caption ? `${captionParagraph(caption)}<w:p/>` : '') });
    };
    for (const preset of ['vn', 'intl'] as const) {
      // Triangle ABC with altitude AH (right angle mark), median AM, circumcircle, equal ticks on BM and MC.
      let c = emptyConstruction();
      c.preset = preset;
      const add = (id: string, def: Def, style = {}) => (c = { ...c, objects: [...c.objects, { id, def, style }] });
      add('A', { t: 'point', x: 1, y: 3.2 }, { label: 'A' });
      add('B', { t: 'point', x: -2, y: 0 }, { label: 'B' });
      add('C', { t: 'point', x: 4, y: 0 }, { label: 'C' });
      add('tri', { t: 'polygon', pts: ['A', 'B', 'C'] });
      add('bc', { t: 'line', a: 'B', b: 'C' }, { hidden: true });
      add('h', { t: 'perpendicular', line: 'bc', through: 'A' }, { hidden: true });
      add('H', { t: 'intersection', a: 'h', b: 'bc', index: 0 }, { label: 'H' });
      add('AH', { t: 'segment', a: 'A', b: 'H' }, { dash: 'dashed' });
      add('M', { t: 'midpoint', a: 'B', b: 'C' }, { label: 'M' });
      add('AM', { t: 'segment', a: 'A', b: 'M' });
      add('BM', { t: 'segment', a: 'B', b: 'M' }, { ticks: 1 });
      add('MC', { t: 'segment', a: 'M', b: 'C' }, { ticks: 1 });
      add('ang', { t: 'angle', a: 'A', b: 'H', c: 'C' });
      add('O', { t: 'circle3', a: 'A', b: 'B', c: 'C' });
      add('angB', { t: 'angle', a: 'C', b: 'B', c: 'A' }, { showValue: true });
      await figure(`figure ${preset}`, c);
    }
    // Square + reflection + function graph
    let c2 = emptyConstruction();
    c2 = { ...c2, objects: [
      { id: 'P', def: { t: 'point', x: 0, y: 0 }, style: { label: 'A' } },
      { id: 'Q', def: { t: 'point', x: 2, y: 0 }, style: { label: 'B' } },
    ] };
    c2 = { ...c2, objects: [...c2.objects, ...createFromTool(c2, 'square', ['P', 'Q']).objects] };
    await figure('figure square', c2);
    const c3: Construction = { ...emptyConstruction(), axes: true, grid: true, view: { xmin: -3, xmax: 4, ymin: -3, ymax: 4 },
      objects: [{ id: 'f', def: { t: 'function', expr: 'x^2-2x-1', from: -1.4, to: 3.4 }, style: {} }, { id: 'O', def: { t: 'point', x: 0, y: 0 }, style: { hidden: true } }] };
    await figure('figure graph', c3);
    // Round 1+2 tools: triangle with altitude, bisector, incircle and angle sizes; rectangle beside it.
    let c4: Construction = { ...emptyConstruction(), view: { xmin: -1, xmax: 12, ymin: -1, ymax: 5 }, objects: [
      { id: 'A', def: { t: 'point', x: 1.5, y: 4 }, style: { label: 'A' } },
      { id: 'B', def: { t: 'point', x: 0, y: 0 }, style: { label: 'B' } },
      { id: 'C', def: { t: 'point', x: 5, y: 0 }, style: { label: 'C' } },
      { id: 'R1', def: { t: 'point', x: 7, y: 0.5 }, style: { label: 'M' } },
      { id: 'R2', def: { t: 'point', x: 11, y: 0.5 }, style: { label: 'N' } },
    ] };
    const use = (tool: Parameters<typeof createFromTool>[1], picks: string[], answer?: string) => {
      c4 = { ...c4, objects: [...c4.objects, ...createFromTool(c4, tool, picks, answer, { values: computeAll(c4) }).objects] };
    };
    use('triangle', ['A', 'B', 'C']);
    use('altitude', ['A', 'B', 'C']);
    use('bisectorIn', ['B', 'C', 'A']);
    use('incircle', ['A', 'B', 'C']);
    use('angle', ['C', 'A', 'B']);
    c4 = { ...c4, objects: c4.objects.map((o, i) => (i === c4.objects.length - 1 ? { ...o, style: { ...o.style, showValue: true } } : o)) };
    use('rectangle', ['R1', 'R2']);
    await figure('figure round2', c4);
    // Textbook conventions: angle xOy = 60° with bisector Ot; line d ⟂ AB at its foot; triangle with a given 60° angle.
    let c5: Construction = { ...emptyConstruction(), objects: [
      { id: 'X', def: { t: 'point', x: 3.5, y: 0 }, style: {} },
      { id: 'O', def: { t: 'point', x: 0, y: 0 }, style: {} },
      { id: 'A', def: { t: 'point', x: 5, y: 0.5 }, style: { label: 'A' } },
      { id: 'B', def: { t: 'point', x: 9, y: 1.2 }, style: { label: 'B' } },
      { id: 'M', def: { t: 'point', x: 6.6, y: 3.2 }, style: { label: 'M' } },
    ] };
    const use5 = (tool: Parameters<typeof createFromTool>[1], picks: string[], answer?: string, fresh?: string[]) => {
      const r = createFromTool(c5, tool, picks, answer, { values: computeAll(c5), fresh });
      let objs = [...c5.objects, ...r.objects];
      if (r.restyle) objs = objs.map((o) => ({ ...o, style: { ...o.style, ...(r.restyle!.find((x) => x.id === o.id)?.style ?? {}) } }));
      c5 = { ...c5, objects: objs };
      return r.objects;
    };
    const fixedAngle = use5('angleFixed', ['X', 'O'], '60', ['X', 'O']);
    const tipY = fixedAngle.find((o) => o.style.dot === false)!.id;
    use5('angleBisector', ['X', 'O', tipY]);
    use5('line', ['A', 'B']);
    const ab = c5.objects[c5.objects.length - 1].id;
    use5('perpendicular', [ab, 'M']);
    await figure('figure textbook', c5);
    // Presentation: subscripts, point styles, a dragged label, the area of a polygon.
    const c6: Construction = { ...emptyConstruction(), objects: [
      { id: 'A1', def: { t: 'point', x: 0, y: 0 }, style: { label: 'A_1' } },
      { id: 'B1', def: { t: 'point', x: 4, y: 0 }, style: { label: 'B_1', shape: 'hollow' } },
      { id: 'C1', def: { t: 'point', x: 4, y: 3 }, style: { label: "C'", shape: 'cross' } },
      { id: 'D1', def: { t: 'point', x: 0, y: 3 }, style: { label: 'x^2', labelDx: -30, labelDy: -6 } },
      { id: 'q', def: { t: 'polygon', pts: ['A1', 'B1', 'C1', 'D1'] }, style: { showValue: true } },
      { id: 'H', def: { t: 'point', x: 2, y: 0 }, style: { label: 'H' } },
      { id: 'M', def: { t: 'point', x: 2.05, y: 0 }, style: { label: 'M' } },
    ] };
    await figure('figure labels', c6);
    // Round B: fractions, crossing lines, parallels with a transversal, inscribed angle, diagonals
    let c7: Construction = { ...emptyConstruction(), objects: [
      { id: 'R1', def: { t: 'point', x: 0, y: 0 }, style: { label: 'A' } },
      { id: 'R2', def: { t: 'point', x: 4, y: 0 }, style: { label: 'B' } },
      { id: 'R3', def: { t: 'point', x: 4, y: 2 }, style: { label: 'C' } },
      { id: 'R4', def: { t: 'point', x: 0, y: 2 }, style: { label: 'D' } },
      { id: 'q', def: { t: 'polygon', pts: ['R1', 'R2', 'R3', 'R4'] }, style: {} },
      { id: 'K', def: { t: 'point', x: 8, y: 1 }, style: {} },
      { id: 'K2', def: { t: 'point', x: 9.6, y: 1 }, style: {} },
      { id: 'kc', def: { t: 'circle', center: 'K', through: 'K2' }, style: {} },
    ] };
    const use7 = (tool: Parameters<typeof createFromTool>[1], picks: string[], answer?: string, fresh?: string[]) => {
      const r = createFromTool(c7, tool, picks, answer, { values: computeAll(c7), fresh });
      let objs = [...c7.objects, ...r.objects];
      if (r.restyle) objs = objs.map((o) => ({ ...o, style: { ...o.style, ...(r.restyle!.find((x) => x.id === o.id)?.style ?? {}) } }));
      c7 = { ...c7, objects: objs };
      return r.objects;
    };
    use7('fraction', ['q'], '4; 3; 2');
    c7.objects[c7.objects.length - 1].style.showValue = true;
    use7('fraction', ['kc'], '6; 2');
    await figure('figure fractions', c7, 1);
    let c8: Construction = { ...emptyConstruction(), objects: [
      { id: 'O', def: { t: 'point', x: 0, y: 0 }, style: {} },
      { id: 'M', def: { t: 'point', x: 9, y: 0 }, style: {} },
    ] };
    const use8 = (tool: Parameters<typeof createFromTool>[1], picks: string[], fresh?: string[]) => {
      const r = createFromTool(c8, tool, picks, undefined, { values: computeAll(c8), fresh });
      let objs = [...c8.objects, ...r.objects];
      if (r.restyle) objs = objs.map((o) => ({ ...o, style: { ...o.style, ...(r.restyle!.find((x) => x.id === o.id)?.style ?? {}) } }));
      c8 = { ...c8, objects: objs };
    };
    use8('crossLines', ['O'], ['O']);
    use8('parallelTransversal', ['M'], ['M']);
    await figure('figure angles', c8, 2);
    // Inscribed angle and diagonals of a rhombus, with the diagonals marked as the answer (question version)
    let c9: Construction = { ...emptyConstruction(), objects: [
      { id: 'O', def: { t: 'point', x: 0, y: 0 }, style: { label: 'O' } },
      { id: 'R', def: { t: 'point', x: 2.5, y: 0 }, style: {} },
      { id: 'cc', def: { t: 'circle', center: 'O', through: 'R' }, style: {} },
      { id: 'A', def: { t: 'point', x: 5, y: 0 }, style: { label: 'A' } },
      { id: 'B', def: { t: 'point', x: 8, y: -1.5 }, style: { label: 'B' } },
      { id: 'C', def: { t: 'point', x: 11, y: 0 }, style: { label: 'C' } },
      { id: 'D', def: { t: 'point', x: 8, y: 1.5 }, style: { label: 'D' } },
      { id: 'rh', def: { t: 'polygon', pts: ['A', 'B', 'C', 'D'] }, style: {} },
    ] };
    for (const [tool, picks] of [['inscribedAngle', ['cc']], ['diagonals', ['rh']]] as const) {
      const r = createFromTool(c9, tool, [...picks], undefined, { values: computeAll(c9) });
      const answer = tool === 'diagonals';
      c9 = { ...c9, objects: [...c9.objects, ...r.objects.map((o) => (answer ? { ...o, style: { ...o.style, answer: true } } : o))] };
    }
    await figure('figure circle + rhombus (answer)', c9);
    await figure('figure circle + rhombus (question)', { ...c9, answers: 'hide' });
    // Round C: solids, number line, compass arcs
    const build = (base: Construction, steps: [Parameters<typeof createFromTool>[1], string[], string?, string[]?][], compass = false) => {
      let cc: Construction = { ...base, compass };
      for (const [tool, picks, answer, fresh] of steps) {
        const r = createFromTool(cc, tool, picks, answer, { values: computeAll(cc), fresh, compass });
        let objs = [...cc.objects, ...r.objects];
        if (r.restyle) objs = objs.map((o) => ({ ...o, style: { ...o.style, ...(r.restyle!.find((x) => x.id === o.id)?.style ?? {}) } }));
        cc = { ...cc, objects: objs };
      }
      return cc;
    };
    const pts = (list: [string, number, number][]): Construction => ({
      ...emptyConstruction(),
      objects: list.map(([id, x, y]) => ({ id, def: { t: 'point', x, y } as Def, style: {} })),
    });
    await figure('figure solids 1', build(pts([['a', 0, 0], ['b', 7, 0], ['c', 13, 0]]), [
      ['cuboid', ['a'], '4; 3; 2,5', ['a']],
      ['cube', ['b'], '3', ['b']],
      ['pyramid4', ['c'], '4; 3; 4', ['c']],
    ]));
    await figure('figure solids 2', build(pts([['a', 0, 0], ['b', 6.5, 0], ['c', 11, 0], ['d', 15, 1.5], ['e', 20, 1.6]]), [
      ['prism3', ['a'], '4; 3; 3,5', ['a']],
      ['pyramid3', ['b'], '4; 3; 4', ['b']],
      ['cylinder', ['c'], '1,5; 3,5', ['c']],
      ['cone', ['d'], '1,5; 3,5', ['d']],
      ['sphere', ['e'], '1,6', ['e']],
    ]));
    await figure('figure number line', build(pts([['a', 0, 0]]), [['numberLine', ['a'], '-3; 5; 1; -2 0 3', ['a']]]));
    const tri = build(pts([['A', 0, 0]]), [['triangleSSS', ['A'], '5; 4; 3']], true);
    tri.objects[0].style = { label: 'A' };
    const seg = build(pts([['P', 8, 0], ['Q', 12, 0]]), [['segment', ['P', 'Q']], ['perpBisector', ['P', 'Q']]], true);
    seg.objects[0].style = { label: 'A' };
    seg.objects[1].style = { label: 'B' };
    const ang = build(pts([['X', 20, 0], ['O', 15, 0], ['Y', 18, 3.5]]), [['ray', ['O', 'X']], ['ray', ['O', 'Y']], ['angleBisector', ['X', 'O', 'Y']]], true);
    ang.objects[1].style = { label: 'O' };
    await figure('figure compass', { ...emptyConstruction(), compass: true, objects: [...tri.objects, ...seg.objects.map((o) => ({ ...o, id: 's_' + o.id, def: rename(o.def, 's_') })), ...ang.objects.map((o) => ({ ...o, id: 'g_' + o.id, def: rename(o.def, 'g_') }))] });
  }
  writeFileSync(join(out!, 'packages.json'), JSON.stringify(items));
});
