import { describe, expect, it } from 'vitest';
import { buildEquationPackage, latexToOmml } from '../src/core/equation';
import { decodeTag, encodeTag, extractFirstOMath, layoutMath } from '../src/core/ooxml';
import { ommlToLatex } from '../src/core/omml-to-latex';
import { parseXml } from '../src/core/xml';
import { SAMPLES } from './samples';

const OPTS = { layout: 'inline' as const, fontId: 'stix' };
const NS = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

describe('LaTeX -> OMML', () => {
  for (const s of SAMPLES) {
    it(s.name, () => {
      const omml = latexToOmml(s.latex, OPTS);
      // Must be well-formed XML.
      parseXml(`<m:oMath ${NS}>${omml}</m:oMath>`);
      for (const e of s.expect) expect(omml).toContain(e);
      expect(omml).toContain('STIX Two Math');
    });
  }

  it('does not leak placeholder commands', () => {
    expect(latexToOmml(String.raw`\frac{\placeholder{}}{2}`, OPTS)).not.toContain('placeholder');
  });
});

describe('OMML -> LaTeX round trip', () => {
  for (const s of SAMPLES) {
    it(s.name, () => {
      const omml1 = latexToOmml(s.latex, OPTS);
      const latex2 = ommlToLatex(layoutMath(omml1, 'inline', 1, { wRPr: '' }));
      const omml2 = latexToOmml(latex2, OPTS);
      expect(omml2).toBe(omml1);
    });
  }
});

describe('MathType look (Times New Roman letters) round trip', () => {
  const MT = { layout: 'inline' as const, fontId: 'mathtype' };
  for (const s of SAMPLES) {
    it(s.name, () => {
      const omml1 = latexToOmml(s.latex, MT);
      const omml2 = latexToOmml(ommlToLatex(layoutMath(omml1, 'inline', 1, { wRPr: '' })), MT);
      expect(omml2).toBe(omml1);
    });
  }

  it('sets variables italic and digits upright in Times New Roman', () => {
    const omml = latexToOmml('x+2', MT);
    expect(omml).toMatch(/<m:nor\/><\/m:rPr><w:rPr><w:rFonts w:ascii="Times New Roman"[^>]*\/><w:i\/><\/w:rPr><m:t>x<\/m:t>/);
    expect(omml).toMatch(/<w:rFonts w:ascii="Times New Roman"[^>]*\/><\/w:rPr><m:t>2<\/m:t>/);
    expect(omml).toMatch(/STIX Two Math[^]*<m:t>\+<\/m:t>/);
  });
});

describe('package & tag', () => {
  it('encodes and decodes the source', () => {
    const latex = String.raw`\frac{a|b}{c}+\text{nếu}`;
    const tag = encodeTag({ latex, layout: 'display', textHash: 'abc' });
    expect(decodeTag(tag)).toEqual({ latex, layout: 'display', textHash: 'abc' });
    expect(decodeTag('something else')).toBeNull();
  });

  it('builds a well-formed package with one equation', () => {
    const pkg = buildEquationPackage(String.raw`\sqrt{2}`, { ...OPTS, layout: 'display' as const });
    parseXml(pkg);
    expect(pkg).toMatch(/<m:oMathPara[ >]/);
    expect(pkg).toContain('<w:tag w:val="mt2|1|1||');
    expect(extractFirstOMath(pkg)).toMatch(/^<m:oMath>.*<\/m:oMath>$/);
  });
});
