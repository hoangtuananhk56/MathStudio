/**
 * Ribbon button handlers (function commands). Registered by the task pane page, which is
 * the add-in's shared, long-lived runtime where Word supports one (see manifest <Runtimes>),
 * and by the commands page, the function file of older manifests.
 */
import { runConvert, runEditor, runFromPicture, runRenumber, runToggleTex } from '../office/editor-dialog';
import { readSelectedEquation } from '../office/word';
import { runGeometryEditor, selectionIsFigure } from '../office/geometry';

/**
 * Office stops a command's runtime 5 minutes after the click unless the command has said it
 * is done: an editor left open longer could no longer insert its result. In the shared
 * runtime (it stays alive) the command says so at once and the dialog lives on; elsewhere it
 * can only say so when the dialog closes.
 */
const sharedRuntime = () => {
  try {
    return Office.context.requirements.isSetSupported('SharedRuntime', '1.1');
  } catch {
    return false;
  }
};

/** A dialog is open: a second click (or double-click) waits for it instead of failing. */
let busy = false;

function command(run: () => Promise<void>) {
  return async (event: Office.AddinCommands.Event) => {
    const early = sharedRuntime();
    if (early) event.completed();
    if (busy) {
      if (!early) event.completed();
      return;
    }
    busy = true;
    try {
      await run();
    } catch (e) {
      console.error('MathStudio:', e);
    } finally {
      busy = false;
      if (!early) event.completed();
    }
  };
}

const handlers: Record<string, (event: Office.AddinCommands.Event) => Promise<void>> = {
  insertInlineEquation: command(() => runEditor('inline')),
  insertDisplayEquation: command(() => runEditor('display')),
  insertRightNumberedEquation: command(() => runEditor('right')),
  insertLeftNumberedEquation: command(() => runEditor('left')),
  insertFromPicture: command(runFromPicture),
  // "Edit" works on whatever is selected: a figure opens the geometry editor.
  // Editing is one gesture for both kinds (double-click, Ctrl+Alt+E, either Edit button):
  // the object at the cursor decides which editor opens.
  editEquation: command(async () => ((await selectionIsFigure()) ? runGeometryEditor() : runEditor('inline'))),
  insertGeometry: command(runGeometryEditor),
  editGeometry: command(async () => ((await selectionIsFigure()) || (await readSelectedEquation()).source === 'none' ? runGeometryEditor() : runEditor('inline'))),
  toggleTex: command(runToggleTex),
  updateEquationNumbers: command(runRenumber),
  convertEquation: command(runConvert),
};

Office.onReady(() => {
  for (const [name, fn] of Object.entries(handlers)) {
    Office.actions.associate(name, fn);
  }
});

// Older Office builds look function commands up on the global object.
Object.assign(globalThis, handlers);
