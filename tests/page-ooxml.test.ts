import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeTag } from '../src/core/ooxml';
import { buildPagePackage } from '../src/core/page-ooxml';
import { texToPage } from '../src/ocr/page';

const style = { fontId: 'times' };
const EXERCISE = String.raw`Bài 8. Giải hệ phương trình sau:
$$\begin{cases}2x+y=5\\x-y=1\end{cases}$$
Từ đó tính giá trị của biểu thức $T=x^2+y^2$ với $x>0$, $x\neq 1$.`;

describe('exercise → Word paragraphs', () => {
  it('writes text runs, inline equations and centred display equations, each a tagged MathStudio equation', () => {
    const pkg = buildPagePackage(texToPage(EXERCISE), style);
    const paragraphs = pkg.match(/<w:p>.*?<\/w:p>/g) ?? [];
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[1]).toContain('<w:jc w:val="center"/>');
    expect(paragraphs[1]).toContain('<m:oMathPara');
    expect(paragraphs[2]).toContain('Từ đó tính giá trị của biểu thức ');
    const tags = [...pkg.matchAll(/<w:tag w:val="([^"]*)"/g)].map((m) => decodeTag(m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')));
    expect(tags.map((t) => t?.latex)).toEqual([String.raw`\begin{cases}2x+y=5\\x-y=1\end{cases}`, 'T=x^2+y^2', 'x>0', 'x\\neq 1']);
    expect(tags.map((t) => t?.layout)).toEqual(['display', 'inline', 'inline', 'inline']);
  });

  it('keeps a formula it cannot convert as $…$ text', () => {
    const pkg = buildPagePackage(texToPage('Cho $\\frac{1}{2$ và $x=1$.'), style);
    expect(pkg).toContain('$\\frac{1}{2$');
    expect((pkg.match(/<w:sdt>/g) ?? []).length).toBe(1);
  });

  it('escapes text', () => {
    expect(buildPagePackage([{ segments: [{ kind: 'text', text: 'a < b & c' }] }], style)).toContain('a &lt; b &amp; c');
  });

  // For scripts/word-render.ps1: inserts the package into a real Word document.
  it.skipIf(!process.env.WORD_EXPORT)('writes the package for Word', () => {
    const out = process.env.WORD_EXPORT!;
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'packages.json'), JSON.stringify([{ label: 'exercise from a picture', xml: buildPagePackage(texToPage(EXERCISE), style) }]));
  });
});
