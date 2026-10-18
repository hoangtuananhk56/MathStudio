// @vitest-environment node
/**
 * End-to-end formula recognition on rendered and "photographed" formulas, with the model
 * shipped in vendor/models/mfr and onnxruntime-web (the runtime the add-in uses).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import * as ort from 'onnxruntime-web';
import { FormulaModel } from '../src/ocr/formula-model';
import { formulaInput, toGray, type Gray } from '../src/ocr/image';
import { latexKey } from '../src/ocr/latex-clean';

const samples = JSON.parse(readFileSync('tests/ocr/mfr-outputs.json', 'utf8')) as { file: string; latex: string }[];

export async function loadGray(path: string): Promise<Gray> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return toGray({ width: info.width, height: info.height, data });
}

describe('formula model', () => {
  let model: FormulaModel;
  beforeAll(async () => {
    ort.env.wasm.numThreads = 1;
    model = await FormulaModel.create(ort, {
      encoder: readFileSync('vendor/models/mfr/encoder.int8.onnx'),
      decoder: readFileSync('vendor/models/mfr/decoder.int8.onnx'),
      vocab: JSON.parse(readFileSync('vendor/models/mfr/vocab.json', 'utf8')),
    });
  }, 60000);
  afterAll(() => model?.dispose());

  it('reads the sample formulas', async () => {
    const wrong: string[] = [];
    for (const s of samples) {
      const input = formulaInput(await loadGray(`tests/ocr/samples/${s.file}`))!;
      const r = await model.read(input);
      if (latexKey(r.latex) !== latexKey(s.latex)) wrong.push(`${s.file}: ${r.latex} (${r.confidence.toFixed(2)})`);
    }
    // allow one miss in 45 (int8 weights, resampling differs slightly from Pillow)
    expect(wrong.length, wrong.join('\n')).toBeLessThanOrEqual(1);
  }, 300000);

  it('reads a formula cut out of a larger, grey and shaded picture', async () => {
    const g = await loadGray('tests/ocr/samples/f10-photo.jpg');
    // simulate a photo: big paper margins, darker on one side
    const W = g.width + 400;
    const H = g.height + 300;
    const data = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = 200 - Math.round((x / W) * 50);
    for (let y = 0; y < g.height; y++)
      for (let x = 0; x < g.width; x++) data[(y + 150) * W + x + 200] = Math.min(data[(y + 150) * W + x + 200], Math.round(g.data[y * g.width + x] * 0.8));
    const r = await model.read(formulaInput({ width: W, height: H, data })!);
    expect(latexKey(r.latex)).toBe(latexKey(String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`));
    expect(r.confidence).toBeGreaterThan(0.8);
  }, 60000);

  it('a blank picture has no input', () => {
    expect(formulaInput({ width: 50, height: 20, data: new Uint8Array(1000).fill(250) })).toBeNull();
  });
});
