/**
 * OMML -> LaTeX. Used to open equations that were not created by us (Word's own
 * equation editor) or that were edited natively in Word after insertion.
 */
import { elementChildren, parseXml } from './xml';

const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

const SYMBOLS: Record<string, string> = {
  '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '≈': '\\approx ', '≡': '\\equiv ', '±': '\\pm ', '∓': '\\mp ',
  '×': '\\times ', '÷': '\\div ', '⋅': '\\cdot ', '·': '\\cdot ', '∞': '\\infty ', '→': '\\to ', '←': '\\leftarrow ',
  '⇒': '\\Rightarrow ', '⇔': '\\Leftrightarrow ', '↔': '\\leftrightarrow ', '∈': '\\in ', '∉': '\\notin ',
  '⊂': '\\subset ', '⊃': '\\supset ', '⊆': '\\subseteq ', '⊇': '\\supseteq ', '∪': '\\cup ', '∩': '\\cap ',
  '∅': '\\varnothing ', '∀': '\\forall ', '∃': '\\exists ', '¬': '\\neg ', '∧': '\\land ', '∨': '\\lor ',
  '∠': '\\angle ', '⊥': '\\perp ', '∥': '\\parallel ', '△': '\\triangle ', '°': '^{\\circ}', '∘': '\\circ ',
  '∂': '\\partial ', '∇': '\\nabla ', '…': '\\ldots ', '⋯': '\\cdots ', '∼': '\\sim ', '≅': '\\cong ', '∝': '\\propto ',
  '−': '-', '′': "'", '″': "''", ' ': '\\,', ' ': '\\;', ' ': '\\quad ',
  'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ', 'δ': '\\delta ', 'ε': '\\varepsilon ', 'ϵ': '\\epsilon ',
  'ζ': '\\zeta ', 'η': '\\eta ', 'θ': '\\theta ', 'ϑ': '\\vartheta ', 'ι': '\\iota ', 'κ': '\\kappa ', 'λ': '\\lambda ',
  'μ': '\\mu ', 'ν': '\\nu ', 'ξ': '\\xi ', 'π': '\\pi ', 'ρ': '\\rho ', 'σ': '\\sigma ', 'τ': '\\tau ',
  'υ': '\\upsilon ', 'φ': '\\varphi ', 'ϕ': '\\phi ', 'χ': '\\chi ', 'ψ': '\\psi ', 'ω': '\\omega ',
  'Γ': '\\Gamma ', 'Δ': '\\Delta ', 'Θ': '\\Theta ', 'Λ': '\\Lambda ', 'Ξ': '\\Xi ', 'Π': '\\Pi ', 'Σ': '\\Sigma ',
  'Υ': '\\Upsilon ', 'Φ': '\\Phi ', 'Ψ': '\\Psi ', 'Ω': '\\Omega ',
  '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '&': '\\&', '$': '\\$', '_': '\\_',
};

const NARY: Record<string, string> = {
  '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint',
  '⋃': '\\bigcup', '⋂': '\\bigcap', '⋁': '\\bigvee', '⋀': '\\bigwedge',
};

const ACCENTS: Record<string, string> = {
  '̂': '\\hat', '̌': '\\check', '̃': '\\tilde', '̅': '\\bar', '̄': '\\bar',
  '̇': '\\dot', '̈': '\\ddot', '̆': '\\breve', '́': '\\acute', '̀': '\\grave',
  '̊': '\\mathring', '⃗': '\\vec', '⃖': '\\overleftarrow', '⃡': '\\overleftrightarrow',
};

const FUNCS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth',
  'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'dim', 'gcd', 'deg', 'arg', 'ker', 'Pr',
]);

const DELIMS: Record<string, [string, string]> = {
  '(': ['(', ')'], ')': [')', ')'], '[': ['[', ']'], ']': [']', ']'], '{': ['\\{', '\\}'], '}': ['\\}', '\\}'],
  '|': ['|', '|'], '‖': ['\\|', '\\|'], '⟨': ['\\langle', '\\rangle'], '⟩': ['\\rangle', '\\rangle'],
  '⌊': ['\\lfloor', '\\rfloor'], '⌋': ['\\rfloor', '\\rfloor'], '⌈': ['\\lceil', '\\rceil'], '⌉': ['\\rceil', '\\rceil'],
};

function mchild(el: Element, name: string): Element | null {
  for (const c of elementChildren(el)) if (c.namespaceURI === M_NS && c.localName === name) return c;
  return null;
}

