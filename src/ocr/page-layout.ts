/**
 * Where the formulas are on a page of text. The text recogniser (Tesseract) reads the
 * Vietnamese words well and garbles formulas, so its words are sorted out:
 *
 *  - text words (Vietnamese words read with confidence) stay text;
 *  - "seeds" are what a formula leaves behind: words read with little confidence, odd
 *    symbols ("^", "ƒ", "#"…), "x2" (a power or an index), ink much taller than the line
 *    (fractions, roots, integrals), or fragments of a fraction read as a line of their own;
 *  - a formula is grown from its seeds over names, numbers and operators ("A = …");
 *  - lines with no text at all are display formulas (joined when they belong together).
 *
 * Every formula becomes a rectangle of the page that the formula model reads.
 */
import { inkBox, type Gray, type Rect } from './image';

export interface OcrWord {
  text: string;
  /** 0…100 */
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLine {
  words: OcrWord[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** Index of the paragraph the line belongs to (in reading order). */
  paragraph: number;
}

export type PlanItem = { kind: 'text'; text: string } | { kind: 'formula'; region: Rect; display: boolean; guess: string };

export interface PlanParagraph {
  items: PlanItem[];
}

type Role = 'text' | 'neutral' | 'connector' | 'seed';

/** sin x, cosA, log2… and the d of integrals. */
const MATH_WORDS = /^(sin|cos|tan|tg|cot|cotg|log|ln|lg|lim|max|min|exp)([A-Z(\d]|$)|^(dx|dy|dt)$/;
const ODD = /[\^\\√∫∑∏≤≥≠±×÷∞∈∉⊂⊃∪∩→⇒⇔ˆ°¬„ƒ_{}|#*~@$%¿¡«»“”§¢£¥©®™µ¶]/;
const CONNECTOR = /^[=+\-−—–<>≤≥·•.,:;()[\]]+$/;
const RELATION = /^[=<>≤≥≠]$/;
const VI_LETTERS = 'a-zàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ';
/** A word of Vietnamese: its letters, with a vowel. */
const VI_WORD = new RegExp(`^(?=.*[aăâeêioôơuưyàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ])[${VI_LETTERS}]{2,}$`, 'i');
const LETTER_OUTSIDE_VI = new RegExp(`[^${VI_LETTERS}\\d\\s\\p{P}\\p{S}]`, 'iu');
const UNITS = /^(mm|cm|dm|m|km|g|kg|ml|l|s|h|ha)$/;

function core(word: string): string {
  return word.replace(/^[(“"']+/, '').replace(/[)”"'.,:;!?…]+$/, '');
}

function roleOf(w: OcrWord): Role {
  const t = w.text.trim();
  const c = core(t);
  if (!t) return 'connector';
  if (ODD.test(t) || LETTER_OUTSIDE_VI.test(t)) return 'seed';
  if (/^[A-Za-z]\d{1,2}$/.test(c)) return 'seed'; // x2: x², x₂
  if (MATH_WORDS.test(c)) return 'seed';
  if (CONNECTOR.test(t)) return w.confidence < 50 ? 'seed' : 'connector';
  // a Vietnamese word (a misread one too: "Duiong" is still prose)
  if (VI_WORD.test(c) && c !== c.toUpperCase() && w.confidence >= (c.length >= 3 ? 45 : 70)) return 'text';
  if (w.confidence < 60) return 'seed';
  return 'neutral'; // names (ABC), single letters, numbers, units
}

/** "y = mx + 2": a relation between lower-case variables is a formula; "AB = 3 cm" stays text. */
function relationOfVariables(run: Token[]): boolean {
  return run.some((t) => RELATION.test(t.word.text)) && run.some((t) => t.role === 'neutral' && /^[a-z]{1,3}$/.test(core(t.word.text)) && !UNITS.test(core(t.word.text)));
}

const height = (b: { y0: number; y1: number }) => b.y1 - b.y0;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

interface Token {
  word: OcrWord;
  role: Role;
}

interface MainLine {
  line: OcrLine;
  tokens: Token[];
  /** Vertical band of the line's text (top of capitals to bottom of descenders). */
  top: number;
  bottom: number;
  /** Band its formulas may occupy (fractions reach above and below the text). */
  bandTop: number;
  bandBottom: number;
  /** How far a formula's ink may continue: up to the neighbouring text lines. */
  reachTop: number;
  reachBottom: number;
}

/** Vertical extent of the ink between x0 and x1, within [top, bottom]. */
function inkSpan(ink: Gray, x0: number, x1: number, top: number, bottom: number): { y0: number; y1: number } | null {
  const r = inkBox(ink, 160, { x: x0, y: top, w: x1 - x0, h: bottom - top });
  return r ? { y0: r.y, y1: r.y + r.h } : null;
}

/**
 * True when there is a fraction bar between x0 and x1: a horizontal stroke with separate
 * ink above it and below it (white rows in between), as in a/3.
 */
export function hasFractionBar(ink: Gray, x0: number, x1: number, top: number, bottom: number, minLen: number): boolean {
  const { width: W, data } = ink;
  const xa = Math.max(0, Math.floor(x0));
  const xb = Math.min(W, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(top));
  const yb = Math.min(ink.height, Math.ceil(bottom));
  const dark = (x: number, y: number) => data[y * W + x] < 140;
  const rowInk = (y: number, a: number, b: number) => {
    for (let x = a; x < b; x++) if (dark(x, y)) return true;
    return false;
  };
  for (let y = ya; y < yb; y++) {
    // longest run of ink on this row
    let best = 0;
    let bestEnd = 0;
    let run = 0;
    for (let x = xa; x < xb; x++) {
      run = dark(x, y) ? run + 1 : 0;
      if (run > best) {
        best = run;
        bestEnd = x + 1;
      }
    }
    if (best < minLen) continue;
    const a = bestEnd - best;
    // the bar is thin
    let yEnd = y;
    while (yEnd + 1 < yb && rowInk(yEnd + 1, a, bestEnd) && countInk(yEnd + 1) > 0.7 * best) yEnd++;
    if (yEnd - y > Math.max(2, minLen / 4)) {
      y = yEnd;
      continue;
    }
    // a fully white row just above and just below the bar (the ink does not pass through it),
    // then ink above and below (numerator and denominator)
    const reach = Math.round(minLen * 1.5);
    const whiteBelow = firstWhite(yEnd + 1, 1, 4);
    const whiteAbove = firstWhite(y - 1, -1, 4);
    if (whiteBelow !== null && whiteAbove !== null) {
      // numerator and denominator are characters, several rows tall (not the other bar of "=")
      const inkRows = (from: number, step: number) => {
        let n = 0;
        let seen = false;
        for (let k = 0, yy = from; k < reach && yy >= ya && yy < yb; k++, yy += step) {
          const has = rowInk(yy, a, bestEnd);
          if (has) n++;
          else if (seen && n) break;
          seen ||= has;
        }
        return n;
      };
      const minRows = Math.max(3, Math.round(minLen / 2));
      if (inkRows(whiteBelow + 1, 1) >= minRows && inkRows(whiteAbove - 1, -1) >= minRows) return true;
    }
    y = yEnd;

    function countInk(yy: number): number {
      let n = 0;
      for (let x = a; x < bestEnd; x++) if (dark(x, yy)) n++;
      return n;
    }
    function firstWhite(from: number, step: number, max: number): number | null {
      for (let k = 0, yy = from; k < max && yy >= ya && yy < yb; k++, yy += step) if (!rowInk(yy, a, bestEnd)) return yy;
      return null;
    }
  }
  return false;
}

/** Plans the reading of a page: text, inline formulas and display formulas, by paragraph. */
export function planPage(lines: OcrLine[], ink: Gray): PlanParagraph[] {
  if (!lines.length) return [];
  const rowH = median(lines.map((l) => height(l.bbox))) || 20;

  // 1. text lines vs. lines with no text (display formulas, or pieces of fractions)
  const classified = lines.map((line) => {
    const tokens = line.words.filter((w) => w.text.trim()).map((word) => ({ word, role: roleOf(word) }));
    const text = tokens.filter((t) => t.role === 'text').length;
    const seeds = tokens.filter((t) => t.role === 'seed').length;
    // one stray "word" in a line of formula pieces does not make it a text line
    return { line, tokens, hasText: text >= 2 || (text === 1 && seeds <= 1) };
  });
  const main: MainLine[] = [];
  const loose: typeof classified = [];
  for (const c of classified) {
    if (c.hasText) main.push({ line: c.line, tokens: c.tokens, top: c.line.bbox.y0, bottom: c.line.bbox.y1, bandTop: 0, bandBottom: 0, reachTop: 0, reachBottom: 0 });
    else loose.push(c);
  }
  // how far up and down a line's formulas may reach: not past half-way to the next text line
  const overlapX = (a: OcrLine['bbox'], b: OcrLine['bbox']) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0;
  for (const m of main) {
    m.bandTop = m.top - 0.6 * rowH;
    m.bandBottom = m.bottom + 0.6 * rowH;
    m.reachTop = m.top - 2 * rowH;
    m.reachBottom = m.bottom + 2 * rowH;
    for (const o of main) {
      if (o === m || !overlapX(o.line.bbox, m.line.bbox)) continue;
      const oMid = (o.top + o.bottom) / 2;
      if (oMid < m.top) {
        m.bandTop = Math.max(m.bandTop, (o.bottom + m.top) / 2);
        m.reachTop = Math.max(m.reachTop, o.bottom);
      } else if (oMid > m.bottom) {
        m.bandBottom = Math.min(m.bandBottom, (m.bottom + o.top) / 2);
        m.reachBottom = Math.min(m.reachBottom, o.top);
      }
    }
  }

  // 2. a line without text sitting on a text line is part of its formulas (a numerator…),
  //    except specks over text words (accents read as a line of their own)
  const display: (typeof classified)[number][] = [];
  for (const c of loose) {
    const mid = (c.line.bbox.y0 + c.line.bbox.y1) / 2;
    const host = main.find((m) => mid > m.bandTop - 0.25 * rowH && mid < m.bandBottom + 0.25 * rowH && height(c.line.bbox) < 1.2 * rowH);
    if (!host) {
      display.push(c);
      continue;
    }
    for (const t of c.tokens) {
      const b = t.word.bbox;
      const overText = host.tokens.some((h) => h.role === 'text' && Math.min(b.x1, h.word.bbox.x1) - Math.max(b.x0, h.word.bbox.x0) > 0.5 * (b.x1 - b.x0));
      const speck = b.x1 - b.x0 < 0.35 * rowH && b.y1 - b.y0 < 0.35 * rowH;
      if (!overText && !speck) host.tokens.push({ word: t.word, role: 'seed' });
    }
  }

  // 3. text height, to spot formulas taller than the line (fractions, roots, integrals)
  const textInk = main.flatMap((m) =>
    m.tokens
      .filter((t) => t.role === 'text')
      .map((t) => inkSpan(ink, t.word.bbox.x0, t.word.bbox.x1, m.bandTop, m.bandBottom))
      .filter((s): s is { y0: number; y1: number } => !!s)
      .map(height),
  );
  const textH = median(textInk) || rowH;

  // 4. each text line: its words and inline formulas
  const entries: { y: number; paragraph: number; items: PlanItem[] }[] = [];
  const explained: Rect[] = [];
  for (const m of main) {
    const tokens = m.tokens.sort((a, b) => a.word.bbox.x0 - b.word.bbox.x0);
    for (const t of tokens) {
      if (t.role !== 'neutral' && t.role !== 'connector') continue;
      const s = inkSpan(ink, t.word.bbox.x0, t.word.bbox.x1, m.bandTop, m.bandBottom);
      if (s && height(s) > 1.45 * textH) t.role = 'seed';
      else if (t.role === 'neutral' && hasFractionBar(ink, t.word.bbox.x0, t.word.bbox.x1, m.bandTop, m.bandBottom, Math.max(4, Math.round(0.3 * textH)))) t.role = 'seed';
    }
    const items = lineItems(tokens, m, ink);
    entries.push({ y: m.top, paragraph: m.line.paragraph, items });
    const b = m.line.bbox;
    explained.push({ x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 });
    for (const it of items) if (it.kind === 'formula') explained.push(it.region);
  }

  // 5. display formulas: ink that no text line accounts for (Tesseract often skips them)
  for (const block of unexplainedBlocks(ink, explained, rowH)) {
    const guess = display
      .filter((d) => d.line.bbox.y0 < block.y + block.h && d.line.bbox.y1 > block.y)
      .map((d) => d.tokens.map((t) => t.word.text).join(' '))
      .join(' ');
    entries.push({ y: block.y, paragraph: -1, items: [{ kind: 'formula', region: block, display: true, guess }] });
  }

  // 6. paragraphs in reading order; a display formula ends the paragraph it interrupts
  entries.sort((a, b) => a.y - b.y);
  const out: PlanParagraph[] = [];
  let current = -2;
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && e.paragraph >= 0 && e.paragraph === current) {
      if (last.items.length && e.items.length) last.items.push({ kind: 'text', text: ' ' });
      last.items.push(...e.items);
    } else out.push({ items: [...e.items] });
    current = e.paragraph;
  }
  return out.filter((p) => p.items.length);
}

/**
 * Blocks of ink outside the given rectangles: rows holding unexplained ink, joined when
 * close (the lines of a system or a matrix), with the specks of photos and accents left out
 * and big blocks (figures, tables) skipped.
 */
function unexplainedBlocks(ink: Gray, explained: Rect[], rowH: number): Rect[] {
  const { width: W, height: H, data } = ink;
  const covered = new Uint8Array(W * H);
  for (const r of explained) {
    const pad = 2;
    for (let y = Math.max(0, Math.floor(r.y - pad)); y < Math.min(H, Math.ceil(r.y + r.h + pad)); y++)
      covered.fill(1, y * W + Math.max(0, Math.floor(r.x - pad)), y * W + Math.min(W, Math.ceil(r.x + r.w + pad)));
  }
  const rowCount = new Uint32Array(H);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (data[y * W + x] < 128 && !covered[y * W + x]) n++;
    rowCount[y] = n;
  }
  const minRow = 2;
  const blocks: { y0: number; y1: number }[] = [];
  for (let y = 0; y < H; y++) {
    if (rowCount[y] < minRow) continue;
    const last = blocks[blocks.length - 1];
    if (last && y - last.y1 < 0.6 * rowH) last.y1 = y + 1;
    else blocks.push({ y0: y, y1: y + 1 });
  }
  const out: Rect[] = [];
  for (const b of blocks) {
    const h = b.y1 - b.y0;
    if (h < 0.45 * rowH || h > 8 * rowH) continue;
    // horizontal extent of the unexplained ink
    let x0 = W;
    let x1 = -1;
    let n = 0;
    for (let y = b.y0; y < b.y1; y++)
      for (let x = 0; x < W; x++)
        if (data[y * W + x] < 128 && !covered[y * W + x]) {
          n++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
        }
    if (x1 < 0 || x1 - x0 < 0.6 * rowH || n < rowH * 2) continue;
    out.push({ x: x0 - 4, y: b.y0 - 4, w: x1 - x0 + 9, h: h + 8 });
  }
  return out;
}

/**
 * Rectangle around the ink between x0 and x1 in a band, or null when blank. With reach
 * limits, ink that goes on past the band (a tall fraction) is followed up to them.
 */
function inkRegion(ink: Gray, x0: number, x1: number, top: number, bottom: number, reachTop = top, reachBottom = bottom): Rect | null {
  const r = inkBox(ink, 160, { x: x0 - 2, y: top, w: x1 - x0 + 4, h: bottom - top });
  if (!r) return null;
  const rowHasInk = (y: number) => !!inkBox(ink, 160, { x: r.x, y, w: r.w, h: 1 });
  let y0 = r.y;
  let y1 = r.y + r.h;
  // follow the ink across at most one white row (a fraction bar's gap)
  while (y1 < reachBottom - 1 && (rowHasInk(y1) || rowHasInk(y1 + 1))) y1++;
  while (y0 > reachTop + 1 && (rowHasInk(y0 - 1) || rowHasInk(y0 - 2))) y0--;
  return { x: r.x - 3, y: y0 - 3, w: r.w + 6, h: y1 - y0 + 6 };
}

function lineItems(tokens: Token[], m: MainLine, ink: Gray): PlanItem[] {
  const items: PlanItem[] = [];
  const text = (s: string) => {
    const last = items[items.length - 1];
    if (last?.kind === 'text') last.text += ` ${s}`;
    else items.push({ kind: 'text', text: s });
  };
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].role === 'text') {
      text(tokens[i].word.text);
      i++;
      continue;
    }
    // a run of non-text tokens, cut into clauses at commas ("60°, AB = 4 cm, AC = 6 cm");
    // a clause is a formula when it holds a seed
    let j = i;
    while (j < tokens.length && tokens[j].role !== 'text') j++;
    let start = i;
    let right = -Infinity;
    for (let k = i; k < j; k++) {
      right = Math.max(right, tokens[k].word.bbox.x1);
      // (a piece of fraction lying under the comma's word is not a new clause)
      if (k === j - 1 || (/[,;]$/.test(tokens[k].word.text) && tokens[k + 1].word.bbox.x0 >= right - 2)) {
        clause(tokens.slice(start, k + 1));
        start = k + 1;
      }
    }
    i = j;
  }
  return items;

  function clause(run: Token[]): void {
    if (!run.some((t) => t.role === 'seed') && !relationOfVariables(run)) {
      for (const t of run) text(t.word.text);
      return;
    }
    // sentence punctuation and units after the formula stay text ("= 4 cm,")
    const after: string[] = [];
    let last = run[run.length - 1];
    while (run.length && ((last.role === 'connector' && /^[.,:;]+$/.test(last.word.text)) || (last.role === 'neutral' && UNITS.test(core(last.word.text))))) {
      after.unshift(last.word.text);
      run.pop();
      last = run[run.length - 1];
    }
    if (run.length) {
      const x0 = Math.min(...run.map((t) => t.word.bbox.x0));
      const x1 = Math.max(...run.map((t) => t.word.bbox.x1));
      const region = inkRegion(ink, x0, x1, m.bandTop, m.bandBottom, m.reachTop, m.reachBottom);
      const guess = run.map((t) => t.word.text).join(' ');
      if (region) items.push({ kind: 'formula', region, display: false, guess });
      else text(guess);
    }
    for (const a of after) {
      const lastItem = items[items.length - 1];
      if (lastItem?.kind === 'text') lastItem.text += /^[.,:;]/.test(a) ? a : ` ${a}`;
      else items.push({ kind: 'text', text: a });
    }
  }
}
