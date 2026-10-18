/**
 * Recognising formulas and exercises in pictures, offline: the OCR worker (formula model)
 * and Tesseract (Vietnamese text) are started on first use and kept for the session.
 * Models, WebAssembly and language data are served by the add-in itself (public/ocr).
 */
import type { Worker as TesseractWorker } from 'tesseract.js';
import type { FigureReading } from './figure-build';
import type { FormulaReading } from './formula-model';
import type { PageParagraph } from './page';
import { linesFromTesseract } from './tesseract-lines';
import type { OcrStage, RawImage, WorkerReply, WorkerRequest } from './worker-protocol';

export type { FigureReading, FormulaReading, PageParagraph, OcrStage };

/** The picture is a photograph, not a drawing: there is no figure to read in it. */
export const NOT_A_FIGURE = 'not a figure';

export type ProgressFn = (stage: OcrStage, fraction: number) => void;

const BASE = new URL('../ocr/', window.location.href).href;

let worker: Worker | null = null;
let tesseract: Promise<TesseractWorker> | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: WorkerReply) => void; reject: (e: Error) => void; progress?: ProgressFn }>();

/** False in old Office webviews (Internet Explorer, old Edge): no OCR there. */
export function ocrSupported(): boolean {
  return typeof WebAssembly === 'object' && typeof Worker === 'function' && typeof OffscreenCanvas === 'function';
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<WorkerReply>) => {
    const msg = e.data;
    const job = pending.get(msg.id);
    if (!job) return;
    if (msg.type === 'progress') job.progress?.(msg.stage, msg.fraction);
    else if (msg.type === 'needText') {
      job.progress?.('text', 0);
      readText(msg.png, (f) => job.progress?.('text', f)).then(
        (lines) => w.postMessage({ type: 'text', request: msg.request, lines } satisfies WorkerRequest),
        (err: unknown) => {
          pending.delete(msg.id);
          job.reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    } else if (msg.type === 'needGlyph') {
      readGlyph(msg.png, msg.letter).then(
        (r) => w.postMessage({ type: 'glyph', request: msg.request, ...r } satisfies WorkerRequest),
        (err: unknown) => {
          pending.delete(msg.id);
          job.reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    } else {
      pending.delete(msg.id);
      if (msg.type === 'error') job.reject(new Error(msg.message));
      else job.resolve(msg);
    }
  };
  w.onerror = (e) => {
    for (const job of pending.values()) job.reject(new Error(e.message || 'OCR worker failed'));
    pending.clear();
    worker = null;
  };
  w.postMessage({ type: 'init', base: BASE } satisfies WorkerRequest);
  worker = w;
  return w;
}

function run(type: 'formula' | 'page' | 'figure', image: RawImage, progress?: ProgressFn): Promise<WorkerReply> {
  const id = nextId++;
  // copy: the buffer is handed over to the worker
  const data = new Uint8ClampedArray(image.data);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, progress });
    getWorker().postMessage({ id, type, image: { width: image.width, height: image.height, data } } satisfies WorkerRequest, [data.buffer]);
  });
}

async function getTesseract(progress: (f: number) => void): Promise<TesseractWorker> {
  tesseract ??= (async () => {
    const { createWorker, OEM } = await import('tesseract.js');
    return createWorker('vie', OEM.LSTM_ONLY, {
      workerPath: `${BASE}tesseract/worker.min.js`,
      corePath: `${BASE}tesseract/`,
      langPath: `${BASE}tesseract/lang`,
      workerBlobURL: false,
      gzip: true,
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') progress(m.progress);
      },
    });
  })();
  tesseract.catch(() => (tesseract = null));
  return tesseract;
}

let textProgress: (f: number) => void = () => {};

/** Tesseract's page segmentation and alphabet: a page, one line, or one capital letter. */
type TextMode = 'page' | 'line' | 'letter';
let mode: TextMode | null = null;
async function setMode(t: TesseractWorker, m: TextMode) {
  if (mode === m) return;
  const { PSM } = await import('tesseract.js');
  await t.setParameters({
    tessedit_pageseg_mode: m === 'page' ? PSM.AUTO : m === 'line' ? PSM.SINGLE_LINE : PSM.SINGLE_CHAR,
    tessedit_char_whitelist: m === 'letter' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '',
  });
  mode = m;
}

async function readText(png: Blob, progress: (f: number) => void) {
  textProgress = progress;
  const t = await getTesseract((f) => textProgress(f));
  await setMode(t, 'page');
  const r = await t.recognize(png, {}, { blocks: true });
  return linesFromTesseract(r.data.blocks as Parameters<typeof linesFromTesseract>[0]);
}

async function readGlyph(png: Blob, letter: boolean): Promise<{ text: string; confidence: number }> {
  textProgress = () => {};
  const t = await getTesseract((f) => textProgress(f));
  await setMode(t, letter ? 'letter' : 'line');
  const r = await t.recognize(png);
  return { text: r.data.text, confidence: r.data.confidence };
}

/** Reads one formula (the whole picture). */
export async function recognizeFormula(image: RawImage, progress?: ProgressFn): Promise<FormulaReading> {
  const r = await run('formula', image, progress);
  if (r.type !== 'formula') throw new Error('unexpected reply');
  return r.reading;
}

/** Reads an exercise: paragraphs of Vietnamese text with inline and display formulas. */
export async function recognizePage(image: RawImage, progress?: ProgressFn): Promise<PageParagraph[]> {
  const r = await run('page', image, progress);
  if (r.type !== 'page') throw new Error('unexpected reply');
  return r.paragraphs;
}

/**
 * Reads a geometry figure (a drawing: lines, names, measures) into a construction.
 * Rejects with NOT_A_FIGURE for a photograph.
 */
export async function recognizeFigure(image: RawImage, progress?: ProgressFn): Promise<FigureReading> {
  const r = await run('figure', image, progress);
  if (r.type !== 'figure') throw new Error('unexpected reply');
  return r.reading;
}
