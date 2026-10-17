/**
 * MathML (as produced by Temml) -> OMML (Office Math Markup Language).
 *
 * The output is the *inner* content of an <m:oMath> element. Every run carries
 * the chosen math font so equations render with a MathType-like look while
 * staying native, editable Word equations.
 */
import { elementChildren, escapeXml, parseXml } from './xml';

export interface OmmlStyle {
  /** OpenType MATH font used for the equation (e.g. "STIX Two Math"). */
  mathFont: string;
  /** Font used for plain text inside equations (\text{...}). */
  textFont: string;
  /** Font size in points; undefined = inherit from the paragraph. */
  sizePt?: number;
  /**
   * MathType look: letters, digits and function names are set in this text font
   * (e.g. Times New Roman — variables italic, numbers/functions upright), while
   * operators and structures (fraction bars, radicals, ∑, ∫, fences) keep the math font.
   */
  letterFont?: string;
}

type Sty = 'p' | 'b' | 'i' | 'bi';
type Scr = 'roman' | 'script' | 'fraktur' | 'double-struck' | 'sans-serif' | 'monospace';

interface RunOpts {
  sty?: Sty;
  scr?: Scr;
  nor?: boolean;
  /** The run holds letters/digits (from <mi>/<mn>), eligible for the MathType letter font. */
  letter?: boolean;
}

const LARGE_OPS = new Set([
  '∑', '∏', '∐', '∫', '∬', '∭', '⨌', '∮', '∯', '∰', '⋃', '⋂', '⋁', '⋀', '⨁', '⨂', '⨀', '⨄', '⨆',
]);
const INTEGRALS = new Set(['∫', '∬', '∭', '⨌', '∮', '∯', '∰']);
const RELATIONS = new Set([
  '=', '≠', '<', '>', '≤', '≥', '≈', '≡', '∼', '≃', '≅', '∝', '⇒', '⇔', '→', '←', '↔', '⟹', '⟺', '∈', '∉', '⊂', '⊃', '⊆', '⊇', ',', ';',
]);
const ADDITIVE = new Set(['+', '−', '-', '±', '∓']);
const INVISIBLE = new Set(['⁡', '⁢', '⁣', '⁤']);
const FUNC_APPLY = '⁡';

/** Accent characters (MathML <mover> content) -> OMML combining characters. */
const ACCENTS: Record<string, string> = {
  'ˆ': '̂', '^': '̂', '̂': '̂',
  'ˇ': '̌', '̌': '̌',
  '˜': '̃', '~': '̃', '̃': '̃',
  '¯': '̅', '‾': '̅', '̄': '̅', '̅': '̅',
  '˙': '̇', '̇': '̇',
  '¨': '̈', '̈': '̈',
  '˘': '̆', '̆': '̆',
  '´': '́', 'ˊ': '́', '́': '́',
  '`': '̀', 'ˋ': '̀', '̀': '̀',
  '˚': '̊', '̊': '̊',
  '→': '⃗', '⃗': '⃗',
  '←': '⃖', '⃖': '⃖',
  '↔': '⃡', '⃡': '⃡',
};
/** Stretchy characters drawn above/below a base -> <m:groupChr>. */
const GROUP_TOP = new Set(['⏞', '⏜', '⎴', '⌢', '→', '←', '↔', '⟶', '⟵', '⟷', '⇒', '⇐', '⇔']);
const GROUP_BOTTOM = new Set(['⏟', '⏝', '⎵', '⌣', '→', '←', '↔']);

/* ---------- Unicode math alphanumerics -> base letter + style ---------- */

