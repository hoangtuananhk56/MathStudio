import { describe, expect, it } from 'vitest';
import { buildEquationPackage, latexToOmml } from '../src/core/equation';
import { decodeTag, encodeTag, extractFirstOMath } from '../src/core/ooxml';
import { ommlToLatex } from '../src/core/omml-to-latex';
import { parseXml } from '../src/core/xml';
import { GREEK_KEYS, SMALL_BAR, SYMBOL_KEYS, SYMBOL_PALETTES, TABS, TEMPLATE_KEYS, TEMPLATE_PALETTES } from '../src/editor/mathtype/data';

const NS = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const fill = (l: string) => l.replace(/#0|#@/g, ' x ').replace(/#\?/g, ' a ');

function convertsCleanly(latex: string) {
  const omml = latexToOmml(fill(latex), { layout: 'inline', fontId: 'stix' });
  parseXml(`<m:oMath ${NS}>${omml}</m:oMath>`);
  expect(omml).not.toMatch(/<m:t>\\[a-zA-Z]/); // no raw LaTeX commands leaking into the output
}

describe('MathType toolbar items convert to OMML', () => {
  const groups = [
    ...SYMBOL_PALETTES.map((p) => [`symbols/${p.id}`, p.items.map((i) => i.insert)] as const),
    ...TEMPLATE_PALETTES.map((p) => [`templates/${p.id}`, p.items.map((i) => i.insert)] as const),
    ...TABS.map((p) => [`tabs/${p.id}`, p.items.map((i) => i.insert)] as const),
    ['smallbar', SMALL_BAR.map((i) => i.insert)] as const,
    ['ctrl+g', Object.values(GREEK_KEYS)] as const,
    ['ctrl+k', Object.values(SYMBOL_KEYS)] as const,
    ['ctrl+t', Object.values(TEMPLATE_KEYS)] as const,
  ];
  for (const [name, list] of groups) {
    for (const latex of list) it(`${name}: ${latex}`, () => convertsCleanly(latex));
  }
});

describe('numbered equations', () => {
  it('stores layout and number in the tag', () => {
    const tag = encodeTag({ latex: 'x', layout: 'right', number: 12, textHash: '' });
    expect(decodeTag(tag)).toMatchObject({ layout: 'right', number: 12 });
    expect(decodeTag(encodeTag({ latex: 'x', layout: 'left', number: 3, textHash: '' }))).toMatchObject({ layout: 'left', number: 3 });
    // Tags written before layouts existed ('0' / '1') still decode.
    expect(decodeTag('mt2|1|0||x')).toMatchObject({ layout: 'inline' });
    expect(decodeTag('mt2|1|1||x')).toMatchObject({ layout: 'display' });
  });

  it('right-numbered uses Word native "# (n)" and reads back without the number', () => {
    const pkg = buildEquationPackage('E=mc^{2}', { layout: 'right', fontId: 'stix', number: 7 });
    parseXml(pkg);
    expect(pkg).toContain('<m:t>#</m:t>');
    expect(pkg).toContain('<m:t>7</m:t>');
    expect(ommlToLatex(extractFirstOMath(pkg)!)).toBe('E=mc^{2}');
  });

  it('left-numbered puts "(n)" before a centre tab', () => {
    const pkg = buildEquationPackage('a+b', { layout: 'left', fontId: 'stix', number: 2 });
    parseXml(pkg);
    expect(pkg).toMatch(/<w:t>\(2\)<\/w:t>.*<w:ptab[^>]*w:alignment="center"/);
  });
});
