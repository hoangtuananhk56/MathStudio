/** Messages between the page (client.ts) and the OCR worker (worker.ts). */
import type { FigureReading } from './figure-build';
import type { FormulaReading } from './formula-model';
import type { OcrLine } from './page-layout';
import type { PageParagraph } from './page';

/** RGBA pixels (an ImageData's fields; the buffer is transferred). */
export interface RawImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type WorkerRequest =
  | { type: 'init'; base: string }
  | { id: number; type: 'formula'; image: RawImage }
  | { id: number; type: 'page'; image: RawImage }
  | { id: number; type: 'figure'; image: RawImage }
  /** The text of a picture the worker asked for (see 'needText'). */
  | { type: 'text'; request: number; lines: OcrLine[] }
  /** The reading of a piece of a figure the worker asked for (see 'needGlyph'). */
  | { type: 'glyph'; request: number; text: string; confidence: number };

export type OcrStage = 'model' | 'text' | 'formulas' | 'figure';

export type WorkerReply =
  | { id: number; type: 'progress'; stage: OcrStage; fraction: number }
  | { id: number; type: 'formula'; reading: FormulaReading }
  | { id: number; type: 'page'; paragraphs: PageParagraph[] }
  | { id: number; type: 'figure'; reading: FigureReading }
  | { id: number; type: 'needText'; request: number; png: Blob }
  /** One piece of text of a figure: a line, or one capital letter (`letter`). */
  | { id: number; type: 'needGlyph'; request: number; png: Blob; letter: boolean }
  | { id: number; type: 'error'; message: string };
