/**
 * Converts every MathType object of a real .docx (unzipped) to LaTeX and checks
 * that the result compiles. Runs only when MTEF_SAMPLE points at word/embeddings.
 * Writes <dir>/../../mtef-report.json for review.
 */
import { it, expect } from 'vitest';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import CFB from 'cfb';
import { mtefFromEquationNative, mtefToLatex } from '../src/core/mtef';
import { latexToMathml } from '../src/core/latex';

const dir = process.env.MTEF_SAMPLE;

it.skipIf(!dir)('converts all MathType objects of the sample document', () => {
  const files = readdirSync(dir!).filter((f) => f.endsWith('.bin')).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')));
  const report: { file: string; latex?: string; error?: string }[] = [];
  for (const f of files) {
    const cfb = CFB.read(readFileSync(join(dir!, f)), { type: 'buffer' });
    const eq = CFB.find(cfb, 'Equation Native');
    if (!eq) continue; // not a MathType object (e.g. Paintbrush)
    try {
      const latex = mtefToLatex(mtefFromEquationNative(new Uint8Array(eq.content as ArrayLike<number> as Uint8Array)));
      latexToMathml(latex);
      report.push({ file: f, latex });
    } catch (e) {
      report.push({ file: f, error: e instanceof Error ? e.message : String(e) });
    }
  }
  writeFileSync(join(dir!, '..', '..', '..', 'mtef-report.json'), JSON.stringify(report, null, 1));
  const failed = report.filter((r) => r.error);
  console.log(`MathType objects: ${report.length}, failed: ${failed.length}`);
  for (const r of failed.slice(0, 20)) console.log(r.file, r.error);
  expect(failed.length).toBe(0);
});
