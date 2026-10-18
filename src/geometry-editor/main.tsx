import { createRoot } from 'react-dom/client';
import '../editor/styles.css';
import '../editor/mathtype.css';
import './geo.css';
import { decodeGeometryInit, type GeometryInit, type GeometryMessage } from '../shared/protocol';
import { GeometryApp } from './GeometryApp';

const init: GeometryInit = decodeGeometryInit(new URLSearchParams(window.location.search).get('init')) ?? { mode: 'insert' };

function render(send: ((msg: GeometryMessage) => void) | null) {
  createRoot(document.getElementById('root')!).render(<GeometryApp init={init} send={send} />);
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
