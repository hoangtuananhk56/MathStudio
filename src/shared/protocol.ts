/** Messages exchanged between the ribbon/taskpane runtime and the editor dialog. */
import type { Layout, RenderKind } from '../core/ooxml';
import type { PageParagraphSource } from '../core/page-ooxml';
import type { Construction } from '../geometry/model';

export interface EditorInit {
  latex: string;
  layout: Layout;
  /** Rendering of the equation being edited; undefined = use the user's default. */
  kind?: RenderKind;
  mode: 'insert' | 'edit';
  /** Shown when reopening the editor after a failed insertion. */
  error?: string;
  /** Open the "from a picture" panel at start (a picture selected in Word is in localStorage, see OCR_IMAGE_KEY). */
  ocr?: boolean;
}

/** localStorage key through which the ribbon hands the selected picture to the editor dialog. */
export const OCR_IMAGE_KEY = 'mathstudio.ocrImage';

export interface InsertMessage {
  type: 'insert';
  latex: string;
  layout: Layout;
  kind: RenderKind;
  fontId: string;
  sizePt?: number;
}

/** An exercise read from a picture: paragraphs of text and formulas, inserted as they are. */
export interface InsertPageMessage {
  type: 'insertPage';
  paragraphs: PageParagraphSource[];
  fontId: string;
  sizePt?: number;
}

/** A figure read from a picture in the equation editor: continue in the figure editor. */
export interface OpenFigureMessage {
  type: 'openFigure';
  construction: Construction;
}

export type DialogMessage = InsertMessage | InsertPageMessage | OpenFigureMessage | { type: 'cancel' };

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

/* ------------------------------ geometry dialog ----------------------------- */


export interface GeometryInit {
  /** Figure being edited; undefined for a new figure. */
  construction?: Construction;
  mode: 'insert' | 'edit';
  error?: string;
  /** Text of an exercise selected in the document: opens "type the exercise" with it. */
  exercise?: string;
  /** Open "from a picture" at start (a picture selected in Word is in localStorage, see OCR_IMAGE_KEY). */
  ocr?: boolean;
}

export type GeometryMessage = { type: 'insertGeometry'; construction: Construction } | { type: 'cancel' };

export function encodeGeometryInit(init: GeometryInit): string {
  return encodeInit(init as unknown as EditorInit);
}

export function decodeGeometryInit(s: string | null): GeometryInit | null {
  return decodeInit(s) as unknown as GeometryInit | null;
}
