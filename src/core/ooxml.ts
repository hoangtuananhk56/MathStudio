/**
 * Builds the Flat-OPC package handed to Word (`insertOoxml` / `InsertXML`) and
 * encodes the equation source into the wrapping content control's tag, so an
 * equation carries its own LaTeX wherever it is copied.
 */
import { escapeXml } from './xml';

export const TAG_PREFIX = 'mt2';
const TAG_VERSION = '1';

/** Equation placement, mirroring MathType's Inline / Display / Right- / Left-numbered. */
export type Layout = 'inline' | 'display' | 'right' | 'left';

/** How the equation is rendered: a native Word equation, or a picture (MathType-style). */
export type RenderKind = 'omml' | 'image';

export interface EquationSource {
  latex: string;
  layout: Layout;
  /** Defaults to 'omml'. */
  kind?: RenderKind;
  /** Equation number for numbered layouts. */
  number?: number;
  /** Fingerprint of the equation's plain text when we inserted it; '' if unknown. */
  textHash: string;
}

export function isDisplayLayout(layout: Layout): boolean {
  return layout !== 'inline';
}

export function isNumberedLayout(layout: Layout): boolean {
  return layout === 'right' || layout === 'left';
}

function encodeLayout(layout: Layout, n?: number): string {
  switch (layout) {
    case 'inline': return '0';
    case 'display': return '1';
    case 'right': return `R${n ?? 1}`;
    case 'left': return `L${n ?? 1}`;
  }
}

function decodeLayout(s: string): { layout: Layout; number?: number } {
  if (s === '0') return { layout: 'inline' };
  if (s[0] === 'R' || s[0] === 'L') {
    return { layout: s[0] === 'R' ? 'right' : 'left', number: parseInt(s.slice(1), 10) || 1 };
  }
  return { layout: 'display' };
}

export function encodeTag(src: EquationSource): string {
  const layout = (src.kind === 'image' ? 'i' : '') + encodeLayout(src.layout, src.number);
  return [TAG_PREFIX, TAG_VERSION, layout, src.textHash, encodeURIComponent(src.latex)].join('|');
}

export function decodeTag(tag: string | null | undefined): EquationSource | null {
  if (!tag) return null;
  const parts = tag.split('|');
  if (parts.length < 5 || parts[0] !== TAG_PREFIX) return null;
  try {
    const image = parts[2].startsWith('i');
    const { layout, number } = decodeLayout(image ? parts[2].slice(1) : parts[2]);
    const src: EquationSource = { layout, textHash: parts[3], latex: decodeURIComponent(parts.slice(4).join('|')) };
    if (image) src.kind = 'image';
    if (number !== undefined) src.number = number;
    return src;
  } catch {
    return null;
  }
}

export function isEquationTag(tag: string | null | undefined): boolean {
  return !!tag && tag.startsWith(TAG_PREFIX + '|');
}

/** Short stable hash (FNV-1a) of an equation's visible text, used to detect edits made in Word. */
export function textHash(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of s.replace(/\s+/g, '')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export const CONTENT_CONTROL_TITLE = 'MathStudio';
const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

export interface NumberStyle {
  /** Run properties (<w:rPr>) used for the number, e.g. the text font. */
  wRPr: string;
}

/**
 * Paragraph-level content for an equation in the given layout.
 *  - inline / display: <m:oMath> / <m:oMathPara>
 *  - right-numbered: Word's native "equation # (n)" form, which keeps display style
 *    and pushes the number to the right margin
 *  - left-numbered: "(n)" + centre positional tab + equation (MathType's approach)
 */
export function layoutMath(inner: string, layout: Layout, n: number, num: NumberStyle): string {
  const numberRun = (text: string) => `<m:r><m:rPr><m:sty m:val="p"/></m:rPr>${num.wRPr}<m:t>${text}</m:t></m:r>`;
  switch (layout) {
    case 'inline':
      return `<m:oMath xmlns:m="${M_NS}">${inner}</m:oMath>`;
    case 'display':
      return `<m:oMathPara xmlns:m="${M_NS}"><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr><m:oMath>${inner}</m:oMath></m:oMathPara>`;
    case 'right':
      return (
        // maxDist=1 stretches the row across the line, which is what pushes the number to the right margin.
        `<m:oMathPara xmlns:m="${M_NS}"><m:oMath><m:eqArr>` + '<m:eqArrPr><m:maxDist m:val="1"/><m:ctrlPr>' + num.wRPr + '</m:ctrlPr></m:eqArrPr>' +
        `<m:e>${inner}<m:r><m:t>#</m:t></m:r>` +
        `<m:d><m:dPr><m:ctrlPr>${num.wRPr}</m:ctrlPr></m:dPr><m:e>${numberRun(String(n))}</m:e></m:d>` +
        '</m:e></m:eqArr></m:oMath></m:oMathPara>'
      );
    case 'left':
      return (
        `<w:r>${num.wRPr}<w:t>(${n})</w:t></w:r>` +
        '<w:r><w:ptab w:relativeTo="margin" w:alignment="center" w:leader="none"/></w:r>' +
        `<m:oMath xmlns:m="${M_NS}">${inner}</m:oMath>`
      );
  }
}

/** Wraps paragraph content in an (invisible) inline content control carrying the source tag. */
export function wrapInContentControl(content: string, tag: string): string {
  return (
    `<w:sdt><w:sdtPr><w:alias w:val="${CONTENT_CONTROL_TITLE}"/><w:tag w:val="${escapeXml(tag)}"/>` +
    `<w15:appearance xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" w15:val="hidden"/></w:sdtPr><w:sdtContent>${content}</w:sdtContent></w:sdt>`
  );
}

/** A complete single-paragraph Flat-OPC package. */
export function buildPackage(paragraphContent: string, layout: Layout): string {
  // Set alignment explicitly so the paragraph does not inherit it from where it is inserted.
  const jc = layout === 'display' || layout === 'right' ? 'center' : layout === 'left' ? 'left' : null;
  const pPr = jc ? `<w:pPr><w:jc w:val="${jc}"/></w:pPr>` : '';
  return buildBodyPackage(`<w:p>${pPr}${paragraphContent}</w:p>`);
}

/** A complete Flat-OPC package around body content (one or more <w:p>). */
export function buildBodyPackage(body: string): string {
  return (
    '<?xml version="1.0" standalone="yes"?>' +
    '<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">' +
    '<pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml"><pkg:xmlData>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships></pkg:xmlData></pkg:part>' +
    '<pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"><pkg:xmlData>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
    'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">' +
    `<w:body>${body}</w:body></w:document>` +
    '</pkg:xmlData></pkg:part></pkg:package>'
  );
}

/** Extracts the first <m:oMath> element (as XML) from an OOXML string, or null. */
export function extractFirstOMath(ooxml: string): string | null {
  const start = ooxml.search(/<m:oMath[\s>]/);
  if (start < 0) return null;
  const end = ooxml.indexOf('</m:oMath>', start);
  if (end < 0) return null;
  return ooxml.slice(start, end + '</m:oMath>'.length);
}
