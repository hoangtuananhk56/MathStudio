// @vitest-environment node
/**
 * Reading exercises (Vietnamese text + formulas) from pictures, with the engines the
 * add-in uses: Tesseract (vie, LSTM) for the text and the formula model.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-web';
import { createWorker, OEM, type Worker } from 'tesseract.js';
import { FormulaModel } from '../src/ocr/formula-model';
import { formulaInput, toGray, type Gray } from '../src/ocr/image';
import { latexKey } from '../src/ocr/latex-clean';
import { pageToPlain, pageToTex, readPage, texToPage, type PageEngines } from '../src/ocr/page';
import { linesFromTesseract } from '../src/ocr/tesseract-lines';

const pages = JSON.parse(readFileSync('tests/ocr/pages.json', 'utf8')) as { file: string; text: string }[];

async function load(path: string): Promise<Gray> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return toGray({ width: info.width, height: info.height, data });
}

const png = (g: Gray) => sharp(Buffer.from(g.data), { raw: { width: g.width, height: g.height, channels: 1 } }).png().toBuffer();

/** Words of a text, for a rough comparison of the prose. */
const words = (s: string) => s.replace(/\$[^$]*\$/g, ' ').toLowerCase().split(/[\s,.;:()]+/).filter(Boolean);
const formulas = (s: string) => [...s.matchAll(/\$([^$]+)\$/g)].map((m) => latexKey(m[1]));

describe('page OCR', () => {
  let model: FormulaModel;
  let tess: Worker;
  beforeAll(async () => {
    ort.env.wasm.numThreads = 1;
    model = await FormulaModel.create(ort, {
      encoder: readFileSync('vendor/models/mfr/encoder.int8.onnx'),
      decoder: readFileSync('vendor/models/mfr/decoder.int8.onnx'),
      vocab: JSON.parse(readFileSync('vendor/models/mfr/vocab.json', 'utf8')),
    });
    tess = await createWorker('vie', OEM.LSTM_ONLY, {
      langPath: resolve('node_modules/@tesseract.js-data/vie/4.0.0_best_int'),
      cacheMethod: 'none',
      gzip: true,
    });
  }, 120000);
  afterAll(async () => {
    await model?.dispose();
    await tess?.terminate();
  });

  it('parses edited $…$ text back', () => {
    const p = texToPage('Giải $x^2=1$ và\n$$\\frac{1}{2}$$');
    expect(p).toHaveLength(2);
    expect(p[0].segments.map((s) => s.kind)).toEqual(['text', 'math', 'text']);
    expect(p[1].segments[0]).toMatchObject({ kind: 'math', display: true });
    expect(pageToPlain(texToPage('Cho $\\widehat{ABC}=60^\\circ$ và $AH\\perp BC$.'))).toBe('Cho góc ABC = 60° và AH ⊥ BC.');
  });

  it('reads the sample exercises', async () => {
    let formulaHits = 0;
    let formulaTotal = 0;
    let wordHits = 0;
    let wordTotal = 0;
    const report: string[] = [];
    for (const p of pages) {
      const gray = await load(`tests/ocr/samples/${p.file}`);
      const engines: PageEngines = {
        readText: async (page) => linesFromTesseract((await tess.recognize(await png(page), {}, { blocks: true })).data.blocks),
        readFormula: async (page, region) => model.read(formulaInput(page, region)!),
      };
      const got = pageToTex(await readPage(gray, engines));
      const want = formulas(p.text);
      const have = formulas(got);
      formulaTotal += want.length;
      formulaHits += want.filter((f) => have.includes(f)).length;
      const ww = words(p.text);
      const gw = new Set(words(got));
      wordTotal += ww.length;
      wordHits += ww.filter((w) => gw.has(w)).length;
      report.push(`${p.file}\n  want: ${p.text}\n  got:  ${got}`);
    }
    console.log(report.join('\n'));
    console.log(`formulas ${formulaHits}/${formulaTotal}, words ${wordHits}/${wordTotal}`);
    expect(wordHits / wordTotal).toBeGreaterThan(0.97);
    expect(formulaHits / formulaTotal).toBeGreaterThan(0.9);
  }, 600000);
});

describe('page preparation', () => {
  it('finds and removes the tilt of a photographed page', async () => {
    const { estimateSkew, level, rotate } = await import('../src/ocr/image');
    const g = level(await load('tests/ocr/samples/p7-termes.png'));
    expect(estimateSkew(g)).toBe(0);
    for (const deg of [-3, 1.8, 4]) expect(Math.abs(estimateSkew(rotate(g, deg)) - deg)).toBeLessThan(0.15);
    expect(Math.abs(estimateSkew(level(await load('tests/ocr/samples/p7-photo.jpg'))) - 1.8)).toBeLessThan(0.2);
  });
});
