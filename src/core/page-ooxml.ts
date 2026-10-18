/**
 * Text with formulas (an exercise read from a picture) → Word paragraphs. Every formula
 * becomes a MathStudio equation (a tagged native Word equation), so it can be edited later
 * like any equation typed in the editor.
 */
import { latexToOmml, type EquationOptions } from './equation';
import { buildBodyPackage, encodeTag, layoutMath, wrapInContentControl } from './ooxml';
import { escapeXml } from './xml';

export type PageSegment = { kind: 'text'; text: string } | { kind: 'math'; latex: string; display: boolean };

export interface PageParagraphSource {
  segments: PageSegment[];
}

type Style = Pick<EquationOptions, 'fontId' | 'sizePt'>;

function textRun(text: string): string {
  return `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function equation(latex: string, display: boolean, style: Style): string {
  const layout = display ? 'display' : 'inline';
  const content = layoutMath(latexToOmml(latex, { ...style, layout }), layout, 1, { wRPr: '' });
  return wrapInContentControl(content, encodeTag({ latex, layout, number: 1, textHash: '' }));
}

/**
 * The Flat-OPC package of the paragraphs. A display formula gets a centred paragraph of its
 * own; a formula that cannot be converted is kept as "$…$" text instead of failing it all.
 */
export function buildPagePackage(paragraphs: PageParagraphSource[], style: Style): string {
  const body: string[] = [];
  for (const p of paragraphs) {
    let runs = '';
    const flush = () => {
      if (runs) body.push(`<w:p>${runs}</w:p>`);
      runs = '';
    };
    for (const s of p.segments) {
      if (s.kind === 'text') {
        if (s.text) runs += textRun(s.text);
        continue;
      }
      let xml: string;
      try {
        xml = equation(s.latex, s.display, style);
      } catch {
        runs += textRun(s.display ? `$$${s.latex}$$` : `$${s.latex}$`);
        continue;
      }
      if (s.display) {
        flush();
        body.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${xml}</w:p>`);
      } else runs += xml;
    }
    flush();
  }
  return buildBodyPackage(body.join('') || '<w:p/>');
}
