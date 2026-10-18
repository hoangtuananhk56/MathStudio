/**
 * The text written on a figure: point names (A, B′, M1), measures (30 m, 8cm², 2dm),
 * numbers, words (captions, "Lối đi"), question marks; anything else is a misreading
 * (a dash read as "`", a dot as "#") and stays part of the drawing.
 */
import type { Rect } from './image';

export type FigureTextKind = 'label' | 'measure' | 'number' | 'word' | 'question';

export interface FigureText {
  kind: FigureTextKind;
  /** Normalised text: "B′", "30 m", "8 cm²", "Hình 28". */
  text: string;
  box: Rect;
  confidence: number;
  /** A one-digit reading that may be a letter ("4" for an italic A): the letter. */
  alt?: string;
}

const UNIT = '(mm|cm|dm|km|m|ha)';
const MEASURE = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*${UNIT}\\s*([2²3³"”?]?)$`);

/** Classifies a recognised piece of text; null for a misreading. */
export function classifyText(raw: string, confidence: number, box: Rect): FigureText | null {
  let t = raw.replace(/\s+/g, ' ').trim().replace(/^[.,;:'"`|]+|[.,;:'"`|]+$/g, '');
  if (!t) return null;
  // common misreadings of italic capitals in figures
  t = t.replace(/^[Áá]$/, 'A').replace(/^[Éé]$/, 'E').replace(/^0$/, 'O');
  if (/^\?$/.test(t)) return { kind: 'question', text: '?', box, confidence };
  if (/^[A-Z]['′’]{0,2}\d?$/.test(t) && confidence >= 45) {
    return { kind: 'label', text: t.replace(/['’]/g, '′'), box, confidence };
  }
  const m = MEASURE.exec(t.replace(/§/g, '8'));
  if (m && confidence >= 40) {
    const power = /[2²"”?]/.test(m[3]) && m[3] ? '²' : /[3³]/.test(m[3]) ? '³' : '';
    // "8cm”" / "8cm?": a ² read as a quote or a question mark
    return { kind: 'measure', text: `${m[1].replace('.', ',')} ${m[2]}${power}`, box, confidence };
  }
  if (/^\d+(?:[.,]\d+)?$/.test(t) && confidence >= 60) return { kind: 'number', text: t.replace('.', ','), box, confidence };
  if (/^[\p{L}\d][\p{L}\d .,()/-]*$/u.test(t) && /\p{L}{2,}/u.test(t) && confidence >= 60) return { kind: 'word', text: t, box, confidence };
  return null;
}

/**
 * Joins a number and the unit written apart ("2" "m" → "2 m"), left to right on one line.
 */
export function joinMeasures(items: FigureText[]): FigureText[] {
  const out = [...items].sort((a, b) => a.box.x - b.box.x);
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    if (a.kind !== 'number') continue;
    const j = out.findIndex((b, k) => {
      if (k === i || !/^(mm|cm|dm|km|m)[2²]?$/.test(b.text)) return false;
      const gap = b.box.x - (a.box.x + a.box.w);
      const sameLine = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y) > 0.3 * Math.min(a.box.h, b.box.h);
      return sameLine && gap >= -2 && gap < 1.2 * a.box.h;
    });
    if (j < 0) continue;
    const b = out[j];
    const x0 = Math.min(a.box.x, b.box.x);
    const y0 = Math.min(a.box.y, b.box.y);
    out[i] = {
      kind: 'measure',
      text: `${a.text} ${b.text.replace('2', '²')}`,
      confidence: Math.min(a.confidence, b.confidence),
      box: { x: x0, y: y0, w: Math.max(a.box.x + a.box.w, b.box.x + b.box.w) - x0, h: Math.max(a.box.y + a.box.h, b.box.y + b.box.h) - y0 },
    };
    out.splice(j, 1);
    if (j < i) i--;
  }
  return out;
}

/** A unit alone ("m", "cm²") is a word to classifyText; recognise it so joinMeasures can use it. */
export function unitText(raw: string, confidence: number, box: Rect): FigureText | null {
  const t = raw.trim();
  return /^(mm|cm|dm|km|m)[2²]?$/.test(t) && confidence >= 50 ? { kind: 'word', text: t, box, confidence } : null;
}

/**
 * A point's name read by the formula model: "A", "A^{\prime}" / "A'" (A′), "M_1" / "M_{1}",
 * or a number. Null for anything else.
 */
export function nameFromLatex(latex: string, confidence: number, box: Rect): FigureText | null {
  let t = latex.replace(/\s+/g, '').replace(/^\\(?:cdot|ldots|cdots)_?/, ''); // a speck next to the letter
  // wrappers the model puts around a lone letter: ^{…}, _{…}, \textit{…}, \mathbf{…}
  for (let k = 0; k < 4; k++)
    t = t
      .replace(/\\(?:mathrm|mathit|mathbf|boldsymbol|mathcal|bm|textit|textbf|text|textrm)\{([^{}]*)\}/g, '$1')
      .replace(/^[\^_]\{([^{}]*)\}$/, '$1')
      .replace(/^[\^_](.)$/, '$1');
  // letters whose capital has the same shape
  if (/^[copsuvwxzk]$/.test(t)) t = t.toUpperCase();
  let m = /^([A-Z])(?:\^\{?(?:\\prime|')+\}?|'+)?(?:_\{?(\d)\}?)?$/.exec(t);
  if (m) {
    const primes = (t.match(/\\prime|'/g) ?? []).length;
    return { kind: 'label', text: m[1] + '′'.repeat(Math.min(2, primes)) + (m[2] ? `_${m[2]}` : ''), box, confidence };
  }
  m = /^(\d+)$/.exec(t);
  if (m) return { kind: 'number', text: m[1], box, confidence };
  if (t === '?') return { kind: 'question', text: '?', box, confidence };
  return null;
}
