/**
 * Reading a page (an exercise): Vietnamese text with inline and display formulas.
 * The engines are passed in, so the same code runs in the add-in and in tests.
 */
import { latexToPlain } from '../geometry/exerciseText';
import type { FormulaReading } from './formula-model';
import { preparePage, type Gray, type Rect } from './image';
import { planPage, type OcrLine } from './page-layout';

export type Segment = { kind: 'text'; text: string } | { kind: 'math'; latex: string; display: boolean; confidence: number };

export interface PageParagraph {
  segments: Segment[];
}

export interface PageEngines {
  /** Text lines with their words, in reading order (`page` is levelled and straightened). */
  readText(page: Gray): Promise<OcrLine[]>;
  /** One formula, cut out of the page. */
  readFormula(page: Gray, region: Rect): Promise<FormulaReading>;
  /** Called with 0…1 as formulas are read. */
  progress?(fraction: number): void;
}

/** Tidies recognised text: spacing around punctuation, Vietnamese quotes, stray marks. */
export function tidyText(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?)\]])/g, '$1')
    .replace(/([([])\s+/g, '$1')
    .replace(/—|–/g, '-');
}

const RELATION = /=|<|>|\\(?:neq?|leq?|geq?|in|notin|perp|parallel)(?![a-zA-Z])/;

/**
 * "x>0,x\neq 1" → ["x>0", "x\neq 1"]: conditions listed in a sentence are separate formulas
 * (a comma inside braces, brackets or a list like "x_1,x_2" is left alone).
 */
export function splitConditions(latex: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let at = 0;
  for (let i = 0; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if ('{(['.includes(ch)) depth++;
    else if ('})]'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(latex.slice(at, i));
      at = i + 1;
    }
  }
  parts.push(latex.slice(at));
  return parts.length > 1 && parts.every((p) => RELATION.test(p)) ? parts.map((p) => p.trim()) : [latex];
}

/** Reads a picture of an exercise; `picture` is taken as is (photo, scan, screenshot). */
export async function readPage(picture: Gray, engines: PageEngines): Promise<PageParagraph[]> {
  const page = preparePage(picture);
  const plan = planPage(await engines.readText(page), page);
  const total = plan.reduce((n, p) => n + p.items.filter((i) => i.kind === 'formula').length, 0);
  let done = 0;
  const out: PageParagraph[] = [];
  for (const p of plan) {
    const segments: Segment[] = [];
    for (const item of p.items) {
      if (item.kind === 'text') {
        segments.push({ kind: 'text', text: item.text });
        continue;
      }
      const r = await engines.readFormula(page, item.region);
      engines.progress?.(++done / Math.max(1, total));
      let latex = r.latex;
      // sentence punctuation read with an inline formula belongs to the text
      const trail = item.display ? '' : (/[.,;:]+$/.exec(latex)?.[0] ?? '');
      if (trail) latex = latex.slice(0, -trail.length);
      const parts = item.display ? [latex] : splitConditions(latex);
      parts.forEach((part, k) => {
        if (k > 0) segments.push({ kind: 'text', text: ', ' });
        if (part) segments.push({ kind: 'math', latex: part, display: item.display, confidence: r.confidence });
      });
      if (trail) segments.push({ kind: 'text', text: trail });
    }
    // merge text pieces and tidy them
    const merged: Segment[] = [];
    for (const s of segments) {
      const last = merged[merged.length - 1];
      if (s.kind === 'text' && last?.kind === 'text') last.text += /\s$/.test(last.text) || /^[\s,.;:!?)]/.test(s.text) ? s.text : ` ${s.text}`;
      else merged.push(s.kind === 'text' ? { ...s } : s);
    }
    for (let i = 0; i < merged.length; i++) {
      const s = merged[i];
      if (s.kind !== 'text') continue;
      let t = tidyText(s.text);
      if (i > 0 && !/^[\s,.;:!?)]/.test(t)) t = ` ${t}`;
      if (i < merged.length - 1 && !/[\s(]$/.test(t)) t = `${t} `;
      s.text = i === 0 ? t.trimStart() : t;
    }
    if (merged.length) out.push({ segments: merged });
  }
  return out;
}

/** The page as text with $…$ (inline) and $$…$$ (display) formulas. */
export function pageToTex(paragraphs: PageParagraph[]): string {
  return paragraphs
    .map((p) => p.segments.map((s) => (s.kind === 'text' ? s.text : s.display ? `$$${s.latex}$$` : `$${s.latex}$`)).join('').trim())
    .join('\n');
}

/** The page as plain text, formulas written the way a teacher types them ("góc ABC = 60°"). */
export function pageToPlain(paragraphs: PageParagraph[]): string {
  return paragraphs
    .map((p) => p.segments.map((s) => (s.kind === 'text' ? s.text : latexToPlain(s.latex))).join('').replace(/\s+/g, ' ').trim())
    .join('\n');
}

/** Parses "$…$" / "$$…$$" text (as edited by the user) back into paragraphs. */
export function texToPage(text: string): PageParagraph[] {
  return text
    .split(/\n/)
    .map((line) => {
      const segments: Segment[] = [];
      const re = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
      let at = 0;
      for (const m of line.matchAll(re)) {
        if (m.index! > at) segments.push({ kind: 'text', text: line.slice(at, m.index) });
        segments.push({ kind: 'math', latex: (m[1] ?? m[2]).trim(), display: m[1] !== undefined, confidence: 1 });
        at = m.index! + m[0].length;
      }
      if (at < line.length) segments.push({ kind: 'text', text: line.slice(at) });
      return { segments };
    })
    .filter((p) => p.segments.some((s) => s.kind === 'math' || s.text.trim()));
}
