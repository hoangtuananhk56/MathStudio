/** Tesseract.js results → the lines and words used by the page layout. */
import type { OcrLine } from './page-layout';

interface TBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface TWord {
  text: string;
  confidence: number;
  bbox: TBox;
}
interface TLine {
  words: TWord[];
  bbox: TBox;
}
interface TParagraph {
  lines: TLine[];
}
interface TBlock {
  paragraphs: TParagraph[];
}

/** Lines in reading order, scaled back to page pixels when the page was enlarged for Tesseract. */
export function linesFromTesseract(blocks: TBlock[] | null | undefined, scale = 1): OcrLine[] {
  const s = (b: TBox) => ({ x0: b.x0 / scale, y0: b.y0 / scale, x1: b.x1 / scale, y1: b.y1 / scale });
  const out: OcrLine[] = [];
  let paragraph = 0;
  for (const b of blocks ?? [])
    for (const p of b.paragraphs) {
      for (const l of p.lines) out.push({ paragraph, bbox: s(l.bbox), words: l.words.map((w) => ({ text: w.text, confidence: w.confidence, bbox: s(w.bbox) })) });
      paragraph++;
    }
  return out;
}
