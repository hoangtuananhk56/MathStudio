/**
 * Reading a geometry figure from a picture: text first (names, measures), then the
 * strokes without it, then the construction. The text recogniser is passed in, so the
 * same code runs in the add-in (Tesseract on the page's thread) and in tests.
 */
import { buildFigure, type FigureReading } from './figure-build';
import { classifyText, joinMeasures, nameFromLatex, unitText, type FigureText } from './figure-text';
import { findGlyphs, inkMask, looksLikeDrawing, seeStrokes, strokeWidth } from './figure-vision';
import { resize, toGray, type Gray, type Rect } from './image';
import type { Glyph } from './figure-vision';

export type { FigureReading };

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface FigureEngines {
  /**
   * Reads a small picture of one line of text ("30 m", "Lối đi"); with `letter`, one capital
   * letter only. Confidence 0…100.
   */
  readText(picture: Gray, letter?: boolean): Promise<{ text: string; confidence: number }>;
  /**
   * Reads one point's name ("A", "B′", "M₁") as LaTeX: the formula model reads italic
   * capitals far better than a text recogniser; `margin` is the white space around it in the
   * model's square (see formulaInput); confidence 0…1.
   */
  readName(picture: Gray, margin: number): Promise<{ latex: string; confidence: number }>;
  progress?(fraction: number): void;
}

export class NotAFigureError extends Error {
  constructor() {
    super('not a figure');
  }
}

/** Bilinear rescale of RGBA pixels. */
function scaleRgba(img: RgbaImage, k: number): RgbaImage {
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, (x + 0.5) / k - 0.5);
      const sy = Math.min(img.height - 1, (y + 0.5) / k - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const y1 = Math.min(img.height - 1, y0 + 1);
      const fx = Math.max(0, sx - x0);
      const fy = Math.max(0, sy - y0);
      for (let c = 0; c < 4; c++) {
        const v =
          (img.data[(y0 * img.width + x0) * 4 + c] * (1 - fx) + img.data[(y0 * img.width + x1) * 4 + c] * fx) * (1 - fy) +
          (img.data[(y1 * img.width + x0) * 4 + c] * (1 - fx) + img.data[(y1 * img.width + x1) * 4 + c] * fx) * fy;
        out[(y * w + x) * 4 + c] = v;
      }
    }
  return { width: w, height: h, data: out };
}

/** Transparent pixels are paper. */
function onWhite(img: RgbaImage): RgbaImage {
  const d = new Uint8ClampedArray(img.data);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    d[i] = d[i] * a + 255 * (1 - a);
    d[i + 1] = d[i + 1] * a + 255 * (1 - a);
    d[i + 2] = d[i + 2] * a + 255 * (1 - a);
    d[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data: d };
}

/**
 * The glyph alone on white (its pixels and their soft edges), with a margin: neighbours
 * (a vertex dot, the end of a line) would confuse the reading.
 */
function glyphPicture(gray: Gray, g: Glyph): Gray {
  const pad = Math.round(g.box.h * 0.35);
  const w = g.box.w + 2 * pad;
  const h = g.box.h + 2 * pad;
  const near = new Uint8Array(w * h);
  for (const i of g.pixels) {
    const x = (i % gray.width) - g.box.x + pad;
    const y = Math.floor(i / gray.width) - g.box.y + pad;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) near[yy * w + xx] = 1;
      }
  }
  const out = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!near[y * w + x]) continue;
      const gx = x + g.box.x - pad;
      const gy = y + g.box.y - pad;
      if (gx >= 0 && gy >= 0 && gx < gray.width && gy < gray.height) out[y * w + x] = gray.data[gy * gray.width + gx];
    }
  return { width: w, height: h, data: out };
}

export async function readFigure(picture: RgbaImage, engines: FigureEngines): Promise<FigureReading> {
  let img = onWhite(picture);
  if (!looksLikeDrawing(img)) throw new NotAFigureError();
  // a working size: small pictures are enlarged (letters become readable), big ones reduced
  const long = Math.max(img.width, img.height);
  if (long < 700) img = scaleRgba(img, Math.min(3, 900 / long));
  else if (long > 1600) img = scaleRgba(img, 1400 / long);
  const gray = toGray(img);
  const { width: W, height: H } = gray;

  const ink = inkMask(img, gray);
  const pen = strokeWidth(ink, W, H);
  const found = findGlyphs(ink, W, H, pen);
  const texts: FigureText[] = [];
  const erase: number[] = [];
  const unread: Rect[] = [];
  let done = 0;
  for (const g of found.glyphs) {
    engines.progress?.(done++ / Math.max(1, found.glyphs.length));
    let piece = glyphPicture(gray, g);
    const k = Math.max(1, 48 / g.box.h);
    if (k > 1) piece = resize(piece, Math.round(piece.width * k), Math.round(piece.height * k));
    // one character: a point's name (or a digit, "?")
    const oneChar = g.pieces <= 3 && g.box.w <= g.box.h * 1.5;
    let t: FigureText | null = null;
    let line: { text: string; confidence: number } | null = null;
    if (oneChar) {
      // the text recogniser is quick and sure of upright capitals (it misreads italic ones as digits)
      line = await engines.readText(piece);
      const quick = line.text.trim();
      if (/^[A-Z]['′]?$/.test(quick) && line.confidence >= 80) t = classifyText(quick, line.confidence, g.box);
    }
    if (oneChar && !t) {
      // read small in the square first, then larger (the model's best size varies by letter)
      for (const margin of [1.5, 0.75]) {
        const r = await engines.readName(piece, margin);
        t = r.confidence >= 0.5 ? nameFromLatex(r.latex, Math.round(r.confidence * 100), g.box) : null;
        if (t) break;
      }
    }
    if (!t) {
      const r = line ?? (await engines.readText(piece));
      t = classifyText(r.text, r.confidence, g.box) ?? unitText(r.text, r.confidence, g.box);
      // one blob read as a whole word is a misreading
      if (t && oneChar && t.kind === 'word') t = null;
    }
    // a digit by a vertex may be an italic capital: keep the letter it could be
    if (oneChar && t?.kind === 'number' && t.text.length === 1) {
      const l = await engines.readText(piece, true);
      if (/^[A-Z]$/.test(l.text.trim())) t.alt = l.text.trim();
    }
    if (t) {
      texts.push(t);
      erase.push(...g.pixels);
    } else {
      // an unread letter-sized blob that is not a dash: leave it out of the drawing too
      const long = Math.max(g.box.w, g.box.h) / Math.max(1, Math.min(g.box.w, g.box.h));
      const thin = g.pixels.length <= 1.8 * Math.max(g.box.w, g.box.h) * pen;
      if (!thin || long < 2.5) {
        erase.push(...g.pixels);
        unread.push(g.box);
      }
    }
  }
  engines.progress?.(1);
  const strokes = seeStrokes(img, gray, { erase });
  return buildFigure({ width: W, height: H, rgba: img.data, strokes, texts: joinMeasures(texts), dots: found.dots, unread });
}
