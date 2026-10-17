import { createRoot } from 'react-dom/client';
import 'mathlive/static.css';
import 'mathlive/fonts.css';
import './math-fonts.css';
import './styles.css';
import './mathtype.css';
import { decodeInit, type DialogMessage, type EditorInit } from '../shared/protocol';
import { App } from './App';

const init: EditorInit = decodeInit(new URLSearchParams(window.location.search).get('init')) ?? {
  latex: '',
  layout: 'inline',
  mode: 'insert',
};

function render(send: ((msg: DialogMessage) => void) | null) {
  createRoot(document.getElementById('root')!).render(<App init={init} send={send} />);
}

// Outside Office (plain browser preview) Office.onReady may never resolve, so don't wait forever.
const officeReady =
  typeof Office === 'undefined'
    ? Promise.resolve()
    : Promise.race([Office.onReady().catch(() => undefined), new Promise((r) => setTimeout(r, 2000))]);

officeReady.then(() => {
  const inDialog = typeof Office !== 'undefined' && !!Office.context?.ui?.messageParent;
  render(inDialog ? (msg) => Office.context.ui.messageParent(JSON.stringify(msg)) : null);
});