const LETTERLIKE: Record<string, [string, Scr, Sty?]> = {
  'ℝ': ['R', 'double-struck'], 'ℕ': ['N', 'double-struck'], 'ℤ': ['Z', 'double-struck'],
  'ℚ': ['Q', 'double-struck'], 'ℂ': ['C', 'double-struck'], 'ℙ': ['P', 'double-struck'],
  'ℍ': ['H', 'double-struck'], 'ℬ': ['B', 'script'], 'ℰ': ['E', 'script'], 'ℱ': ['F', 'script'],
  'ℋ': ['H', 'script'], 'ℐ': ['I', 'script'], 'ℒ': ['L', 'script'], 'ℳ': ['M', 'script'],
  'ℛ': ['R', 'script'], 'ℯ': ['e', 'script'], 'ℊ': ['g', 'script'], 'ℴ': ['o', 'script'],
  'ℭ': ['C', 'fraktur'], 'ℌ': ['H', 'fraktur'], 'ℑ': ['I', 'fraktur'], 'ℜ': ['R', 'fraktur'], 'ℨ': ['Z', 'fraktur'],
};

/** Order of the 52-letter blocks in U+1D400..U+1D6A3. */
const ALPHA_BLOCKS: [Scr, Sty][] = [
  ['roman', 'b'], ['roman', 'i'], ['roman', 'bi'], ['script', 'p'], ['script', 'b'],
  ['fraktur', 'p'], ['double-struck', 'p'], ['fraktur', 'b'], ['sans-serif', 'p'],
  ['sans-serif', 'b'], ['sans-serif', 'i'], ['sans-serif', 'bi'], ['monospace', 'p'],
];

function decodeMathAlpha(ch: string): { ch: string; scr?: Scr; sty?: Sty } | null {
  const ll = LETTERLIKE[ch];
  if (ll) return { ch: ll[0], scr: ll[1], sty: ll[2] ?? 'p' };
  const cp = ch.codePointAt(0)!;
  if (cp >= 0x1d400 && cp <= 0x1d6a3) {
    const off = cp - 0x1d400;
    const [scr, sty] = ALPHA_BLOCKS[Math.floor(off / 52)];
    const i = off % 52;
    return { ch: String.fromCharCode(i < 26 ? 65 + i : 97 + i - 26), scr, sty };
  }
  if (cp >= 0x1d7ce && cp <= 0x1d7ff) {
    const digitBlocks: [Scr, Sty][] = [
      ['roman', 'b'], ['double-struck', 'p'], ['sans-serif', 'p'], ['sans-serif', 'b'], ['monospace', 'p'],
    ];
    const off = cp - 0x1d7ce;
    const [scr, sty] = digitBlocks[Math.floor(off / 10)];
    return { ch: String(off % 10), scr, sty };
  }
  return null;
}

/* ------------------------------ converter ------------------------------ */

class Converter {
  private readonly wRPr: string;
  private readonly wRPrText: string;
  private readonly letterRPr: ((italic: boolean, bold: boolean) => string) | null;
  /** When set, the next emitted run becomes an equation-array alignment point. */
  private alnPending = false;

  constructor(style: OmmlStyle) {
    const sz = style.sizePt ? `<w:sz w:val="${Math.round(style.sizePt * 2)}"/><w:szCs w:val="${Math.round(style.sizePt * 2)}"/>` : '';
    const fonts = (f: string) => `<w:rFonts w:ascii="${escapeXml(f)}" w:hAnsi="${escapeXml(f)}" w:cs="${escapeXml(f)}" w:eastAsia="${escapeXml(f)}"/>`;
    this.wRPr = `<w:rPr>${fonts(style.mathFont)}${sz}</w:rPr>`;
    this.wRPrText = `<w:rPr>${fonts(style.textFont)}${sz}</w:rPr>`;
    const lf = style.letterFont;
    this.letterRPr = lf
      ? (italic, bold) => `<w:rPr>${fonts(lf)}${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}${sz}</w:rPr>`
      : null;
  }

  get ctrlPr(): string {
    return `<m:ctrlPr>${this.wRPr}</m:ctrlPr>`;
  }

  run(text: string, opts: RunOpts = {}): string {
    if (!text) return '';
    if (opts.letter && this.letterRPr && !opts.scr) return this.letterRun(text, opts.sty);
    let mrpr = '';
    if (opts.nor) mrpr += '<m:nor/>';
    else {
      if (opts.scr) mrpr += `<m:scr m:val="${opts.scr}"/>`;
      if (opts.sty) mrpr += `<m:sty m:val="${opts.sty}"/>`;
    }
    if (this.alnPending) {
      mrpr += '<m:aln/>';
      this.alnPending = false;
    }
    const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
    return `<m:r>${mrpr ? `<m:rPr>${mrpr}</m:rPr>` : ''}${opts.nor ? this.wRPrText : this.wRPr}<m:t${space}>${escapeXml(text)}</m:t></m:r>`;
  }

