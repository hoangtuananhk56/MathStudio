/**
 * LaTeX -> standalone SVG with MathJax 4 (glyphs drawn as paths, so the equation
 * looks identical on every machine — the MathType-style "picture" rendering).
 * All font data is bundled (dynamic ranges via import.meta.glob), so it works offline.
 */
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/js/input/tex/configmacros/ConfigMacrosConfiguration.js';
import '@mathjax/src/js/input/tex/cancel/CancelConfiguration.js';
import '@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js';
import '@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import { cleanLatex } from './latex';

export type ImageFont = 'termes' | 'stix2' | 'newcm';

/** Lazily loaded dynamic glyph ranges of each font, keyed "<font>/<file>.js". */
const DYNAMIC: Record<string, () => Promise<unknown>> = {};
const globs: Record<ImageFont, Record<string, () => Promise<unknown>>> = {
  termes: import.meta.glob('../../node_modules/@mathjax/mathjax-termes-font/mjs/svg/dynamic/*.js'),
  stix2: import.meta.glob('../../node_modules/@mathjax/mathjax-stix2-font/mjs/svg/dynamic/*.js'),
  newcm: import.meta.glob('../../node_modules/@mathjax/mathjax-newcm-font/mjs/svg/dynamic/*.js'),
};
for (const [font, files] of Object.entries(globs)) {
  for (const [path, load] of Object.entries(files)) DYNAMIC[`${font}/${path.split('/').pop()}`] = load;
}
mathjax.asyncLoad = (name: string) => {
  const load = DYNAMIC[name.replace(/^.*?([a-z0-9]+\/[^/]+\.js)$/i, '$1')];
  return load ? load() : Promise.reject(new Error(`MathJax font file not bundled: ${name}`));
};

/** Font data is large, so each font is only loaded when first used. */
const FONT_CLASSES = {
  termes: () => import('@mathjax/mathjax-termes-font/js/svg.js').then((m) => m.MathJaxTermesFont),
  stix2: () => import('@mathjax/mathjax-stix2-font/js/svg.js').then((m) => m.MathJaxStix2Font),
  newcm: () => import('@mathjax/mathjax-newcm-font/js/svg.js').then((m) => m.MathJaxNewcmFont),
};

const MACROS: Record<string, string | [string, number]> = {
  degree: '{^{\\circ}}',
  differentialD: '\\mathrm{d}',
  exponentialE: '\\mathrm{e}',
  imaginaryI: '\\mathrm{i}',
  imaginaryJ: '\\mathrm{j}',
  arc: ['\\overset{\\frown}{#1}', 1],
  R: '\\mathbb{R}',
  N: '\\mathbb{N}',
  Z: '\\mathbb{Z}',
  Q: '\\mathbb{Q}',
  C: '\\mathbb{C}',
};

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

type MathDoc = ReturnType<typeof mathjax.document>;
const docs = new Map<ImageFont, Promise<MathDoc>>();

function docFor(font: ImageFont): Promise<MathDoc> {
  let doc = docs.get(font);
  if (!doc) {
    doc = createDoc(font);
    docs.set(font, doc);
  }
  return doc;
}

async function createDoc(font: ImageFont): Promise<MathDoc> {
  const FontClass = await FONT_CLASSES[font]();
  {
    const tex = new TeX({
      packages: ['base', 'ams', 'newcommand', 'configmacros', 'cancel', 'mathtools', 'boldsymbol'],
      macros: MACROS,
      formatError: (_jax: unknown, err: Error) => {
        throw err;
      },
    });
    const svg = new SVG({
      fontData: new FontClass({ dynamicPrefix: font }),
      fontCache: 'none', // self-contained paths, no <use> references
      // MathJax 4 splits inline math into several <svg> pieces at break points; we need one picture.
      linebreaks: { inline: false },
      mtextInheritFont: false,
      mtextFont: 'Times New Roman',
    });
    return mathjax.document('', { InputJax: tex, OutputJax: svg });
  }
}

export interface RenderedSvg {
  /** Standalone SVG markup (xmlns set, black ink). */
  svg: string;
  /** Box metrics in em: width, height above the baseline, depth below it. */
  width: number;
  height: number;
  depth: number;
}

/** Horizontal margin added on each side of a picture, in 1/1000 em. */
const SIDE_PAD = 80;

/** Renders LaTeX to SVG. Rejects on invalid TeX. */
export async function renderSvg(latex: string, display: boolean, font: ImageFont): Promise<RenderedSvg> {
  const doc = await docFor(font);
  const source = cleanLatex(latex);
  const node = await mathjax.handleRetriesFor(() => doc.convert(source, { display }));
  const svgNode = adaptor.firstChild(node) as Parameters<typeof adaptor.getAttribute>[0];
  const viewBox = (adaptor.getAttribute(svgNode, 'viewBox') ?? '0 0 0 0').split(/\s+/).map(Number);
  const [minX, minY, w0, h] = viewBox;
  // A little side margin, like MathType's equation objects, so neighbouring text doesn't touch.
  const w = w0 + 2 * SIDE_PAD;
  adaptor.setAttribute(svgNode, 'viewBox', `${minX - SIDE_PAD} ${minY} ${w} ${h}`);
  for (const attr of ['style', 'role', 'focusable', 'aria-hidden', 'width', 'height']) adaptor.removeAttribute(svgNode, attr);
  adaptor.setAttribute(svgNode, 'xmlns', 'http://www.w3.org/2000/svg');
  adaptor.setAttribute(svgNode, 'width', `${(w / 1000).toFixed(4)}em`);
  adaptor.setAttribute(svgNode, 'height', `${(h / 1000).toFixed(4)}em`);
  const svg = adaptor
    .outerHTML(svgNode)
    // MathJax's data-* attributes (data-latex…) are not needed and are not XML-escaped ("<").
    .replace(/ data-[\w-]+="[^"]*"/g, '')
    .replace(/currentColor/g, '#000000');
  return { svg, width: w / 1000, height: -minY / 1000, depth: (h + minY) / 1000 };
}