function mval(el: Element | null, name: string): string | null {
  const c = el && mchild(el, name);
  if (!c) return null;
  return c.getAttributeNS(M_NS, 'val') ?? c.getAttribute('m:val');
}

function on(el: Element | null, name: string): boolean {
  const c = el && mchild(el, name);
  if (!c) return false;
  const v = c.getAttributeNS(M_NS, 'val') ?? c.getAttribute('m:val');
  return v === null || v === '1' || v === 'on' || v === 'true';
}

/** The single child of `el` if it is an m:`name` element, else null. */
function onlyChild(el: Element | null, name: string): Element | null {
  if (!el) return null;
  const kids = elementChildren(el);
  return kids.length === 1 && kids[0].localName === name ? kids[0] : null;
}

function group(s: string): string {
  return `{${s.trim()}}`;
}

function delimLatex(chr: string, side: 0 | 1): string {
  if (chr === '') return '.';
  return DELIMS[chr]?.[side] ?? chr;
}

class OmmlReader {
  /** Converts the children of an argument element (m:e, m:num, ...). */
  arg(el: Element | null): string {
    if (!el) return '';
    return elementChildren(el).map((c) => this.node(c)).join('');
  }

  node(el: Element): string {
    if (el.namespaceURI !== M_NS) {
      // w:r inside math (rare) or other wrappers
      return elementChildren(el).map((c) => this.node(c)).join('');
    }
    switch (el.localName) {
      case 'oMathPara':
      case 'oMath':
        return elementChildren(el).map((c) => this.node(c)).join('');
      case 'r':
        return this.run(el);
      case 'f': {
        const type = mval(mchild(el, 'fPr'), 'type');
        const num = this.arg(mchild(el, 'num'));
        const den = this.arg(mchild(el, 'den'));
        if (type === 'noBar') return `\\genfrac{}{}{0pt}{}${group(num)}${group(den)}`;
        if (type === 'lin') return `${group(num)}/${group(den)}`;
        return `\\frac${group(num)}${group(den)}`;
      }
      case 'rad': {
        const pr = mchild(el, 'radPr');
        const deg = this.arg(mchild(el, 'deg'));
        const e = this.arg(mchild(el, 'e'));
        return on(pr, 'degHide') || !deg.trim() ? `\\sqrt${group(e)}` : `\\sqrt[${deg.trim()}]${group(e)}`;
      }
      case 'sSup':
        return `${this.base(mchild(el, 'e'))}^${group(this.arg(mchild(el, 'sup')))}`;
      case 'sSub':
        return `${this.base(mchild(el, 'e'))}_${group(this.arg(mchild(el, 'sub')))}`;
      case 'sSubSup':
        return `${this.base(mchild(el, 'e'))}_${group(this.arg(mchild(el, 'sub')))}^${group(this.arg(mchild(el, 'sup')))}`;
      case 'sPre':
        return `{}_${group(this.arg(mchild(el, 'sub')))}^${group(this.arg(mchild(el, 'sup')))}${this.base(mchild(el, 'e'))}`;
      case 'd':
        return this.delim(el);
      case 'nary': {
        const pr = mchild(el, 'naryPr');
        const chr = mval(pr, 'chr') ?? '∫';
        let s = NARY[chr] ?? chr;
        if (mval(pr, 'limLoc') === 'undOvr' && chr !== '∑' && chr !== '∏' && !NARY[chr]?.startsWith('\\big')) s += '\\limits';
        if (!on(pr, 'subHide')) s += `_${group(this.arg(mchild(el, 'sub')))}`;
        if (!on(pr, 'supHide')) s += `^${group(this.arg(mchild(el, 'sup')))}`;
        return `${s} ${this.arg(mchild(el, 'e'))}`;
      }
      case 'func': {
        const name = this.arg(mchild(el, 'fName')).trim();
        const e = this.arg(mchild(el, 'e')).trim();
        return `${name}${/^[\\({[]/.test(e) ? '' : ' '}${e}`;
      }
      case 'limLow': {
        const lim = this.arg(mchild(el, 'lim'));
        const brace = onlyChild(mchild(el, 'e'), 'groupChr');
        if (brace && (mval(mchild(brace, 'groupChrPr'), 'chr') ?? '⏟') === '⏟') {
          return `\\underbrace${group(this.arg(mchild(brace, 'e')))}_${group(lim)}`;
        }
        const e = this.arg(mchild(el, 'e')).trim();
        const bare = e.replace(/^\\operatorname\{(\w+)\}$/, '$1').replace(/^\\/, '');
        if (FUNCS.has(bare)) return `\\${bare}_${group(lim)}`;
        return `\\underset${group(lim)}${group(e)}`;
      }
      case 'limUpp': {
        const lim = this.arg(mchild(el, 'lim'));
        const brace = onlyChild(mchild(el, 'e'), 'groupChr');
        if (brace && mval(mchild(brace, 'groupChrPr'), 'chr') === '⏞') {
          return `\\overbrace${group(this.arg(mchild(brace, 'e')))}^${group(lim)}`;
        }
        return `\\overset${group(lim)}${group(this.arg(mchild(el, 'e')))}`;
      }
      case 'acc': {
        const chr = mval(mchild(el, 'accPr'), 'chr') ?? '̂';
        return `${ACCENTS[chr] ?? '\\hat'}${group(this.arg(mchild(el, 'e')))}`;
      }
      case 'bar': {
        const pos = mval(mchild(el, 'barPr'), 'pos') ?? 'bot';
        return `${pos === 'top' ? '\\overline' : '\\underline'}${group(this.arg(mchild(el, 'e')))}`;
      }
      case 'groupChr': {
        const pr = mchild(el, 'groupChrPr');
        const chr = mval(pr, 'chr') ?? '⏟';
        const top = mval(pr, 'pos') === 'top';
        const e = group(this.arg(mchild(el, 'e')));
        if (chr === '⏞') return `\\overbrace${e}`;
        if (chr === '⏟') return `\\underbrace${e}`;
        if (chr === '⏜' || chr === '⌢') return `\\overset{\\frown}${e}`;
        if (chr === '→') return top ? `\\overrightarrow${e}` : `\\underrightarrow${e}`;
        if (chr === '←') return top ? `\\overleftarrow${e}` : `\\underleftarrow${e}`;
        if (chr === '↔') return top ? `\\overleftrightarrow${e}` : `\\underleftrightarrow${e}`;
        return top ? `\\overset{${chr}}${e}` : `\\underset{${chr}}${e}`;
      }
      case 'borderBox': {
        const pr = mchild(el, 'borderBoxPr');
        const e = group(this.arg(mchild(el, 'e')));
        if (on(pr, 'strikeBLTR')) return `\\cancel${e}`;
        if (on(pr, 'strikeTLBR')) return `\\bcancel${e}`;
        if (on(pr, 'strikeH')) return `\\sout${e}`;
        return `\\boxed${e}`;
      }
      case 'box':
      case 'phant':
        return this.arg(mchild(el, 'e'));
      case 'eqArr': {
        const rows = elementChildren(el).filter((c) => c.localName === 'e').map((r) => this.arg(r).trim());
        // Word's numbered equation: "equation # (n)" — keep only the equation.
        if (rows.length === 1 && rows[0].includes('\\#')) return rows[0].slice(0, rows[0].indexOf('\\#')).trim();
        return `\\begin{aligned}${rows.join('\\\\')}\\end{aligned}`;
      }
      case 'm': {
        const rows = elementChildren(el)
          .filter((c) => c.localName === 'mr')
          .map((r) => elementChildren(r).filter((c) => c.localName === 'e').map((c) => this.arg(c).trim()).join('&'));
        return `\\begin{matrix}${rows.join('\\\\')}\\end{matrix}`;
      }
      default:
        return '';
    }
  }