  /** A letter/digit run in the MathType text font ("normal text" so Word keeps the font). */
  private letterRun(text: string, sty: Sty | undefined): string {
    // MathType defaults: Latin variables italic; numbers, functions and Greek upright.
    const latinVar = /^[A-Za-z]$/.test(text);
    const italic = sty === 'i' || sty === 'bi' || (sty === undefined && latinVar);
    const bold = sty === 'b' || sty === 'bi';
    let mrpr = '<m:nor/>';
    if (this.alnPending) {
      mrpr += '<m:aln/>';
      this.alnPending = false;
    }
    return `<m:r><m:rPr>${mrpr}</m:rPr>${this.letterRPr!(italic, bold)}<m:t>${escapeXml(text)}</m:t></m:r>`;
  }

  /* ---- generic dispatch ---- */

  node(el: Element): string {
    switch (el.localName) {
      case 'math':
      case 'mstyle':
      case 'mpadded':
      case 'merror':
        return this.row(elementChildren(el));
      case 'semantics':
        return el.firstElementChild ? this.node(el.firstElementChild) : '';
      case 'annotation':
      case 'annotation-xml':
        return '';
      case 'mrow':
        return this.mrow(el);
      case 'mi':
        return this.mi(el);
      case 'mn':
        return this.run(text(el), { letter: true });
      case 'mo':
        return this.mo(el);
      case 'mtext':
      case 'ms':
        return this.run(text(el), { nor: true });
      case 'mspace':
        return this.mspace(el);
      case 'mfrac':
        return this.mfrac(el);
      case 'msqrt':
        return this.rad(this.row(elementChildren(el)), null);
      case 'mroot': {
        const [base, idx] = elementChildren(el);
        return this.rad(this.node(base), this.node(idx));
      }
      case 'msup':
      case 'msub':
      case 'msubsup':
        return this.scripts(el);
      case 'mover':
      case 'munder':
      case 'munderover':
        return this.underOver(el);
      case 'menclose':
        return this.menclose(el);
      case 'mtable':
        return this.table(el);
      case 'mphantom':
        return `<m:phant><m:phantPr><m:show m:val="0"/>${this.ctrlPr}</m:phantPr><m:e>${this.row(elementChildren(el))}</m:e></m:phant>`;
      case 'mfenced':
        return this.delim(el.getAttribute('open') ?? '(', el.getAttribute('close') ?? ')', this.row(elementChildren(el)));
      default:
        return this.row(elementChildren(el));
    }
  }

  /** A horizontal sequence: detects functions (sin x) and n-ary operators (∑, ∫). */
  row(items: Element[]): string {
    let out = '';
    for (let i = 0; i < items.length; i++) {
      const el = items[i];

      const nary = this.naryHead(el);
      if (nary) {
        const isInt = INTEGRALS.has(nary.chr);
        let j = i + 1;
        const operand: Element[] = [];
        while (j < items.length && !this.stopsOperand(items[j], isInt)) operand.push(items[j++]);
        out += this.nary(nary, operand);
        i = j - 1;
        continue;
      }

      const fn = this.funcHead(items, i);
      if (fn) {
        let j = fn.next;
        while (j < items.length && isSkippable(items[j])) j++;
        const arg = j < items.length ? this.node(items[j]) : '';
        out += `<m:func><m:funcPr>${this.ctrlPr}</m:funcPr><m:fName>${fn.name}</m:fName><m:e>${arg}</m:e></m:func>`;
        i = j < items.length ? j : items.length;
        continue;
      }

      out += this.node(el);
    }
    return out;
  }

  /* ---- n-ary operators ---- */

