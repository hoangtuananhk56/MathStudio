/** Ribbon button handlers (function commands). */
import { runConvert, runEditor, runRenumber, runToggleTex } from '../office/editor-dialog';
import { readSelectedEquation } from '../office/word';
import { runGeometryEditor, selectionIsFigure } from '../office/geometry';

function command(run: () => Promise<void>) {
  return async (event: Office.AddinCommands.Event) => {
    try {
      await run();
    } catch (e) {
      console.error('MathStudio:', e);
    } finally {
      event.completed();
    }
  };
}

const handlers: Record<string, (event: Office.AddinCommands.Event) => Promise<void>> = {
  insertInlineEquation: command(() => runEditor('inline')),
  insertDisplayEquation: command(() => runEditor('display')),
  insertRightNumberedEquation: command(() => runEditor('right')),
  insertLeftNumberedEquation: command(() => runEditor('left')),
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