  private base(e: Element | null): string {
    const s = this.arg(e).trim();
    return /^(\\[a-zA-Z]+|[^\\{}])$/.test(s) || /^\{.*\}$/.test(s) ? s : group(s);
  }

  private delim(el: Element): string {
    const pr = mchild(el, 'dPr');
    const beg = mval(pr, 'begChr') ?? '(';
    const end = mval(pr, 'endChr') ?? ')';
    const sep = mval(pr, 'sepChr') ?? '|';
    const es = elementChildren(el).filter((c) => c.namespaceURI === M_NS && c.localName === 'e');

    // A system of equations: { + eqArr with no closing delimiter.
    if (beg === '{' && end === '' && es.length === 1) {
      const kids = elementChildren(es[0]);
      if (kids.length === 1 && kids[0].localName === 'eqArr') {
        const rows = elementChildren(kids[0]).filter((c) => c.localName === 'e').map((r) => this.arg(r).trim());
        return `\\begin{cases}${rows.join('\\\\')}\\end{cases}`;
      }
    }
    // \binom: a bar-less fraction in parentheses.
    const frac = es.length === 1 && beg === '(' && end === ')' ? onlyChild(es[0], 'f') : null;
    if (frac && mval(mchild(frac, 'fPr'), 'type') === 'noBar') {
      return `\\binom${group(this.arg(mchild(frac, 'num')))}${group(this.arg(mchild(frac, 'den')))}`;
    }
    // Matrices with brackets.
    if (es.length === 1) {
      const kids = elementChildren(es[0]);
      if (kids.length === 1 && kids[0].localName === 'm') {
        const env = { '(': 'pmatrix', '[': 'bmatrix', '|': 'vmatrix', '‖': 'Vmatrix', '{': 'Bmatrix' }[beg];
        if (env && (DELIMS[beg]?.[1] === delimLatex(end, 1) || (beg === '|' && end === '|'))) {
          return this.node(kids[0]).replace(/\\(begin|end)\{matrix\}/g, `\\$1{${env}}`);
        }
      }
    }
    const inner = es.map((e) => this.arg(e)).join(sep === '|' ? '\\mid ' : sep);
    return `\\left${delimLatex(beg, 0)}${inner}\\right${delimLatex(end, 1)}`;
  }

