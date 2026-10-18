import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanOcrLatex, latexKey } from '../src/ocr/latex-clean';
import { decodeTokens } from '../src/ocr/tokenizer';
import { latexToMathml } from '../src/core/latex';

/** What the formula model read on the sample images (scripts/build-ocr-model.py model). */
const outputs = JSON.parse(readFileSync('tests/ocr/mfr-outputs.json', 'utf8')) as { file: string; latex: string; raw: string; ids: number[] }[];
const vocab = JSON.parse(readFileSync('vendor/models/mfr/vocab.json', 'utf8')) as string[];

describe('formula OCR: token decoding', () => {
  it('decodes token ids like the Hugging Face tokenizer', () => {
    for (const o of outputs) expect(decodeTokens(vocab, o.ids)).toBe(o.raw);
  });
});

describe('formula OCR: LaTeX clean-up', () => {
  it.each([
    ['x ^ { 2 } - 5 x + 6 = 0', 'x^2-5x+6=0'],
    ['\\operatorname { s i n } ^ { 2 } \\, \\alpha \\, + \\, \\operatorname { c o s } ^ { 2 } \\, \\alpha \\, = \\, 1', '\\sin^2\\alpha+\\cos^2\\alpha=1'],
    ['\\underset { x \\to 0 } { \\operatorname* { l i m } } \\; \\frac { \\operatorname { s i n } x } { x } \\, = \\, 1', '\\lim_{x\\to 0}\\frac{\\sin x}{x}=1'],
    ['\\left\\{ \\begin{matrix} { 2 x + y = 5 } \\\\ { x - y = 1 } \\\\ \\end{matrix} \\right.', '\\begin{cases}2x+y=5\\\\x-y=1\\end{cases}'],
    ['\\left\\{ \\begin{aligned} { } & { { } 2 x + y = 5 } \\\\ { } & { { } x - y = 1 } \\\\ \\end{aligned} \\right.', '\\begin{cases}2x+y=5\\\\x-y=1\\end{cases}'],
    ['\\left\\{ \\begin{array} { l l } { 2 x + y = 5 } & { } \\\\ { x - y = 1 } & { } \\\\ \\end{array} \\right.', '\\begin{cases}2x+y=5\\\\x-y=1\\end{cases}'],
    ['A = \\left( \\begin{matrix} { 1 } & { 2 } \\\\ { 3 } & { 4 } \\\\ \\end{matrix} \\right)', 'A=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}'],
    ['x = \\frac { \\begin{matrix} { - b \\pm \\sqrt { b ^ { 2 } - 4 a c } } \\\\ \\end{matrix} } { 2 a }', 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}'],
    ['\\int _ { 0 } ^ { 1 } x ^ { 2 } \\, d x = \\frac { 1 } { 3 }', '\\int_0^1x^2\\,dx=\\frac{1}{3}'],
    ['S = \\pi r ^ { 2 }', 'S=\\pi r^2'],
    ['\\widehat { A B C } = 9 0 ^ { \\circ }', '\\widehat{ABC}=90^\\circ'],
    ['\\sqrt [ 3 ] { x + 1 }', '\\sqrt[3]{x+1}'],
    ['\\operatorname { l o g } _ { 2 } ( x + 1 ) > 3', '\\log_2(x+1)>3'],
    ['{ ( x + 1 ) } ^ { 2 }', '{(x+1)}^2'],
    ['\\mathrm { c m }', '\\mathrm{cm}'],
    ['S = \\boldsymbol { \\pi } \\boldsymbol { r } ^ { 2 }', 'S=\\pi r^2'],
    ['\\begin{aligned} { x } & { { } > 0 , x \\neq 1 . } \\\\ \\end{aligned}', 'x>0,x\\neq 1.'],
    ['\\begin{matrix} { 1 } & { 2 } \\\\ \\end{matrix}', '\\begin{matrix}1&2\\end{matrix}'],
    ['\\mathrm { \\boldmath ~ x ~ } \\not = \\mathrm { \\boldmath ~ 1 ~ }', 'x\\neq 1'],
    ['\\mathbf { A B } = 4 , \\; y = m \\mathbf { x } + 2', 'AB=4,y=mx+2'],
    ['I = f _ { \\bf 0 } ^ { \\bf 1 } x ^ { \\bf 2 } d x', 'I=f_0^1x^2dx'],
    ['\\mathrm { D F } = 3 \\mathrm { c m }', 'DF=3\\mathrm{cm}'],
    ['\\bar { B } \\bar { A } \\bar { C } = 6 0 ^ { \\circ }', '\\widehat{BAC}=60^\\circ'],
    ['\\overline { B A C } = 6 0 ^ { * }', '\\widehat{BAC}=60^\\circ'],
    ['\\overline { A B } + \\overline { a b }', '\\overline{AB}+\\overline{ab}'],
  ])('%s', (raw, want) => {
    expect(cleanOcrLatex(raw)).toBe(want);
  });

  it('every sample is read correctly once tidied, and is valid LaTeX', () => {
    const wrong = outputs.filter((o) => latexKey(cleanOcrLatex(o.raw)) !== latexKey(o.latex)).map((o) => `${o.file}: ${cleanOcrLatex(o.raw)}`);
    expect(wrong).toEqual([]);
    for (const o of outputs) expect(() => latexToMathml(cleanOcrLatex(o.raw))).not.toThrow();
  });
});
