/**
 * Converts the MathType equations of a real .docx (MT_DOCX) and writes the results
 * next to it (…-omml.docx / …-image.docx) for checking in Word. Skipped without MT_DOCX.
 */
import { expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { convertMathTypeDocx, countMathTypeEquations } from '../src/core/docx-mathtype';
import type { RenderKind } from '../src/core/ooxml';

const src = process.env.MT_DOCX;
const rasterize = async (svg: string, w: number, h: number) =>
  (await sharp(Buffer.from(svg), { density: 300 }).resize(w, h, { fit: 'fill' }).png().toBuffer()).toString('base64');

for (const kind of ['omml', 'image'] as RenderKind[]) {
  it.skipIf(!src)(`converts every MathType equation (${kind})`, async () => {
    const input = new Uint8Array(readFileSync(src!));
    const total = countMathTypeEquations(input);
    const { docx, report } = await convertMathTypeDocx(input, { kind, fontId: 'times', rasterize });
    console.log(kind, JSON.stringify({ total, converted: report.converted, skipped: report.skipped, failed: report.failed.slice(0, 5) }));
    writeFileSync(src!.replace(/\.docx$/, `-${kind}.docx`), docx);
    expect(report.total).toBe(total);
    expect(report.failed).toEqual([]);
    expect(countMathTypeEquations(docx)).toBe(report.skipped);
    expect(report.converted + report.skipped).toBe(total);
  }, 120_000);
}
