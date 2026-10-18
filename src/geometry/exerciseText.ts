/**
 * The wording of an exercise as plain text, equations included: MathType objects,
 * Word equations and MathStudio equations become readable text ("∆ABC", "AB = 3 cm",
 * "góc ABC = 60°", "AH ⊥ BC") that the figure parser understands.
 */
import { strFromU8, unzipSync } from 'fflate';
import CFB from 'cfb';
import { mtefFromEquationNative, mtefToLatex } from '../core/mtef';
import { ommlToLatex } from '../core/omml-to-latex';
import { decodeTag } from '../core/ooxml';

/** LaTeX of a school equation → the plain text a teacher would type. */
export function latexToPlain(latex: string): string {
  let s = latex;
  const rules: [RegExp, string][] = [
    [/\\(?:widehat|hat|angle)\s*\{([^{}]*)\}/g, 'góc $1'],
    [/\\(?:widehat|hat)\s*([A-Za-z])/g, 'góc $1'],
    [/\\angle\s*/g, 'góc '],
    [/\\(?:overline|overrightarrow|vec)\s*\{([^{}]*)\}/g, '$1'],
    [/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2'],
    [/\\(?:d|t)?frac\s*(\d)(\d)/g, '$1/$2'],
    [/\^\s*\{?\s*\\circ\s*\}?/g, '°'],
    [/\^\s*\{?\s*o\s*\}?/g, '°'],
    [/\\circ/g, '°'],
    [/\\(?:Delta|triangle|vartriangle|bigtriangleup)\s*/g, '∆'],
    [/\\(?:bot|perp)\b\s*/g, ' ⊥ '],
    [/\\(?:parallel|\|)\s*/g, ' // '],
    [/\\notin\b\s*/g, ' ∉ '],
    [/\\in\b\s*/g, ' ∈ '],
    [/\\cap\b\s*/g, ' ∩ '],
    [/\\equiv\b\s*/g, ' ≡ '],
    [/\\(?:ne|neq)\b\s*/g, ' ≠ '],
    [/\\(?:le|leq)\b\s*/g, ' ≤ '],
    [/\\(?:ge|geq)\b\s*/g, ' ≥ '],
    [/\\cdot\b\s*/g, '·'],
    [/\\times\b\s*/g, '×'],
    [/\\(?:text|mathrm|textrm|mathit|operatorname|mbox)\s*\{([^{}]*)\}/g, '$1'],
    [/\\left\s*\.?|\\right\s*\.?/g, ''],
    [/\\[,;:! ]/g, ' '],
    [/~/g, ' '],
    [/\\(?:quad|qquad)\b/g, ' '],
    [/\\([A-Za-z]+)/g, ''],
    [/[{}]/g, ''],
  ];
  for (let pass = 0; pass < 3; pass++) for (const [re, to] of rules) s = s.replace(re, to);
  return s.replace(/\s*=\s*/g, ' = ').replace(/\s+/g, ' ').trim();
}

/** Text of one OLE MathType object (the bytes of its compound file). */
function oleText(bin: Uint8Array): string {
  try {
    const cfb = CFB.read(bin, { type: 'buffer' });
    const st = CFB.find(cfb, 'Equation Native');
    if (!st?.content) return '';
    return latexToPlain(mtefToLatex(mtefFromEquationNative(new Uint8Array(st.content as ArrayLike<number>))));
  } catch {
    return '';
  }
}

const TOKEN =
  /<w:sdt>([\s\S]*?)<\/w:sdt>|<m:oMath>([\s\S]*?)<\/m:oMath>|<w:object\b[\s\S]*?<o:OLEObject\b[^>]*\br:id="([^"]+)"[\s\S]*?<\/w:object>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g;

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Plain text of WordprocessingML paragraphs; `ole(rId)` gives the bytes of an embedded object. */
export function paragraphsText(documentXml: string, ole: (rId: string) => Uint8Array | null): string[] {
  const out: string[] = [];
  for (const pm of documentXml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    let line = '';
    for (const m of pm[1].matchAll(TOKEN)) {
      if (m[1] !== undefined) {
        // a MathStudio equation keeps its LaTeX in the tag; other content controls: their text
        const tag = /<w:tag w:val="([^"]*)"/.exec(m[1])?.[1];
        const src = tag ? decodeTag(unescape(tag)) : null;
        if (src) line += ` ${latexToPlain(src.latex)} `;
        else line += paragraphsText(`<w:p>${m[1]}</w:p>`, ole).join(' ');
      } else if (m[2] !== undefined) {
        try {
          line += ` ${latexToPlain(ommlToLatex(`<m:oMath>${m[2]}</m:oMath>`))} `;
        } catch {
          /* unreadable equation */
        }
      } else if (m[3] !== undefined) {
        const bin = ole(m[3]);
        if (bin) line += ` ${oleText(bin)} `;
      } else if (m[4] !== undefined) line += unescape(m[4]);
      else line += ' ';
    }
    out.push(line.replace(/\s+/g, ' ').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s+/g, '(').trim());
  }
  return out;
}

/** The text of a .docx file (main document), equations included. */
export function docxText(bytes: Uint8Array): string[] {
  const files = unzipSync(bytes);
  const xml = strFromU8(files['word/document.xml']);
  const rels = strFromU8(files['word/_rels/document.xml.rels'] ?? new Uint8Array());
  const target = (rId: string) => new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rId}"`).exec(rels);
  return paragraphsText(xml, (rId) => {
    const m = target(rId);
    const t = m?.[1] ?? m?.[2];
    return t ? files[`word/${t.replace(/^\.?\//, '')}`] ?? null : null;
  });
}

/** The text of a Flat-OPC package (what Word's getOoxml returns for the selection). */
export function flatOpcText(pkg: string): string[] {
  const part = (name: string) => new RegExp(`<pkg:part pkg:name="${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"[^>]*>([\\s\\S]*?)</pkg:part>`).exec(pkg)?.[1] ?? '';
  const xml = /<w:body>([\s\S]*?)<\/w:body>/.exec(part('/word/document.xml'))?.[1] ?? pkg;
  const rels = part('/word/_rels/document.xml.rels');
  return paragraphsText(xml, (rId) => {
    const m = new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rId}"`).exec(rels);
    const t = m?.[1] ?? m?.[2];
    if (!t) return null;
    const b64 = /<pkg:binaryData>([\s\S]*?)<\/pkg:binaryData>/.exec(part(`/word/${t.replace(/^\.?\//, '')}`))?.[1];
    if (!b64) return null;
    const bin = atob(b64.replace(/\s+/g, ''));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  });
}
