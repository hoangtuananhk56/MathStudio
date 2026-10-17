/** Messages exchanged between the ribbon/taskpane runtime and the editor dialog. */
import type { Layout, RenderKind } from '../core/ooxml';

export interface EditorInit {
  latex: string;
  layout: Layout;
  /** Rendering of the equation being edited; undefined = use the user's default. */
  kind?: RenderKind;
  mode: 'insert' | 'edit';
  /** Shown when reopening the editor after a failed insertion. */
  error?: string;
}

export interface InsertMessage {
  type: 'insert';
  latex: string;
  layout: Layout;
  kind: RenderKind;
  fontId: string;
  sizePt?: number;
}

export type DialogMessage = InsertMessage | { type: 'cancel' };

export function encodeInit(init: EditorInit): string {
  const bytes = new TextEncoder().encode(JSON.stringify(init));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeInit(s: string | null): EditorInit | null {
  if (!s) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as EditorInit;
  } catch {
    return null;
  }
}
