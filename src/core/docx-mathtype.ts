/**
 * Converts every MathType equation (OLE "Equation.DSMT*" / "Equation.3") in a .docx
 * into a MathStudio equation — native Word equation or MathType-style picture —
 * keeping its size. Works on the whole file (body, headers, footers, notes) and
 * returns a new .docx; equations that cannot be read are left untouched.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from 'fflate';
import CFB from 'cfb';
import { fontById, latexToOmml } from './equation';
import { pictureLayout } from './image-ooxml';
import { mtefFromEquationNative, mtefToLatexWithSize } from './mtef';
import { encodeTag, layoutMath, wrapInContentControl, type RenderKind } from './ooxml';
import { renderSvg } from './render-svg';
import { escapeXml } from './xml';

export interface MathTypeConvertOptions {
  kind: RenderKind;
  fontId: string;
  /** SVG -> base64 PNG (pictures only). */
  rasterize(svg: string, widthPx: number, heightPx: number): Promise<string>;
  onProgress?(done: number, total: number): void;
}

export interface MathTypeConvertReport {
  total: number;
  converted: number;
  /** Empty MathType objects, left as they are. */
  skipped: number;
  failed: { part: string; object: string; error: string }[];
}

const PART_RE = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
// One run (<w:r …>…</w:r>, not <w:rPr>) that embeds a MathType OLE object.
const RUN_RE = /<w:r(?=[\s>])(?:(?!<\/w:r>)[\s\S])*?<o:OLEObject\b[^>]*\/?>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g;
const OLE_RE = /<o:OLEObject\b([^>]*)\/?>/;
const DEFAULT_SIZE_PT = 12;

const NAMESPACES: Record<string, string> = {
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  w15: 'http://schemas.microsoft.com/office/word/2012/wordml',
};

interface Rel {
  id: string;
  type: string;
  target: string;
  mode?: string;
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name.replace(':', '\\:')}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

function parseRels(xml: string): Rel[] {
  return Array.from(xml.matchAll(/<Relationship\b[^>]*\/?>/g)).map((m) => ({
    id: attr(m[0], 'Id') ?? '',
    type: attr(m[0], 'Type') ?? '',
    target: attr(m[0], 'Target') ?? '',
    mode: attr(m[0], 'TargetMode') ?? undefined,
  }));
}

function serializeRels(rels: Rel[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    rels
      .map((r) => `<Relationship Id="${escapeXml(r.id)}" Type="${escapeXml(r.type)}" Target="${escapeXml(r.target)}"${r.mode ? ` TargetMode="${r.mode}"` : ''}/>`)
      .join('') +
    '</Relationships>'
  );
}

