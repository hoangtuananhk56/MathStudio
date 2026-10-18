/** Exercise text with equations; dumps a .docx when EXERCISE_DOCX / EXERCISE_OUT are set. */
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { docxText, latexToPlain } from '../src/geometry/exerciseText';

describe('equations as plain text', () => {
  it('reads school notation', () => {
    expect(latexToPlain('\\Delta ABC')).toBe('∆ABC');
    expect(latexToPlain('\\widehat{xOy}=60^{\\circ}')).toBe('góc xOy = 60°');
    expect(latexToPlain('AH\\bot BC')).toBe('AH ⊥ BC');
    expect(latexToPlain('AB=3\\,\\text{cm}')).toBe('AB = 3 cm');
    expect(latexToPlain('M\\in AB')).toBe('M ∈ AB');
    expect(latexToPlain('AM=\\frac{1}{3}AB')).toBe('AM = 1/3AB');
  });
});

describe('the selected exercise in Word', () => {
  it('reads text and Word equations from the selection package, then draws it', async () => {
    const { flatOpcText } = await import('../src/geometry/exerciseText');
    const { figureFromText } = await import('../src/geometry/fromText');
    const para = (inner: string) => `<w:p><w:r><w:t xml:space="preserve">${inner}</w:t></w:r></w:p>`;
    const pkg =
      '<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage"><pkg:part pkg:name="/word/document.xml"><pkg:xmlData><w:document><w:body>' +
      '<w:p><w:r><w:t xml:space="preserve">Cho </w:t></w:r><m:oMath><m:r><m:t>ΔABC</m:t></m:r></m:oMath><w:r><w:t xml:space="preserve"> vuông tại A có </w:t></w:r>' +
      '<m:oMath><m:r><m:t>AB=3 cm</m:t></m:r></m:oMath><w:r><w:t>, </w:t></w:r><m:oMath><m:r><m:t>AC=4 cm</m:t></m:r></m:oMath><w:r><w:t>.</w:t></w:r></w:p>' +
      para('Kẻ đường cao AH.') +
      '</w:body></w:document></pkg:xmlData></pkg:part></pkg:package>';
    const text = flatOpcText(pkg).join('\n');
    expect(text).toContain('ABC');
    expect(text).toContain('AB = 3 cm');
    const r = figureFromText(text);
    expect(r.sentences.filter((s) => s.status === 'ok')).toHaveLength(2);
  });
});

const file = process.env.EXERCISE_DOCX;
it.skipIf(!file)('dumps the text of a .docx', () => {
  const text = docxText(new Uint8Array(readFileSync(file!)));
  writeFileSync(process.env.EXERCISE_OUT ?? 'exercise.txt', text.join('\n'), 'utf8');
  expect(text.length).toBeGreaterThan(0);
});