  private naryHead(el: Element): { chr: string; sub: Element | null; sup: Element | null; under: boolean } | null {
    const isOp = (e: Element | null) => e && e.localName === 'mo' && LARGE_OPS.has(text(e).trim());
    const kids = elementChildren(el);
    switch (el.localName) {
      case 'mo':
        return isOp(el) ? { chr: text(el).trim(), sub: null, sup: null, under: false } : null;
      case 'msub':
      case 'munder':
        return isOp(kids[0]) ? { chr: text(kids[0]).trim(), sub: kids[1], sup: null, under: el.localName === 'munder' } : null;
      case 'msup':
      case 'mover':
        return isOp(kids[0]) ? { chr: text(kids[0]).trim(), sub: null, sup: kids[1], under: el.localName === 'mover' } : null;
      case 'msubsup':
      case 'munderover':
        return isOp(kids[0]) ? { chr: text(kids[0]).trim(), sub: kids[1], sup: kids[2], under: el.localName === 'munderover' } : null;
      default:
        return null;
    }
  }

  private stopsOperand(el: Element, isIntegral: boolean): boolean {
    if (el.localName !== 'mo') return false;
    const t = text(el).trim();
    if (RELATIONS.has(t)) return true;
    return !isIntegral && ADDITIVE.has(t);
  }

  private nary(h: { chr: string; sub: Element | null; sup: Element | null }, operand: Element[]): string {
    const isInt = INTEGRALS.has(h.chr);
    let pr = `<m:chr m:val="${escapeXml(h.chr)}"/><m:limLoc m:val="${isInt ? 'subSup' : 'undOvr'}"/>`;
    if (!h.sub) pr += '<m:subHide m:val="1"/>';
    if (!h.sup) pr += '<m:supHide m:val="1"/>';
    return (
      `<m:nary><m:naryPr>${pr}${this.ctrlPr}</m:naryPr>` +
      `<m:sub>${h.sub ? this.node(h.sub) : ''}</m:sub><m:sup>${h.sup ? this.node(h.sup) : ''}</m:sup>` +
      `<m:e>${this.row(operand)}</m:e></m:nary>`
    );
  }

  /* ---- functions: sin x, log_2 x, lim_{x→0} ---- */

  private funcHead(items: Element[], i: number): { name: string; next: number } | null {
    const el = items[i];
    const next = items[i + 1];
    const nextIsApply = next && next.localName === 'mo' && text(next) === FUNC_APPLY;

    // Temml: <mrow><mi>sin</mi><mo>⁡</mo><mspace/></mrow>
    if (el.localName === 'mrow') {
      const kids = elementChildren(el).filter((k) => k.localName !== 'mspace');
      const last = kids[kids.length - 1];
      if (kids.length === 2 && last.localName === 'mo' && text(last) === FUNC_APPLY) {
        return { name: this.funcName(kids[0]), next: i + 1 };
      }
      return null;
    }
    if (!nextIsApply) return null;
    if (el.localName === 'mi' || ['msub', 'munder', 'msup', 'msubsup', 'munderover', 'mover'].includes(el.localName)) {
      return { name: this.funcName(el), next: i + 2 };
    }
    return null;
  }

  private funcName(el: Element): string {
    const kids = elementChildren(el);
    if ((el.localName === 'msub' || el.localName === 'munder') && kids[0]?.localName === 'mi') {
      const name = text(kids[0]);
      if (LIMIT_LIKE.has(name)) {
        return `<m:limLow><m:limLowPr>${this.ctrlPr}</m:limLowPr><m:e>${this.run(name, { sty: 'p' })}</m:e><m:lim>${this.node(kids[1])}</m:lim></m:limLow>`;
      }
    }
    return this.node(el);
  }

  /* ---- leaf tokens ---- */

