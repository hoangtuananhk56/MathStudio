/** Ribbon button handlers (function commands). */
import { runConvert, runEditor, runRenumber, runToggleTex } from '../office/editor-dialog';

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
  editEquation: command(() => runEditor('inline')),
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