/** Resolves a relationship target relative to the part's folder ("word/"). */
function resolveTarget(partPath: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = partPath.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function relsPathFor(partPath: string): string {
  const i = partPath.lastIndexOf('/');
  return `${partPath.slice(0, i)}/_rels/${partPath.slice(i + 1)}.rels`;
}

/** Adds missing namespace declarations to the part's root element. */
function ensureNamespaces(xml: string): string {
  return xml.replace(/<(w:(?:document|hdr|ftr|footnotes|endnotes))\b([^>]*)>/, (_whole, name: string, attrs: string) => {
    let a = attrs;
    for (const [p, uri] of Object.entries(NAMESPACES)) if (!new RegExp(`xmlns:${p}=`).test(a)) a += ` xmlns:${p}="${uri}"`;
    return `<${name}${a}>`;
  });
}

function ensureContentTypes(xml: string): string {
  let out = xml;
  for (const [ext, type] of [
    ['png', 'image/png'],
    ['svg', 'image/svg+xml'],
  ]) {
    if (!new RegExp(`Extension="${ext}"`, 'i').test(out)) out = out.replace('</Types>', `<Default Extension="${ext}" ContentType="${type}"/></Types>`);
  }
  return out;
}

class EmptyEquation extends Error {}

/** LaTeX + size of the MathType object stored at `binPath`, or throws. */
function readMathType(files: Unzipped, binPath: string): { latex: string; sizePt: number } {
  const bin = files[binPath];
  if (!bin) throw new Error(`missing ${binPath}`);
  const cfb = CFB.read(bin, { type: 'array' });
  const stream = CFB.find(cfb, 'Equation Native');
  if (!stream?.content) throw new Error('no "Equation Native" stream');
  const { latex, sizePt } = mtefToLatexWithSize(mtefFromEquationNative(new Uint8Array(stream.content as ArrayLike<number>)));
  if (!latex.trim()) throw new EmptyEquation();
  return { latex, sizePt: sizePt ?? DEFAULT_SIZE_PT };
}

export async function convertMathTypeDocx(
  docx: Uint8Array,
  opts: MathTypeConvertOptions,
): Promise<{ docx: Uint8Array; report: MathTypeConvertReport }> {
  const files = unzipSync(docx);
  const font = fontById(opts.fontId);
  const report: MathTypeConvertReport = { total: 0, converted: 0, skipped: 0, failed: [] };

  // Count first so progress can be reported.
  const parts = Object.keys(files).filter((p) => PART_RE.test(p));
  const isMathTypeRun = (run: string) => /ProgID="Equation\.(DSMT\d*|3)"/.test(run);
  for (const p of parts) report.total += (strFromU8(files[p]).match(RUN_RE) ?? []).filter(isMathTypeRun).length;

  let media = 0;
  let done = 0;
  const removedTargets = new Set<string>();

  for (const partPath of parts) {
    const relsPath = relsPathFor(partPath);
    let rels = files[relsPath] ? parseRels(strFromU8(files[relsPath])) : [];
    const relById = new Map(rels.map((r) => [r.id, r]));
    const dropRelIds = new Set<string>();
    const xml = strFromU8(files[partPath]);
    const runs = (xml.match(RUN_RE) ?? []).filter(isMathTypeRun);
    if (!runs.length) continue;

    const replacements = new Map<string, string>();
    for (const run of runs) {
      const oleTag = OLE_RE.exec(run)?.[0] ?? '';
      const oleRelId = attr(oleTag, 'r:id') ?? '';
      const oleRel = relById.get(oleRelId);
      try {
        if (!oleRel) throw new Error(`relationship ${oleRelId} not found`);
        const { latex, sizePt } = readMathType(files, resolveTarget(partPath, oleRel.target));
        let content: string;
        if (opts.kind === 'image') {
          const r = await renderSvg(latex, true, font.imageFont);
          const pxPerEm = ((sizePt * 96) / 72) * 3;
          const png = await opts.rasterize(r.svg, Math.ceil(r.width * pxPerEm), Math.ceil((r.height + r.depth) * pxPerEm));
          media++;
          const name = `mathstudio-mt${media}`;
          files[`word/media/${name}.png`] = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
          files[`word/media/${name}.svg`] = strToU8(r.svg);
          const ids = { png: `rIdMs${media}p`, svg: `rIdMs${media}s` };
          rels.push({ id: ids.png, type: `${NAMESPACES.r}/image`, target: `media/${name}.png` });
          rels.push({ id: ids.svg, type: `${NAMESPACES.r}/image`, target: `media/${name}.svg` });
          content = pictureLayout({ ...r, pngBase64: png }, { fontPt: sizePt, numberFont: font.textFamily, alt: latex }, 'inline', 1, ids);
        } else {
          content = layoutMath(latexToOmml(latex, { layout: 'inline', fontId: opts.fontId, sizePt }), 'inline', 1, { wRPr: '' });
        }
        const tag = encodeTag({ latex, layout: 'inline', kind: opts.kind, textHash: '' });
        replacements.set(run, wrapInContentControl(content, tag));
        // The OLE object and its preview picture become unused.
        dropRelIds.add(oleRelId);
        for (const m of run.matchAll(/r:id="([^"]+)"/g)) dropRelIds.add(m[1]);
        report.converted++;
      } catch (e) {
        if (e instanceof EmptyEquation) {
          report.skipped++;
          opts.onProgress?.(++done, report.total);
          continue;
        }
        report.failed.push({ part: partPath, object: oleRel?.target ?? oleRelId, error: e instanceof Error ? e.message : String(e) });
      }
      opts.onProgress?.(++done, report.total);
    }

    let out = xml.replace(RUN_RE, (run) => replacements.get(run) ?? run);
    out = ensureNamespaces(out);
    // Drop relationships no longer referenced by the part.
    rels = rels.filter((r) => {
      if (!dropRelIds.has(r.id) || out.includes(`"${r.id}"`)) return true;
      removedTargets.add(resolveTarget(partPath, r.target));
      return false;
    });
    files[partPath] = strToU8(out);
    files[relsPath] = strToU8(serializeRels(rels));
  }

  // Remove embedded objects / previews that no relationship points to any more.
  const stillUsed = new Set<string>();
  for (const [path, data] of Object.entries(files)) {
    if (!path.endsWith('.rels')) continue;
    const owner = path.replace(/_rels\/(.*)\.rels$/, '$1');
    for (const r of parseRels(strFromU8(data))) if (r.mode !== 'External') stillUsed.add(resolveTarget(owner, r.target));
  }
  for (const t of removedTargets) if (!stillUsed.has(t)) delete files[t];

  files['[Content_Types].xml'] = strToU8(ensureContentTypes(strFromU8(files['[Content_Types].xml'])));
  return { docx: zipSync(files, { level: 6 }), report };
}

/** Counts MathType equations in a .docx without converting anything. */
export function countMathTypeEquations(docx: Uint8Array): number {
  const files = unzipSync(docx, { filter: (f) => PART_RE.test(f.name) });
  let n = 0;
  for (const data of Object.values(files)) n += (strFromU8(data).match(RUN_RE) ?? []).filter((r) => /ProgID="Equation\.(DSMT\d*|3)"/.test(r)).length;
  return n;
}

