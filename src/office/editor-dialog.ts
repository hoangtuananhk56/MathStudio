/** Opens the equation editor in an Office dialog and applies its result to the document. */
import type { Layout } from '../core/ooxml';
import { encodeInit, type DialogMessage, type EditorInit } from '../shared/protocol';
import { loadSettings } from '../shared/settings';
import { convertSelectedEquation, insertEquation, readSelectedEquation, renumberEquations, toggleTex, type EquationStyle } from './word';

const EDITOR_URL = new URL('../editor/index.html', window.location.href).href;

function showDialog(init: EditorInit): Promise<DialogMessage> {
  return new Promise((resolve, reject) => {
    const url = `${EDITOR_URL}?init=${encodeInit(init)}`;
    Office.context.ui.displayDialogAsync(url, { height: 86, width: 70, displayInIframe: true }, (res) => {
      if (res.status !== Office.AsyncResultStatus.Succeeded) {
        reject(new Error(res.error.message));
        return;
      }
      const dialog = res.value;
      dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
        dialog.close();
        try {
          resolve(JSON.parse((arg as { message: string }).message) as DialogMessage);
        } catch {
          resolve({ type: 'cancel' });
        }
      });
      // Closed with the window's X button (or navigation error).
      dialog.addEventHandler(Office.EventType.DialogEventReceived, () => resolve({ type: 'cancel' }));
    });
  });
}

/** Runs the editor until the equation is inserted or the user cancels. */
async function editLoop(init: EditorInit): Promise<void> {
  // Loop so a failed insertion reopens the editor with the user's work intact.
  for (;;) {
    const msg = await showDialog(init);
    if (msg.type !== 'insert') return;
    try {
      await insertEquation(msg.latex, { layout: msg.layout, kind: msg.kind, fontId: msg.fontId, sizePt: msg.sizePt });
      return;
    } catch (e) {
      init = { ...init, latex: msg.latex, layout: msg.layout, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

/**
 * Edits the selected equation, or inserts a new one.
 * @param layout layout for a *new* equation; an existing one keeps its own.
 */
export async function runEditor(layout: Layout): Promise<void> {
  const selected = await readSelectedEquation();
  await editLoop({
    latex: selected.latex,
    layout: selected.source === 'none' ? layout : selected.layout,
    kind: selected.source === 'none' ? undefined : selected.kind,
    mode: selected.source === 'none' ? 'insert' : 'edit',
  });
}

function savedStyle(): EquationStyle {
  const s = loadSettings();
  return { fontId: s.fontId, sizePt: s.sizePt || undefined, kind: s.kind };
}

/** Toggle TeX; if the selected TeX is invalid, open the editor on it so the user can fix it. */
export async function runToggleTex(): Promise<void> {
  try {
    await toggleTex(savedStyle());
  } catch (e) {
    const latex = await Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      sel.load('text');
      await ctx.sync();
      return sel.text.replace(/^\s*\$+|\$+\s*$/g, '');
    });
    await editLoop({ latex, layout: 'inline', mode: 'insert', error: e instanceof Error ? e.message : String(e) });
  }
}

export async function runRenumber(): Promise<void> {
  await renumberEquations(savedStyle());
}

/** Switches the selected equation between picture and native Word equation. */
export async function runConvert(): Promise<void> {
  await convertSelectedEquation(savedStyle());
}