  private mi(el: Element): string {
    const t = text(el);
    if (!t) return '';
    const variant = el.getAttribute('mathvariant');
    const chars = Array.from(t);
    if (chars.length === 1) {
      const dec = decodeMathAlpha(t);
      if (dec) return this.run(dec.ch, { scr: dec.scr === 'roman' ? undefined : dec.scr, sty: dec.sty, letter: true });
    }
    const opts: RunOpts = { letter: true };
    switch (variant) {
      case 'normal': opts.sty = 'p'; break;
      case 'bold': opts.sty = 'b'; break;
      case 'italic': opts.sty = 'i'; break;
      case 'bold-italic': opts.sty = 'bi'; break;
      case 'double-struck': opts.scr = 'double-struck'; opts.sty = 'p'; break;
      case 'script': opts.scr = 'script'; break;
      case 'fraktur': opts.scr = 'fraktur'; break;
      case 'sans-serif': opts.scr = 'sans-serif'; break;
      case 'monospace': opts.scr = 'monospace'; break;
      default:
        if (chars.length > 1) opts.sty = 'p';
    }
    return this.run(t, opts);
  }

  private mo(el: Element): string {
    const t = text(el);
    if (!t || INVISIBLE.has(t)) return '';
    return this.run(t);
  }

  private mspace(el: Element): string {
    const w = parseEm(el.getAttribute('width'));
    if (w >= 1.9) return this.run('  ');
    if (w >= 0.9) return this.run(' ');
    if (w >= 0.25) return this.run(' ');
    if (w >= 0.15) return this.run(' ');
    return '';
  }

  /* ---- layout schemata ---- */

  private mrow(el: Element): string {
    const kids = elementChildren(el);
    const style = el.getAttribute('style') ?? '';
    if (/border\s*:/.test(style)) {
      return `<m:borderBox><m:borderBoxPr>${this.ctrlPr}</m:borderBoxPr><m:e>${this.row(kids)}</m:e></m:borderBox>`;
    }
    const first = kids[0];
    const last = kids[kids.length - 1];
    if (kids.length >= 2 && isFence(first, 'prefix') && isFence(last, 'postfix')) {
      const inner = kids.slice(1, -1);
      const open = text(first).trim();
      const close = text(last).trim();
      // A system of equations: { followed by a table with no closing fence.
      if (inner.length === 1 && inner[0].localName === 'mtable') {
        const tbl = inner[0];
        const body = open === '{' && close === '' ? this.eqArr(tbl) : this.table(tbl);
        return this.delim(open, close, body);
      }
      return this.delim(open, close, this.row(inner));
    }
    return this.row(kids);
  }

  private delim(open: string, close: string, body: string): string {
    return `<m:d><m:dPr><m:begChr m:val="${escapeXml(open)}"/><m:endChr m:val="${escapeXml(close)}"/>${this.ctrlPr}</m:dPr><m:e>${body}</m:e></m:d>`;
  }

  private mfrac(el: Element): string {
    const [num, den] = elementChildren(el);
    const lt = el.getAttribute('linethickness');
    const noBar = lt !== null && parseFloat(lt) === 0;
    const type = noBar ? '<m:type m:val="noBar"/>' : el.getAttribute('bevelled') === 'true' ? '<m:type m:val="skw"/>' : '';
    return `<m:f><m:fPr>${type}${this.ctrlPr}</m:fPr><m:num>${this.node(num)}</m:num><m:den>${this.node(den)}</m:den></m:f>`;
  }

  private rad(body: string, degree: string | null): string {
    const hide = degree === null ? '<m:degHide m:val="1"/>' : '';
    return `<m:rad><m:radPr>${hide}${this.ctrlPr}</m:radPr><m:deg>${degree ?? ''}</m:deg><m:e>${body}</m:e></m:rad>`;
  }

  private scripts(el: Element): string {
    const kids = elementChildren(el);
    const base = kids[0];
    const nary = this.naryHead(el);
    if (nary) return this.nary(nary, []);

    if (el.localName === 'msup') {
      const sup = kids[1];
      const supText = sup.localName === 'mo' ? text(sup).trim() : '';
      // f′ : prime is drawn as a plain character, like MathType does.
      if (/^[′″‴]+$/.test(supText)) return this.node(base) + this.run(supText);
      if (supText === '∘') return this.node(base) + this.run('°');
      // \overset{\frown}{AB} (arc) comes through Temml as msup.
      if (supText === '⌢' || supText === '⏜') return this.groupChr(this.node(base), '⏜', 'top');
      return `<m:sSup><m:sSupPr>${this.ctrlPr}</m:sSupPr><m:e>${this.node(base)}</m:e><m:sup>${this.node(sup)}</m:sup></m:sSup>`;
    }
    if (el.localName === 'msub') {
      return `<m:sSub><m:sSubPr>${this.ctrlPr}</m:sSubPr><m:e>${this.node(base)}</m:e><m:sub>${this.node(kids[1])}</m:sub></m:sSub>`;
    }
    return `<m:sSubSup><m:sSubSupPr>${this.ctrlPr}</m:sSubSupPr><m:e>${this.node(base)}</m:e><m:sub>${this.node(kids[1])}</m:sub><m:sup>${this.node(kids[2])}</m:sup></m:sSubSup>`;
  }