  private run(el: Element): string {
    const rpr = mchild(el, 'rPr');
    let txt = '';
    for (const c of elementChildren(el)) if (c.localName === 't') txt += c.textContent ?? '';
    if (!txt) return '';
    // Alignment point inside an equation array.
    const wrpr = elementChildren(el).find((c) => c.localName === 'rPr' && c.namespaceURI !== M_NS) ?? null;
    return (rpr && mchild(rpr, 'aln') ? '&' : '') + this.runText(txt, rpr, wrpr);
  }

  private runText(txt: string, rpr: Element | null, wrpr: Element | null = null): string {
    if (on(rpr, 'nor')) {
      // MathType look: single letters/digits and function names are "normal text" runs
      // in the letter font — read them back as math, not as \text{}.
      const italic = !!wrpr && Array.from(wrpr.children).some((c) => c.localName === 'i');
      const bold = !!wrpr && Array.from(wrpr.children).some((c) => c.localName === 'b');
      const t = txt.trim();
      if (/^\d+(\.\d+)?$/.test(t)) return bold ? `\\mathbf{${t}}` : t;
      if (FUNCS.has(t)) return `\\${t} `;
      if (Array.from(t).length === 1) {
        const sym = SYMBOLS[t] ?? t;
        if (/^[A-Za-z]$/.test(t)) {
          if (bold) return italic ? `\\boldsymbol{${t}}` : `\\mathbf{${t}}`;
          return italic ? t : `\\mathrm{${t}}`;
        }
        return sym;
      }
    }
    if (on(rpr, 'nor')) return `\\text{${txt.replace(/[{}\\]/g, (m) => '\\' + m)}}`;

    const sty = mval(rpr, 'sty');
    const scr = mval(rpr, 'scr');
    if (scr === 'double-struck') return `\\mathbb{${txt}}`;
    if (scr === 'script') return `\\mathcal{${txt}}`;
    if (scr === 'fraktur') return `\\mathfrak{${txt}}`;

    // Function names written as plain upright text.
    if (FUNCS.has(txt.trim())) return `\\${txt.trim()} `;
    if (/^[A-Za-z]{2,}$/.test(txt) && sty === 'p') return `\\operatorname{${txt}}`;

    const body = Array.from(txt)
      .map((ch) => SYMBOLS[ch] ?? ch)
      .join('');
    if (sty === 'b') return `\\mathbf{${body}}`;
    if (sty === 'p' && /^[A-Za-z]+$/.test(txt)) return `\\mathrm{${body}}`;
    return body;
  }
}

/** Converts an <m:oMath>/<m:oMathPara> fragment (namespace prefix "m:") to LaTeX. */
export function ommlToLatex(omml: string): string {
  const wrapped =
    `<root xmlns:m="${M_NS}" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${omml}</root>`;
  const doc = parseXml(wrapped);
  const reader = new OmmlReader();
  return elementChildren(doc.documentElement)
    .map((c) => reader.node(c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
