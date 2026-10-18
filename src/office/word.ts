/** Word document operations (Office.js, WordApi 1.3 — available since Office 2019). */
import { buildEquationPackageAsync, latexToOmml, type EquationOptions, type PictureEnv } from '../core/equation';
import { latexToMathml } from '../core/latex';
import {
  buildPackage as buildOoxmlPackage,
  decodeTag,
  encodeTag,
  extractFirstOMath,
  isDisplayLayout,
  isEquationTag,
  isNumberedLayout,
  layoutMath,
  textHash,
  type Layout,
  type RenderKind,
} from '../core/ooxml';
import { ommlToLatex } from '../core/omml-to-latex';
import { buildPagePackage, type PageParagraphSource } from '../core/page-ooxml';
import { rasterizeSvg } from './rasterize';

export interface SelectedEquation {
  latex: string;
  layout: Layout;
  kind: RenderKind;
  /** 'ours' = created by this add-in, 'native' = Word's own equation, 'none' = no equation selected. */
  source: 'ours' | 'native' | 'none';
}

/** Style shared by commands that (re)build equations without the editor. */
export type EquationStyle = Pick<EquationOptions, 'fontId' | 'sizePt' | 'kind'>;

const NO_EQUATION: SelectedEquation = { latex: '', layout: 'inline', kind: 'omml', source: 'none' };
const DEFAULT_FONT_PT = 12;

/** Builds the package for an equation; picture equations are sized from `fontPt`. */
function buildPackage(latex: string, opts: EquationOptions, fontPt: number | null): Promise<string> {
  const env: PictureEnv = { fontPt: fontPt && fontPt > 0 ? fontPt : DEFAULT_FONT_PT, rasterize: rasterizeSvg };
  return buildEquationPackageAsync(latex, opts, env);
}

/**
 * Finds the equation at the cursor / in the selection, if any.
 * Never throws: failing to read the selection must not stop the editor from opening.
 */
export async function readSelectedEquation(): Promise<SelectedEquation> {
  try {
    return await Word.run((ctx) => readSelection(ctx));
  } catch (e) {
    console.warn('MathStudio: could not read the selection', e);
    return NO_EQUATION;
  }
}

async function readSelection(ctx: Word.RequestContext): Promise<SelectedEquation> {
  const sel = ctx.document.getSelection();
  const cc = sel.parentContentControlOrNullObject;
  cc.load('tag,text');
  sel.load('isEmpty');
  await ctx.sync();

  if (!cc.isNullObject && isEquationTag(cc.tag)) {
    const src = decodeTag(cc.tag)!;
    const kind = src.kind ?? 'omml';
    // A native equation edited directly in Word since we inserted it? Then the document is the truth.
    if (kind === 'omml' && src.textHash && textHash(cc.text) !== src.textHash) {
      const ooxml = cc.getOoxml();
      await ctx.sync();
      const omath = extractFirstOMath(ooxml.value);
      if (omath) return { latex: ommlToLatex(omath), layout: src.layout, kind, source: 'ours' };
    }
    return { latex: src.latex, layout: src.layout, kind, source: 'ours' };
  }

  // A native Word equation can only be picked up when it is selected
  // (getOoxml on a collapsed selection fails in Word 2019).
  if (sel.isEmpty) return NO_EQUATION;
  const ooxml = sel.getOoxml();
  await ctx.sync();
  const omath = extractFirstOMath(ooxml.value);
  if (omath) {
    const layout: Layout = ooxml.value.includes('<m:oMathPara') ? 'display' : 'inline';
    return { latex: ommlToLatex(omath), layout, kind: 'omml', source: 'native' };
  }
  return NO_EQUATION;
}

/**
 * Inserts an equation at the selection, or replaces the selected equation.
 * Display and numbered equations always get a paragraph of their own.
 */