  private groupChr(body: string, chr: string, pos: 'top' | 'bot'): string {
    const p = pos === 'top' ? '<m:pos m:val="top"/><m:vertJc m:val="bot"/>' : '';
    return `<m:groupChr><m:groupChrPr><m:chr m:val="${escapeXml(chr)}"/>${p}${this.ctrlPr}</m:groupChrPr><m:e>${body}</m:e></m:groupChr>`;
  }

  private underOver(el: Element): string {
    const nary = this.naryHead(el);
    if (nary) return this.nary(nary, []);
    const kids = elementChildren(el);
    const base = kids[0];

    if (el.localName === 'mover') {
      const over = kids[1];
      const ch = over.localName === 'mo' ? text(over).trim() : '';
      const stretchy = over.getAttribute('stretchy') === 'true';
      if (ch === '‾' || ch === '¯' || ch === '_' || (ch === '―' && stretchy)) {
        return `<m:bar><m:barPr><m:pos m:val="top"/>${this.ctrlPr}</m:barPr><m:e>${this.node(base)}</m:e></m:bar>`;
      }
      if (ch && GROUP_TOP.has(ch) && (stretchy || !ACCENTS[ch])) return this.groupChr(this.node(base), ch === '⌢' ? '⏜' : ch, 'top');
      if (ch && ACCENTS[ch]) {
        return `<m:acc><m:accPr><m:chr m:val="${ACCENTS[ch]}"/>${this.ctrlPr}</m:accPr><m:e>${this.node(base)}</m:e></m:acc>`;
      }
      return this.limUpp(this.node(base), this.node(over));
    }
    if (el.localName === 'munder') {
      const under = kids[1];
      const ch = under.localName === 'mo' ? text(under).trim() : '';
      if (ch === '_' || ch === '‾' || ch === '¯' || ch === '―') {
        return `<m:bar><m:barPr><m:pos m:val="bot"/>${this.ctrlPr}</m:barPr><m:e>${this.node(base)}</m:e></m:bar>`;
      }
      if (ch && GROUP_BOTTOM.has(ch)) return this.groupChr(this.node(base), ch, 'bot');
      if (base.localName === 'mi' && LIMIT_LIKE.has(text(base))) {
        return `<m:limLow><m:limLowPr>${this.ctrlPr}</m:limLowPr><m:e>${this.run(text(base), { sty: 'p' })}</m:e><m:lim>${this.node(under)}</m:lim></m:limLow>`;
      }
      return this.limLow(this.node(base), this.node(under));
    }
    // munderover (non n-ary)
    return this.limUpp(this.limLow(this.node(base), this.node(kids[1])), this.node(kids[2]));
  }

  private limUpp(e: string, lim: string): string {
    return `<m:limUpp><m:limUppPr>${this.ctrlPr}</m:limUppPr><m:e>${e}</m:e><m:lim>${lim}</m:lim></m:limUpp>`;
  }

  private limLow(e: string, lim: string): string {
    return `<m:limLow><m:limLowPr>${this.ctrlPr}</m:limLowPr><m:e>${e}</m:e><m:lim>${lim}</m:lim></m:limLow>`;
  }

