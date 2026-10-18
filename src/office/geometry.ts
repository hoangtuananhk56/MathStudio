/** Geometry figures in Word: insert, read back for editing, and the editor dialog. */
import { buildPicturePackage, captionParagraph, figureRun } from '../core/image-ooxml';
import { wrapInContentControl } from '../core/ooxml';
import { computeAll } from '../geometry/engine';
import type { Construction } from '../geometry/model';
import { decodeConstructionFromOoxml, PX_PER_CM, renderConstruction } from '../geometry/render';
import { encodeGeometryInit, OCR_IMAGE_KEY, type GeometryInit, type GeometryMessage } from '../shared/protocol';
import { shrinkPicture } from './picture';
import { readSelectedPicture } from './word';
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

/** Word names the pictures of MathStudio figures "MathStudio Figure n" (see figureRun). */
const FIGURE_PICTURE = /<wp:docPr [^>]*name="MathStudio Figure/;

interface FigureAt {
  /** What to replace when the figure is updated. */
  range: Word.Range;
  ooxml: string;
  /**
   * The picture was moved out of its content control (dragged elsewhere in Word): it is
   * still a MathStudio figure, recognised by its name; updating wraps it again.
   */
  loose: boolean;
}

/** The MathStudio figure at the cursor (in its content control, or its picture alone), or null. */
async function figureAt(ctx: Word.RequestContext): Promise<FigureAt | null> {
  const sel = ctx.document.getSelection();
  const cc = sel.parentContentControlOrNullObject;
  cc.load('tag');
  const pics = sel.inlinePictures;
  pics.load('items');
  await ctx.sync();
  if (!cc.isNullObject && isGeometryTag(cc.tag)) {
    const ooxml = cc.getOoxml();
    await ctx.sync();
    return { range: cc.getRange('Whole'), ooxml: ooxml.value, loose: false };
  }
  if (!pics.items.length) return null;
  const range = pics.items[0].getRange('Whole');
  const ooxml = range.getOoxml();
  await ctx.sync();
  return FIGURE_PICTURE.test(ooxml.value) ? { range, ooxml: ooxml.value, loose: true } : null;
}

/** The figure at the cursor: 'none', or its construction (null when it cannot be read). */
async function readSelectedFigure(): Promise<Construction | null | 'none'> {
  try {
    return await Word.run(async (ctx) => {
      const f = await figureAt(ctx);
      // the construction travels inside the SVG picture (base64 or, once saved by Word, XML)
      return f ? decodeConstructionFromOoxml(f.ooxml) : 'none';
    });
  } catch (e) {
    console.warn('MathStudio: could not read the figure', e);
    return 'none';
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

/** True when the cursor is inside a MathStudio figure, or its picture (even moved out of its control) is selected. */
export async function selectionIsFigure(): Promise<boolean> {
  try {
    return await Word.run(async (ctx) => !!(await figureAt(ctx)));
  } catch {
    return false;
  }
}

/** Inserts the figure at the selection, or replaces the selected figure. */
export async function insertFigure(c: Construction): Promise<void> {
  await Word.run(async (ctx) => {
    const sel = ctx.document.getSelection();
    const current = await figureAt(ctx);
    const all = ctx.document.contentControls;
    all.load('items/tag');
    await ctx.sync();
    const replacing = !!current;
    // a new figure with a caption: number it after the figures already in the document
    const n = c.caption && !replacing ? all.items.filter((x) => isGeometryTag(x.tag)).length + 1 : undefined;
    const pkg = await buildFigurePackage(c, n);
    sel.load('isEmpty');
    await ctx.sync();
    // a selected exercise stays: the figure goes in a new paragraph after it
    const target = current ? current.range : sel.isEmpty ? sel : sel.paragraphs.getLast().insertParagraph('', 'After').getRange('Start');
    const inserted = target.insertOoxml(pkg, 'Replace');
    await ctx.sync();
    inserted.getRange('After').select('Start');
    await ctx.sync();
    // the content control a moved picture left behind is empty now: remove it
    if (current?.loose) await removeEmptyFigureControls(ctx);
  });
}

/** Deletes MathStudio figure content controls that no longer hold a picture. */
async function removeEmptyFigureControls(ctx: Word.RequestContext): Promise<void> {
  const all = ctx.document.contentControls;
  all.load('items/tag');
  await ctx.sync();
  const figures = all.items.filter((cc) => isGeometryTag(cc.tag));
  const pics = figures.map((cc) => {
    const p = cc.inlinePictures;
    p.load('items');
    return p;
  });
  await ctx.sync();
  figures.forEach((cc, i) => {
    if (!pics[i].items.length) cc.delete(false);
  });
  await ctx.sync();
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

/**
 * Opens the geometry editor on the selected figure, or for a new one; inserts the result.
 * A plain picture selected in the document (a scanned or pasted figure) is read into a figure.
 */
export async function runGeometryEditor(): Promise<void> {
  const found = await readSelectedFigure();
  const existing = found === 'none' ? null : found;
  const picture = found === 'none' ? await readSelectedPicture() : null;
  const exercise = found === 'none' && !picture ? await readSelectedExercise() : '';
  if (picture) {
    try {
      localStorage.setItem(OCR_IMAGE_KEY, await shrinkPicture(picture));
    } catch (e) {
      console.warn('MathStudio: could not hand the picture to the editor', e);
    }
  }
  const init: GeometryInit = existing
    ? { construction: existing, mode: 'edit' }
    : found === null
      ? // a MathStudio figure whose data was lost (e.g. the picture was replaced): say so, keep editing possible
        { mode: 'edit', error: 'Không đọc được dữ liệu của hình này (có thể ảnh đã bị thay hoặc chỉnh trong Word). Bạn có thể vẽ lại; bấm Cập nhật sẽ thay hình cũ.' }
      : { mode: 'insert', ...(exercise ? { exercise } : {}), ...(picture ? { ocr: true } : {}) };
  try {
    await geometryLoop(init);
  } finally {
    if (picture) {
      try {
        localStorage.removeItem(OCR_IMAGE_KEY);
      } catch {
        /* storage unavailable */
      }
    }
  }
}

/** Opens the geometry editor on a figure read from a picture (a new figure to insert). */
export async function runGeometryEditorWith(construction: Construction): Promise<void> {
  await geometryLoop({ construction, mode: 'insert' });
}

/** Runs the editor until the figure is inserted or the user cancels. */
async function geometryLoop(init: GeometryInit): Promise<void> {
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