export async function insertEquation(latex: string, opts: EquationOptions): Promise<void> {
  await Word.run(async (ctx) => {
    const sel = ctx.document.getSelection();
    const cc = sel.parentContentControlOrNullObject;
    cc.load('tag');
    sel.load('font/size');
    await ctx.sync();

    const editing = !cc.isNullObject && isEquationTag(cc.tag);
    let target: Word.Range = editing ? cc.getRange('Whole') : sel;

    if (isDisplayLayout(opts.layout)) {
      const para = target.paragraphs.getFirst();
      para.load('text');
      target.load('text');
      await ctx.sync();
      const alone = para.text.trim() === '' || para.text.trim() === target.text.trim();
      if (!alone) {
        if (editing) cc.delete(false);
        target = para.insertParagraph('', 'After').getRange('Whole');
      }
    }

    const inserted = target.insertOoxml(await buildPackage(latex, opts, sel.font.size), 'Replace');
    await ctx.sync();
    // Word keeps the target paragraph's own formatting, so set the alignment explicitly.
    const align = paragraphAlignment(opts.layout, opts.kind ?? 'omml');
    if (align) inserted.paragraphs.getFirst().alignment = align;

    // Record a fingerprint of the rendered text so later edits made in Word are detected,
    // then put the cursor right after the equation (like MathType does).
    const newCc = inserted.contentControls.getFirstOrNullObject();
    newCc.load('text,tag');
    await ctx.sync();
    if (!newCc.isNullObject && isEquationTag(newCc.tag)) {
      const src = decodeTag(newCc.tag)!;
      if ((src.kind ?? 'omml') === 'omml') newCc.tag = encodeTag({ ...src, textHash: textHash(newCc.text) });
      newCc.getRange('After').select('Start');
    }
    await ctx.sync();
  });

  if (isNumberedLayout(opts.layout)) await renumberEquations(opts);
}

/** Inserts paragraphs of text and equations (an exercise read from a picture) at the selection. */
export async function insertPage(paragraphs: PageParagraphSource[], style: Pick<EquationStyle, 'fontId' | 'sizePt'>): Promise<void> {
  await Word.run(async (ctx) => {
    const inserted = ctx.document.getSelection().insertOoxml(buildPagePackage(paragraphs, style), 'Replace');
    inserted.getRange('End').select('Start');
    await ctx.sync();
  });
}

/**
 * The selected picture (a photo or scan pasted in the document) as a data URL, or null.
 * Never throws.
 */
export async function readSelectedPicture(): Promise<string | null> {
  try {
    return await Word.run(async (ctx) => {
      const pics = ctx.document.getSelection().inlinePictures;
      pics.load('items');
      await ctx.sync();
      if (!pics.items.length) return null;
      const b64 = pics.items[0].getBase64ImageSrc();
      await ctx.sync();
      if (!b64.value) return null;
      const type = b64.value.startsWith('/9j/') ? 'jpeg' : b64.value.startsWith('R0lG') ? 'gif' : b64.value.startsWith('Qk') ? 'bmp' : 'png';
      return `data:image/${type};base64,${b64.value}`;
    });
  } catch (e) {
    console.warn('MathStudio: could not read the selected picture', e);
    return null;
  }
}

/**
 * Paragraph alignment per layout. Native right-numbered equations are centred (Word pushes
 * the number to the margin); pictures place numbers with positional tabs from a left-aligned paragraph.
 */
function paragraphAlignment(layout: Layout, kind: RenderKind): Word.Alignment | null {
  if (layout === 'inline') return null;
  if (layout === 'display') return Word.Alignment.centered;
  if (layout === 'right' && kind === 'omml') return Word.Alignment.centered;
  return Word.Alignment.left;
}

/**
 * Renumbers all numbered equations in document order (MathType: "Update Equation Numbers").
 * Only equations whose number changed are rewritten; each keeps its own rendering kind.
 */
export async function renumberEquations(style: EquationStyle): Promise<number> {
  return Word.run(async (ctx) => {
    const ccs = ctx.document.contentControls;
    ccs.load('items/tag');
    await ctx.sync();

    let n = 0;
    for (const cc of ccs.items) {
      if (!isEquationTag(cc.tag)) continue;
      const src = decodeTag(cc.tag);
      if (!src || !isNumberedLayout(src.layout)) continue;
      n++;
      if (src.number === n) continue;
      const range = cc.getRange('Whole');
      range.load('font/size');
      await ctx.sync();
      const kind = src.kind ?? 'omml';
      const opts: EquationOptions = { layout: src.layout, number: n, fontId: style.fontId, sizePt: style.sizePt, kind };
      const r = range.insertOoxml(await buildPackage(src.latex, opts, range.font.size), 'Replace');
      r.paragraphs.getFirst().alignment = paragraphAlignment(src.layout, kind)!;
    }
    await ctx.sync();
    return n;
  });
}

