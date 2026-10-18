/// <reference lib="webworker" />
/**
 * OCR worker: picture preparation, page layout and the formula model (onnxruntime-web),
 * off the page's thread. Tesseract runs in its own worker, driven by the page (client.ts);
 * when a page is read, this worker asks the page for the text of the prepared picture.
 */
import * as ort from 'onnxruntime-web/wasm';
import { readFigure } from './figure';
import { FormulaModel } from './formula-model';
import { estimateSkew, formulaInput, level, rotate, toGray, type Gray, type Pixels } from './image';
import type { OcrLine } from './page-layout';
import { readPage } from './page';
import type { WorkerReply, WorkerRequest } from './worker-protocol';

declare const self: DedicatedWorkerGlobalScope;

const CACHE = 'mathstudio-ocr-v1';
let base = '';
let model: Promise<FormulaModel> | null = null;
const textRequests = new Map<number, (lines: OcrLine[]) => void>();
const glyphRequests = new Map<number, (r: { text: string; confidence: number }) => void>();
let nextText = 1;

const post = (msg: WorkerReply, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

/** A model file, from the cache when it was downloaded before. */
async function fetchFile(url: string, onBytes: (n: number, total: number) => void): Promise<Uint8Array> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {
    cache = null; // no Cache Storage (private mode, old webview): plain download
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const parts: Uint8Array[] = [];
  let n = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    n += value.length;
    onBytes(n, total);
  }
  const bytes = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  try {
    await cache?.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }));
  } catch {
    /* quota: fine, download again next time */
  }
  return bytes;
}

function loadModel(id: number): Promise<FormulaModel> {
  model ??= (async () => {
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    // the three files download together; progress is their total
    const sizes = [0, 0, 0];
    const done = [0, 0, 0];
    const report = (i: number) => (n: number, total: number) => {
      done[i] = n;
      sizes[i] = total;
      const all = sizes.reduce((a, b) => a + b, 0);
      if (all) post({ id, type: 'progress', stage: 'model', fraction: done.reduce((a, b) => a + b, 0) / all });
    };
    const [encoder, decoder, vocab] = await Promise.all([
      fetchFile(`${base}mfr/encoder.int8.onnx`, report(0)),
      fetchFile(`${base}mfr/decoder.int8.onnx`, report(1)),
      fetchFile(`${base}mfr/vocab.json`, report(2)),
    ]);
    post({ id, type: 'progress', stage: 'model', fraction: 1 });
    return FormulaModel.create(ort, { encoder, decoder, vocab: JSON.parse(new TextDecoder().decode(vocab)) as string[] });
  })();
  model.catch(() => (model = null)); // a failed download can be retried
  return model;
}

/** A photographed formula is often a little tilted: straighten it first. */
function straighten(g: Gray): Gray {
  const skew = estimateSkew(level(g));
  return Math.abs(skew) >= 0.4 ? rotate(g, -skew) : g;
}

async function pngOf(g: Gray): Promise<Blob> {
  const canvas = new OffscreenCanvas(g.width, g.height);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(g.width, g.height);
  for (let i = 0; i < g.data.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g.data[i];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

async function handle(msg: WorkerRequest): Promise<void> {
  switch (msg.type) {
    case 'init':
      base = msg.base;
      return;
    case 'text':
      textRequests.get(msg.request)?.(msg.lines);
      textRequests.delete(msg.request);
      return;
    case 'glyph':
      glyphRequests.get(msg.request)?.({ text: msg.text, confidence: msg.confidence });
      glyphRequests.delete(msg.request);
      return;
    case 'figure': {
      const m = await loadModel(msg.id);
      const reading = await readFigure(msg.image, {
        readText: async (piece, letter = false) => {
          const request = nextText++;
          const png = await pngOf(piece);
          return new Promise((resolve) => {
            glyphRequests.set(request, resolve);
            post({ id: msg.id, type: 'needGlyph', request, png, letter });
          });
        },
        readName: async (piece, margin) => {
          const input = formulaInput(piece, undefined, margin);
          if (!input) return { latex: '', confidence: 0 };
          const r = await m.read(input, 10);
          return { latex: r.latex, confidence: r.confidence };
        },
        progress: (fraction) => post({ id: msg.id, type: 'progress', stage: 'figure', fraction }),
      });
      post({ id: msg.id, type: 'figure', reading });
      return;
    }
    case 'formula': {
      const m = await loadModel(msg.id);
      post({ id: msg.id, type: 'progress', stage: 'formulas', fraction: 0 });
      const input = formulaInput(straighten(toGray(msg.image as Pixels)));
      if (!input) throw new Error('empty');
      post({ id: msg.id, type: 'formula', reading: await m.read(input) });
      return;
    }
    case 'page': {
      const m = await loadModel(msg.id);
      const paragraphs = await readPage(toGray(msg.image as Pixels), {
        readText: async (page) => {
          const request = nextText++;
          const png = await pngOf(page);
          return new Promise<OcrLine[]>((resolve) => {
            textRequests.set(request, resolve);
            post({ id: msg.id, type: 'needText', request, png });
          });
        },
        readFormula: async (page, region) => {
          const input = formulaInput(page, region);
          return input ? m.read(input) : { latex: '', raw: '', confidence: 0 };
        },
        progress: (fraction) => post({ id: msg.id, type: 'progress', stage: 'formulas', fraction }),
      });
      post({ id: msg.id, type: 'page', paragraphs });
      return;
    }
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  handle(msg).catch((err: unknown) => {
    if ('id' in msg) post({ id: msg.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  });
};
