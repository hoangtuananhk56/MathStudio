/**
 * OOXML for an equation inserted as a picture (the MathType-style rendering):
 * an inline SVG (with a PNG fallback for older Word), sized from the font size and
 * lowered so the equation's baseline sits on the text baseline.
 */
import type { Layout } from './ooxml';
import { escapeXml } from './xml';

const EMU_PER_PT = 12700;

export interface PictureData {
  svg: string;
  /** Base64 PNG fallback (Word requires a raster blip next to the SVG one). */
  pngBase64: string;
  /** Metrics in em (see RenderedSvg). */
  width: number;
  height: number;
  depth: number;
}

export interface PictureStyle {
  /** Equation font size in points. */
  fontPt: number;
  /** Font for the equation number "(n)". */
  numberFont: string;
  /** Alt text — the LaTeX source, also useful for screen readers. */
  alt: string;
}

const REL_PNG = 'rIdMsPng';
const REL_SVG = 'rIdMsSvg';

export function utf8Base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export interface PictureRels {
  png: string;
  svg: string;
}

const DEFAULT_RELS: PictureRels = { png: REL_PNG, svg: REL_SVG };

/**
 * The <w:r> holding the inline picture. DrawingML namespaces are declared inline so the
 * markup is valid wherever it is placed (a package, or an existing document part).
 */
export function pictureRun(p: PictureData, style: PictureStyle, rels: PictureRels = DEFAULT_RELS): string {
  const cx = Math.max(1, Math.round(p.width * style.fontPt * EMU_PER_PT));
  const cy = Math.max(1, Math.round((p.height + p.depth) * style.fontPt * EMU_PER_PT));
  // w:position is in half-points; negative lowers the run so the math baseline matches the text.
  const lower = Math.round(p.depth * style.fontPt * 2);
  return drawingRun(cx, cy, lower, style.alt, 'MathStudio Equation', rels);
}

const EMU_PER_CM = 360000;

/** An inline picture of a given size in centimetres (geometry figures). */
export function figureRun(widthCm: number, heightCm: number, alt: string, rels: PictureRels = DEFAULT_RELS): string {
  return drawingRun(Math.max(1, Math.round(widthCm * EMU_PER_CM)), Math.max(1, Math.round(heightCm * EMU_PER_CM)), 0, alt, 'MathStudio Figure', rels);
}

/** The <w:r><w:drawing> for an inline SVG picture (with PNG fallback). */
function drawingRun(cx: number, cy: number, lowerHalfPts: number, altText: string, name: string, rels: PictureRels): string {
  const id = 1 + Math.floor(Math.random() * 0x7ffffff0);
  const alt = escapeXml(altText);
  return (
    `<w:r><w:rPr>${lowerHalfPts ? `<w:position w:val="${-lowerHalfPts}"/>` : ''}</w:rPr><w:drawing>` +
    '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${id}" name="${name} ${id}" descr="${alt}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="0" name="mathstudio.svg" descr="${alt}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rels.png}"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">` +
    `<asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${rels.svg}"/></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  );
}

function textRun(text: string, style: PictureStyle): string {
  const f = escapeXml(style.numberFont);
  const sz = Math.round(style.fontPt * 2);
  return `<w:r><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r>`;
}

const ptab = (alignment: 'center' | 'right') =>
  `<w:r><w:ptab w:relativeTo="margin" w:alignment="${alignment}" w:leader="none"/></w:r>`;

/** Paragraph content for the picture in the given layout (numbers placed with positional tabs). */
export function pictureLayout(p: PictureData, style: PictureStyle, layout: Layout, n: number, rels: PictureRels = DEFAULT_RELS): string {
  const pic = pictureRun(p, style, rels);
  switch (layout) {
    case 'inline':
    case 'display':
      return pic;
    case 'right':
      return ptab('center') + pic + ptab('right') + textRun(`(${n})`, style);
    case 'left':
      return textRun(`(${n})`, style) + ptab('center') + pic;
  }
}

/** A complete Flat-OPC package containing one paragraph with the picture and its media parts. */
/** A centred caption paragraph "Hình n" with a SEQ field, so Word renumbers figures. */
export function captionParagraph(n: number, word = 'Hình'): string {
  const r = (t: string) => `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${r(`${word} `)}<w:fldSimple w:instr=" SEQ ${word} \\* ARABIC ">${r(String(n))}</w:fldSimple></w:p>`;
}

/** Flat-OPC package with the picture paragraph and, optionally, more paragraphs after it (a caption). */
export function buildPicturePackage(paragraphContent: string, layout: Layout, p: Pick<PictureData, 'svg' | 'pngBase64'>, after = ''): string {
  const pPr = layout === 'display' ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : layout === 'inline' ? '' : '<w:pPr><w:jc w:val="left"/></w:pPr>';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return (
    '<?xml version="1.0" standalone="yes"?>' +
    '<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">' +
    '<pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml"><pkg:xmlData>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${rel}/officeDocument" Target="word/document.xml"/>` +
    '</Relationships></pkg:xmlData></pkg:part>' +
    '<pkg:part pkg:name="/word/_rels/document.xml.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml"><pkg:xmlData>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="${REL_PNG}" Type="${rel}/image" Target="media/mathstudio.png"/>` +
    `<Relationship Id="${REL_SVG}" Type="${rel}/image" Target="media/mathstudio.svg"/>` +
    '</Relationships></pkg:xmlData></pkg:part>' +
    '<pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"><pkg:xmlData>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    `xmlns:r="${rel}" ` +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
    'xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" ' +
    'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">' +
    `<w:body><w:p>${pPr}${paragraphContent}</w:p>${after}</w:body></w:document>` +
    '</pkg:xmlData></pkg:part>' +
    `<pkg:part pkg:name="/word/media/mathstudio.png" pkg:contentType="image/png" pkg:compression="store"><pkg:binaryData>${p.pngBase64}</pkg:binaryData></pkg:part>` +
    `<pkg:part pkg:name="/word/media/mathstudio.svg" pkg:contentType="image/svg+xml" pkg:compression="store"><pkg:binaryData>${utf8Base64(p.svg)}</pkg:binaryData></pkg:part>` +
    '</pkg:package>'
  );
}
