// @vitest-environment node
/**
 * Figures read back from pictures: the editor's own templates are drawn (as they are
 * inserted into Word), the picture is read, and the names and sides found are compared
 * with the template's. Engines as in the add-in: Tesseract and the formula model.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-web';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { computeAll, type Vec } from '../src/geometry/engine';
import type { Construction } from '../src/geometry/model';
import { renderConstruction } from '../src/geometry/render';
import { TEMPLATES } from '../src/geometry/templates';
import { looksLikeDrawing } from '../src/ocr/figure-vision';
import { readFigure, type FigureEngines } from '../src/ocr/figure';
import { FormulaModel } from '../src/ocr/formula-model';
import { formulaInput, type Gray } from '../src/ocr/image';

const IDS = ['quad', 'rect34', 'square3', 'midpoint', 'parallelogram', 'rhombus', 'hexagon', 'congruent', 'medians', 'midline', 'thales', 'circumscribed'];

/** Named points and, for each straight side, the names on it. */
function shape(c: Construction): { names: Map<string, Vec>; sides: Set<string> } {
  const v = computeAll(c);
  const names = new Map<string, Vec>();
  for (const o of c.objects) {
    const x = v.get(o.id);
    if (x?.k === 'point' && o.style.label && !o.style.hidden && /^[A-Z]/.test(o.style.label)) names.set(o.style.label.replace(/_/g, ''), x.p);
  }
  const sides = new Set<string>();
  const add = (a: Vec, b: Vec) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const on = [...names].filter(([, p]) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L < L * 0.02 && (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y) > -0.01 * L * L && (p.x - b.x) * (a.x - b.x) + (p.y - b.y) * (a.y - b.y) > -0.01 * L * L);
    const ns = on.map(([n]) => n).sort();
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) sides.add(ns[i] + ns[j]);
  };
  for (const o of c.objects) {
    const x = v.get(o.id);
    if (o.style.hidden) continue;
    if (x?.k === 'straight' && x.kind === 'segment') add(x.a, x.b);
    if (x?.k === 'polygon') x.pts.forEach((p, i) => add(p, x.pts[(i + 1) % x.pts.length]));
  }
  return { names, sides };
}

describe('figures read from pictures', () => {
  let tess: Worker;
  let model: FormulaModel;
  let engines: FigureEngines;
  beforeAll(async () => {
    ort.env.wasm.numThreads = 1;
    model = await FormulaModel.create(ort, {
      encoder: readFileSync('vendor/models/mfr/encoder.int8.onnx'),
      decoder: readFileSync('vendor/models/mfr/decoder.int8.onnx'),
      vocab: JSON.parse(readFileSync('vendor/models/mfr/vocab.json', 'utf8')),
    });
    tess = await createWorker('vie', OEM.LSTM_ONLY, { langPath: resolve('node_modules/@tesseract.js-data/vie/4.0.0_best_int'), cacheMethod: 'none', gzip: true });
    const png = (g: Gray) => sharp(Buffer.from(g.data), { raw: { width: g.width, height: g.height, channels: 1 } }).png().toBuffer();
    engines = {
      readText: async (g, letter) => {
        await tess.setParameters(letter ? { tessedit_pageseg_mode: PSM.SINGLE_CHAR, tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' } : { tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: '' });
        const r = await tess.recognize(await png(g));
        return { text: r.data.text, confidence: r.data.confidence };
      },
      readName: async (g, margin) => {
        const input = formulaInput(g, undefined, margin);
        if (!input) return { latex: '', confidence: 0 };
        const r = await model.read(input, 10);
        return { latex: r.latex, confidence: r.confidence };
      },
    };
  }, 120000);
  afterAll(async () => {
    await tess?.terminate();
    await model?.dispose();
  });

  it('rebuilds the textbook figures: names and sides', async () => {
    let names = 0;
    let namesFound = 0;
    let sides = 0;
    let sidesFound = 0;
    const report: string[] = [];
    for (const id of IDS) {
      const want = TEMPLATES.find((t) => t.id === id)!.build();
      const svg = renderConstruction(want, computeAll(want), { mode: 'export', view: want.view, scale: 1 }).svg;
      const { data, info } = await sharp(Buffer.from(svg), { density: 144 }).flatten({ background: '#fff' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const got = (await readFigure({ width: info.width, height: info.height, data: new Uint8ClampedArray(data) }, engines)).construction;
      const a = shape(want);
      const b = shape(got);
      const nf = [...a.names.keys()].filter((n) => b.names.has(n));
      const sf = [...a.sides].filter((s) => b.sides.has(s));
      names += a.names.size;
      namesFound += nf.length;
      sides += a.sides.size;
      sidesFound += sf.length;
      report.push(`${id}: names ${nf.length}/${a.names.size} [${[...b.names.keys()].join(' ')}], sides ${sf.length}/${a.sides.size}`);
    }
    console.log(report.join('\n'));
    console.log(`names ${namesFound}/${names}, sides ${sidesFound}/${sides}`);
    expect(namesFound / names).toBeGreaterThan(0.85);
    expect(sidesFound / sides).toBeGreaterThan(0.8);
  }, 600000);

  it('tells photographs from drawings', async () => {
    // a "photograph": smooth colour noise everywhere
    const w = 200;
    const h = 150;
    const photo = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      photo[i * 4] = (i * 37) % 256;
      photo[i * 4 + 1] = (i * 91 + 50) % 256;
      photo[i * 4 + 2] = (i * 13 + 120) % 256;
      photo[i * 4 + 3] = 255;
    }
    expect(looksLikeDrawing({ width: w, height: h, data: photo })).toBe(false);
    const want = TEMPLATES.find((t) => t.id === 'rect34')!.build();
    const svg = renderConstruction(want, computeAll(want), { mode: 'export', view: want.view, scale: 1 }).svg;
    const { data, info } = await sharp(Buffer.from(svg)).flatten({ background: '#fff' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(looksLikeDrawing({ width: info.width, height: info.height, data })).toBe(true);
    await expect(readFigure({ width: w, height: h, data: photo }, engines)).rejects.toThrow('not a figure');
  });
});