  private menclose(el: Element): string {
    const notation = (el.getAttribute('notation') ?? 'longdiv').split(/\s+/);
    const body = this.row(elementChildren(el));
    if (notation.includes('top')) return `<m:bar><m:barPr><m:pos m:val="top"/>${this.ctrlPr}</m:barPr><m:e>${body}</m:e></m:bar>`;
    if (notation.includes('bottom')) return `<m:bar><m:barPr><m:pos m:val="bot"/>${this.ctrlPr}</m:barPr><m:e>${body}</m:e></m:bar>`;
    const strikes: string[] = [];
    if (notation.includes('updiagonalstrike')) strikes.push('<m:strikeBLTR m:val="1"/>');
    if (notation.includes('downdiagonalstrike')) strikes.push('<m:strikeTLBR m:val="1"/>');
    if (notation.includes('horizontalstrike')) strikes.push('<m:strikeH m:val="1"/>');
    const boxed = notation.some((n) => n === 'box' || n === 'roundedbox' || n === 'circle');
    const hide = boxed ? '' : '<m:hideTop m:val="1"/><m:hideBot m:val="1"/><m:hideLeft m:val="1"/><m:hideRight m:val="1"/>';
    return `<m:borderBox><m:borderBoxPr>${hide}${strikes.join('')}${this.ctrlPr}</m:borderBoxPr><m:e>${body}</m:e></m:borderBox>`;
  }

  /** Tables: aligned/cases environments become equation arrays, the rest matrices. */
  private table(el: Element): string {
    const rows = elementChildren(el).filter((r) => r.localName === 'mtr' || r.localName === 'mlabeledtr');
    const aligned = rows.some((r) => elementChildren(r).some((c) => /tml-(left|right)/.test(c.getAttribute('class') ?? '')));
    if (aligned) return this.eqArr(el);

    const cols = Math.max(1, ...rows.map((r) => elementChildren(r).length));
    const mPr = `<m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="${cols}"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs>${this.ctrlPr}</m:mPr>`;
    const body = rows
      .map((r) => {
        const cells = elementChildren(r).map((c) => `<m:e>${this.row(elementChildren(c))}</m:e>`);
        while (cells.length < cols) cells.push('<m:e></m:e>');
        return `<m:mr>${cells.join('')}</m:mr>`;
      })
      .join('');
    return `<m:m>${mPr}${body}</m:m>`;
  }

  private eqArr(el: Element): string {
    const rows = elementChildren(el).filter((r) => r.localName === 'mtr' || r.localName === 'mlabeledtr');
    const body = rows
      .map((r) => {
        const cells = elementChildren(r);
        let line = '';
        cells.forEach((c, idx) => {
          if (idx > 0) this.alnPending = true;
          line += this.row(elementChildren(c));
          this.alnPending = false;
        });
        return `<m:e>${line}</m:e>`;
      })
      .join('');
    return `<m:eqArr><m:eqArrPr>${this.ctrlPr}</m:eqArrPr>${body}</m:eqArr>`;
  }
}

const LIMIT_LIKE = new Set(['lim', 'max', 'min', 'sup', 'inf', 'limsup', 'liminf', 'lim sup', 'lim inf', 'arg max', 'arg min']);

function text(el: Element): string {
  return (el.textContent ?? '').replace(/ /g, ' ');
}

function isSkippable(el: Element): boolean {
  if (el.localName === 'mspace') return true;
  return el.localName === 'mo' && INVISIBLE.has(text(el));
}

function isFence(el: Element | undefined, form: 'prefix' | 'postfix'): boolean {
  if (!el || el.localName !== 'mo') return false;
  if (el.getAttribute('fence') !== 'true') return false;
  const f = el.getAttribute('form');
  return f === null || f === form;
}

function parseEm(w: string | null): number {
  if (!w) return 0;
  const m = /^(-?[\d.]+)\s*(em|pt|px|mu)?$/.exec(w.trim());
  if (!m) return 0;
  const v = parseFloat(m[1]);
  switch (m[2]) {
    case 'pt': return v / 10;
    case 'px': return v / 16;
    case 'mu': return v / 18;
    default: return v;
  }
}

/** Converts a MathML string (with a <math> root) into OMML inner content. */
export function mathmlToOmml(mathml: string, style: OmmlStyle): string {
  const doc = parseXml(mathml);
  return new Converter(style).node(doc.documentElement);
}
