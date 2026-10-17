import { latexToMathml } from './latex';
import { mathmlToOmml, type OmmlStyle } from './mathml-to-omml';
import { buildPicturePackage, pictureLayout } from './image-ooxml';
import { buildPackage, encodeTag, isDisplayLayout, layoutMath, wrapInContentControl, type Layout, type RenderKind } from './ooxml';
import { renderSvg, type ImageFont } from './render-svg';
import { escapeXml } from './xml';

export interface MathFontOption {
  id: string;
  /** Font family name as installed on the system. */
  family: string;
  /** Companion font for \text{...} and equation numbers. */
  textFamily: string;
  label: string;
  /** True for fonts that ship with Office and are always present. */
  builtIn: boolean;
  /** MathType look: letters and digits in this text font (see OmmlStyle.letterFont). */
  letterFamily?: string;
  /** MathJax font used when the equation is inserted as a picture. */
  imageFont: ImageFont;
}

export const MATH_FONTS: MathFontOption[] = [
  // Times look, as close to MathType's defaults as possible: TeX Gyre Termes for pictures,
  // STIX Two Math (Times-based, correct spacing) for native Word equations.
  { id: 'times', family: 'STIX Two Math', textFamily: 'Times New Roman', label: 'Times (giống MathType)', builtIn: false, imageFont: 'termes' },
  { id: 'stix', family: 'STIX Two Math', textFamily: 'Times New Roman', label: 'STIX Two Math', builtIn: false, imageFont: 'stix2' },
  // Letters/digits in Times New Roman like MathType's defaults. Word drops italic correction for
  // such "normal text" runs (f( and some scripts sit too close), so this stays an opt-in.
  {
    id: 'mathtype', family: 'STIX Two Math', textFamily: 'Times New Roman', letterFamily: 'Times New Roman',
    label: 'Times New Roman (chữ thường, thử nghiệm)', builtIn: false, imageFont: 'termes',
  },
  { id: 'termes', family: 'TeX Gyre Termes Math', textFamily: 'Times New Roman', label: 'TeX Gyre Termes Math', builtIn: false, imageFont: 'termes' },
  { id: 'latinmodern', family: 'Latin Modern Math', textFamily: 'Times New Roman', label: 'Latin Modern Math', builtIn: false, imageFont: 'newcm' },
  { id: 'cambria', family: 'Cambria Math', textFamily: 'Cambria', label: 'Cambria Math', builtIn: true, imageFont: 'stix2' },
];

export const DEFAULT_FONT_ID = 'times';

export function fontById(id: string | undefined): MathFontOption {
  return MATH_FONTS.find((f) => f.id === id) ?? MATH_FONTS[0];
}

export interface EquationOptions {
  layout: Layout;
  fontId: string;
  /** Points; undefined keeps the surrounding paragraph size. */
  sizePt?: number;
  /** Equation number for numbered layouts (defaults to 1). */
  number?: number;
  /** Native Word equation (default) or MathType-style picture. */
  kind?: RenderKind;
}

export function styleFor(opts: EquationOptions): OmmlStyle {
  const f = fontById(opts.fontId);
  return { mathFont: f.family, textFont: f.textFamily, letterFont: f.letterFamily, sizePt: opts.sizePt };
}

/** LaTeX -> inner OMML (content of <m:oMath>). */
export function latexToOmml(latex: string, opts: EquationOptions): string {
  return mathmlToOmml(latexToMathml(latex, isDisplayLayout(opts.layout)), styleFor(opts));
}

function numberRPr(opts: EquationOptions): string {
  const f = escapeXml(fontById(opts.fontId).textFamily);
  const sz = opts.sizePt ? `<w:sz w:val="${Math.round(opts.sizePt * 2)}"/><w:szCs w:val="${Math.round(opts.sizePt * 2)}"/>` : '';
  return `<w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/>${sz}</w:rPr>`;
}

/** LaTeX -> full Flat-OPC package wrapped in a tagged content control. */
export function buildEquationPackage(latex: string, opts: EquationOptions, textHash = ''): string {
  const n = opts.number ?? 1;
  const content = layoutMath(latexToOmml(latex, opts), opts.layout, n, { wRPr: numberRPr(opts) });
  const tag = encodeTag({ latex, layout: opts.layout, number: n, textHash });
  return buildPackage(wrapInContentControl(content, tag), opts.layout);
}

export interface PictureEnv {
  /** Font size used when opts.sizePt is not set (the paragraph's size). */
  fontPt: number;
  /** SVG -> base64 PNG fallback at the given pixel size. */
  rasterize(svg: string, widthPx: number, heightPx: number): Promise<string>;
}

/** LaTeX -> package for either rendering kind. Pictures need the async MathJax/raster step. */
export async function buildEquationPackageAsync(
  latex: string,
  opts: EquationOptions,
  env: PictureEnv,
  textHash = '',
): Promise<string> {
  if (opts.kind !== 'image') return buildEquationPackage(latex, opts, textHash);
  const font = fontById(opts.fontId);
  const fontPt = opts.sizePt ?? env.fontPt;
  // Like MathType, pictures always use full-size (display) style — also for inline equations.
  const r = await renderSvg(latex, true, font.imageFont);
  // Raster fallback at 3x of 96 dpi so it still looks sharp where SVG is unsupported.
  const pxPerEm = (fontPt * 96) / 72 * 3;
  const pngBase64 = await env.rasterize(r.svg, Math.ceil(r.width * pxPerEm), Math.ceil((r.height + r.depth) * pxPerEm));
  const n = opts.number ?? 1;
  const content = pictureLayout({ ...r, pngBase64 }, { fontPt, numberFont: font.textFamily, alt: latex }, opts.layout, n);
  const tag = encodeTag({ latex, layout: opts.layout, kind: 'image', number: n, textHash: '' });
  return buildPicturePackage(wrapInContentControl(content, tag), opts.layout, { ...r, pngBase64 });
}
