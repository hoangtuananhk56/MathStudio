/** Geometry figures in Word: insert, read back for editing, and the editor dialog. */
import { buildPicturePackage, captionParagraph, figureRun } from '../core/image-ooxml';
import { wrapInContentControl } from '../core/ooxml';
import { computeAll } from '../geometry/engine';
import type { Construction } from '../geometry/model';
import { decodeConstructionFromSvg, PX_PER_CM, renderConstruction } from '../geometry/render';
import { encodeGeometryInit, type GeometryInit, type GeometryMessage } from '../shared/protocol';
import { rasterizeSvg } from './rasterize';
import { flatOpcText } from '../geometry/exerciseText';

/** Content-control tag prefix of MathStudio figures (equations use "mt2|"). */
export const GEOMETRY_TAG = 'mt2g|1|';

export function isGeometryTag(tag: string | null | undefined): boolean {
  return !!tag && tag.startsWith('mt2g|');
}

const GEOMETRY_URL = new URL('../geometry-editor/index.html', window.location.href).href;

/** Renders the construction and builds the Word package for it. */
async function buildFigurePackage(c: Construction, captionNumber?: number): Promise<string> {
  const fig = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 });
  // Raster fallback at ~3x screen resolution.
  const px = (cm: number) => Math.max(1, Math.round(cm * PX_PER_CM * 3));
  const png = await rasterizeSvg(fig.svg, px(fig.width), px(fig.height));
  const run = figureRun(fig.width, fig.height, 'MathStudio – hình vẽ');
  // a caption makes the figure its own centred paragraph, with "Hình n" under it
  // (the empty paragraph at the end is the one Word merges into the paragraph at the cursor)
  const after = captionNumber ? `${captionParagraph(captionNumber)}<w:p/>` : '';
  return buildPicturePackage(wrapInContentControl(run, GEOMETRY_TAG), captionNumber ? 'display' : 'inline', { svg: fig.svg, pngBase64: png }, after);
}

/** The figure at the cursor (its construction), or null. */
async function readSelectedFigure(): Promise<Construction | null> {
  try {
    return await Word.run(async (ctx) => {
      const cc = ctx.document.getSelection().parentContentControlOrNullObject;
      cc.load('tag');
      await ctx.sync();
      if (cc.isNullObject || !isGeometryTag(cc.tag)) return null;
      const ooxml = cc.getOoxml();
      await ctx.sync();
      // The SVG part travels inside the OOXML package as base64 binary data.
      const m = /pkg:contentType="image\/svg\+xml"[^>]*>\s*<pkg:binaryData>([A-Za-z0-9+/=\s]+)<\/pkg:binaryData>/.exec(ooxml.value);
      if (!m) return null;
      const bin = atob(m[1].replace(/\s+/g, ''));
      const svg = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
      return decodeConstructionFromSvg(svg);
    });
  } catch (e) {
    console.warn('MathStudio: could not read the figure', e);
    return null;
  }
}

/**
 * The exercise selected in the document, as text (equations included), or '' when the
 * selection is empty or too short to be an exercise.
 */
async function readSelectedExercise(): Promise<string> {
  try {
    return await Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      sel.load('text');
      await ctx.sync();
      if ((sel.text ?? '').trim().length < 12) return '';
      const ooxml = sel.getOoxml();
      await ctx.sync();
      const text = flatOpcText(ooxml.value).filter(Boolean).join('\n');
      return (text || sel.text).slice(0, 2500);
    });
  } catch (e) {
    console.warn('MathStudio: could not read the selected exercise', e);
    return '';
  }
}

/** True when the cursor is inside a MathStudio figure. */
export async function selectionIsFigure(): Promise<boolean> {
  try {
    return await Word.run(async (ctx) => {
      const cc = ctx.document.getSelection().parentContentControlOrNullObject;
      cc.load('tag');
      await ctx.sync();
      return !cc.isNullObject && isGeometryTag(cc.tag);
    });
  } catch {
    return false;
  }
}

/** Inserts the figure at the selection, or replaces the selected figure. */
export async function insertFigure(c: Construction): Promise<void> {
  await Word.run(async (ctx) => {
    const sel = ctx.document.getSelection();
    const cc = sel.parentContentControlOrNullObject;
    cc.load('tag');
    const all = ctx.document.contentControls;
    all.load('items/tag');
    await ctx.sync();
    const replacing = !cc.isNullObject && isGeometryTag(cc.tag);
    // a new figure with a caption: number it after the figures already in the document
    const n = c.caption && !replacing ? all.items.filter((x) => isGeometryTag(x.tag)).length + 1 : undefined;
    const pkg = await buildFigurePackage(c, n);
    sel.load('isEmpty');
    await ctx.sync();
    // a selected exercise stays: the figure goes in a new paragraph after it
    const target = replacing ? cc.getRange('Whole') : sel.isEmpty ? sel : sel.paragraphs.getLast().insertParagraph('', 'After').getRange('Start');
    const inserted = target.insertOoxml(pkg, 'Replace');
    await ctx.sync();
    inserted.getRange('After').select('Start');
    await ctx.sync();
  });
}

function showGeometryDialog(init: GeometryInit): Promise<GeometryMessage> {
  return new Promise((resolve, reject) => {
    const url = `${GEOMETRY_URL}?init=${encodeGeometryInit(init)}`;
    Office.context.ui.displayDialogAsync(url, { height: 90, width: 85, displayInIframe: true }, (res) => {
      if (res.status !== Office.AsyncResultStatus.Succeeded) {
        reject(new Error(res.error.message));
        return;
      }
      const dialog = res.value;
      dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
        dialog.close();
        try {
          resolve(JSON.parse((arg as { message: string }).message) as GeometryMessage);
        } catch {
          resolve({ type: 'cancel' });
        }
      });
      dialog.addEventHandler(Office.EventType.DialogEventReceived, () => resolve({ type: 'cancel' }));
    });
  });
}

/** Opens the geometry editor on the selected figure, or for a new one; inserts the result. */
export async function runGeometryEditor(): Promise<void> {
  const existing = await readSelectedFigure();
  const exercise = existing ? '' : await readSelectedExercise();
  let init: GeometryInit = existing ? { construction: existing, mode: 'edit' } : { mode: 'insert', ...(exercise ? { exercise } : {}) };
  for (;;) {
    const msg = await showGeometryDialog(init);
    if (msg.type !== 'insertGeometry') return;
    try {
      await insertFigure(msg.construction);
      return;
    } catch (e) {
      init = { construction: msg.construction, mode: init.mode, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