const TEX_DELIMITERS = /^\s*(\$\$|\\\[|\$|\\\()([\s\S]*?)(\$\$|\\\]|\$|\\\))\s*$/;

/**
 * MathType's "Toggle TeX": an equation becomes `$…$` text, and selected
 * `$…$` / `$$…$$` / `\(…\)` / `\[…\]` text becomes an equation.
 * Throws if the selected TeX cannot be converted.
 */
export async function toggleTex(style: EquationStyle): Promise<void> {
  const toText = await Word.run(async (ctx) => {
    const eq = await readSelection(ctx);
    if (eq.source === 'none') return null;
    const text = isDisplayLayout(eq.layout) ? `$$${eq.latex}$$` : `$${eq.latex}$`;
    const sel = ctx.document.getSelection();
    const cc = sel.parentContentControlOrNullObject;
    cc.load('tag');
    await ctx.sync();
    const target = !cc.isNullObject && isEquationTag(cc.tag) ? cc.getRange('Whole') : sel;
    target.insertText(text, 'Replace');
    await ctx.sync();
    return text;
  });
  if (toText !== null) return;

  const { latex, display } = await Word.run(async (ctx) => {
    const sel = ctx.document.getSelection();
    sel.load('text');
    await ctx.sync();
    const m = TEX_DELIMITERS.exec(sel.text);
    const value = { latex: (m ? m[2] : sel.text).trim(), display: !!m && (m[1] === '$$' || m[1] === '\\[') };
    if (value.latex) latexToMathml(value.latex); // validate before touching the document
    if (display && value.latex) {
      sel.insertText('', 'Replace');
      await ctx.sync();
    }
    return value;
  });
  if (!latex) return;
  await insertEquation(latex, { layout: display ? 'display' : 'inline', ...style });
}

/** Converts the selected MathStudio equation between picture and native Word equation. */
export async function convertSelectedEquation(style: EquationStyle): Promise<boolean> {
  const eq = await readSelectedEquation();
  if (eq.source === 'none') return false;
  const kind: RenderKind = eq.kind === 'image' ? 'omml' : 'image';
  await insertEquation(eq.latex, { layout: eq.layout, fontId: style.fontId, sizePt: style.sizePt, kind });
  return true;
}

/**
 * Prepares the document for MathType: every MathStudio equation becomes either a plain
 * Word equation (MathType ▸ Convert Equations turns these into MathType objects) or
 * `$…$` / `$$…$$` text (MathType ▸ Toggle TeX). Returns the number of equations changed.
 */
export async function exportForMathType(mode: 'omml' | 'tex', style: EquationStyle): Promise<number> {
  return Word.run(async (ctx) => {
    const ccs = ctx.document.contentControls;
    ccs.load('items/tag');
    await ctx.sync();
    let n = 0;
    for (const cc of ccs.items) {
      const src = isEquationTag(cc.tag) ? decodeTag(cc.tag) : null;
      if (!src) continue;
      const range = cc.getRange('Whole');
      if (mode === 'tex') {
        range.insertText(isDisplayLayout(src.layout) ? `$$${src.latex}$$` : `$${src.latex}$`, 'Replace');
      } else {
        // Plain equation, without our content control, so MathType's converter picks it up.
        const opts: EquationOptions = { layout: src.layout, number: src.number, fontId: style.fontId, sizePt: style.sizePt };
        const pkg = buildOoxmlPackage(layoutMath(latexToOmml(src.latex, opts), src.layout, src.number ?? 1, { wRPr: '' }), src.layout);
        const r = range.insertOoxml(pkg, 'Replace');
        const align = paragraphAlignment(src.layout, 'omml');
        if (align) r.paragraphs.getFirst().alignment = align;
      }
      n++;
    }
    await ctx.sync();
    return n;
  });
}
