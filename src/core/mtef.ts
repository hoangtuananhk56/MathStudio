/**
 * MathType equations (OLE "Equation.DSMT4" / "Equation.3") -> LaTeX.
 *
 * An embedded MathType object is an OLE compound file whose "Equation Native"
 * stream holds a 28-byte header followed by MTEF (MathType Equation Format),
 * documented by Design Science. This module parses MTEF v5 (MathType 5–7) and
 * v3 (Equation Editor 3.x / MathType 3–4) into a small tree and prints LaTeX.
 */

/* ------------------------------- data model ------------------------------- */

export interface MtChar {
  kind: 'char';
  code: number;
  typeface: number;
  /** MathType marks the first character of a function name ("sin"). */
  funcStart: boolean;
  embell: number[];
}
export interface MtTmpl {
  kind: 'tmpl';
  selector: number;
  variation: number;
  /** Sub-objects in MTEF order (lines, piles, and for fences/operators also chars). */
  items: MtNode[];
}
export interface MtLine {
  kind: 'line';
  items: MtNode[];
}
export interface MtPile {
  kind: 'pile';
  halign: number;
  lines: MtNode[];
}
export interface MtMatrix {
  kind: 'matrix';
  rows: number;
  cols: number;
  cells: MtNode[];
}
export type MtNode = MtChar | MtTmpl | MtLine | MtPile | MtMatrix;

/* -------------------------------- constants -------------------------------- */

const R = { END: 0, LINE: 1, CHAR: 2, TMPL: 3, PILE: 4, MATRIX: 5, EMBELL: 6, RULER: 7, FONT_STYLE_DEF: 8, SIZE: 9, FULL: 10, SUB: 11, SUB2: 12, SYM: 13, SUBSYM: 14, COLOR: 15, COLOR_DEF: 16, FONT_DEF: 17, EQN_PREFS: 18, ENCODING_DEF: 19 };

const OPT_NUDGE = 0x08;
const OPT_CHAR_EMBELL = 0x01;
const OPT_CHAR_FUNC_START = 0x02;
const OPT_CHAR_ENC_CHAR_8 = 0x04;
const OPT_CHAR_ENC_CHAR_16 = 0x10;
const OPT_CHAR_ENC_NO_MTCODE = 0x20;
const OPT_LINE_NULL = 0x01;
const OPT_LP_RULER = 0x02;
const OPT_LINE_LSPACE = 0x04;

/** Typefaces (MTEF "fn…" values). */
export const FN = { TEXT: 1, FUNCTION: 2, VARIABLE: 3, LCGREEK: 4, UCGREEK: 5, SYMBOL: 6, VECTOR: 7, NUMBER: 8, USER1: 9, USER2: 10, MTEXTRA: 11, TEXT_FE: 12, EXPAND: 22, MARKER: 23, SPACE: 24 };

/* --------------------------------- reader --------------------------------- */

class Reader {
  pos = 0;
  constructor(private readonly b: Uint8Array) {}
  get done(): boolean {
    return this.pos >= this.b.length;
  }
  u8(): number {
    if (this.pos >= this.b.length) throw new Error('MTEF: unexpected end of data');
    return this.b[this.pos++];
  }
  u16(): number {
    const v = this.b[this.pos] | (this.b[this.pos + 1] << 8);
    this.pos += 2;
    return v;
  }
  cstr(): string {
    let s = '';
    for (let c = this.u8(); c !== 0; c = this.u8()) s += String.fromCharCode(c);
    return s;
  }
}

/* ------------------------------- MTEF parser ------------------------------- */

class MtefParser {
  private readonly r: Reader;
  private version = 5;
  /** Full-size font in points from the equation preferences, if present. */
  fullSizePt: number | null = null;

  constructor(bytes: Uint8Array) {
    this.r = new Reader(bytes);
  }

  parse(): MtNode[] {
    const r = this.r;
    this.version = r.u8();
    if (this.version === 5) {
      r.u8(); // platform
      r.u8(); // product
      r.u8(); // product version
      r.u8(); // product subversion
      r.cstr(); // application key, e.g. "DSMT7"
      r.u8(); // equation options
    } else if (this.version === 3 || this.version === 2) {
      r.u8(); // platform
      r.u8(); // product
      r.u8(); // product version
      r.u8(); // product subversion
    } else {
      throw new Error(`MTEF version ${this.version} is not supported`);
    }
    return this.objectList();
  }

  /** Reads records until END; returns the structural ones. */
  private objectList(): MtNode[] {
    const out: MtNode[] = [];
    while (!this.r.done) {
      const { tag, options } = this.header();
      if (tag === R.END) break;
      const node = this.record(tag, options);
      if (node) out.push(node);
    }
    return out;
  }

  /** v5: tag byte then options byte; v3: high nibble = options, low nibble = tag. */
  private header(): { tag: number; options: number } {
    const b = this.r.u8();
    if (this.version === 5) {
      if (b === R.END || b >= 100) return { tag: b, options: 0 };
      if (b === R.FULL || b === R.SUB || b === R.SUB2 || b === R.SYM || b === R.SUBSYM) return { tag: b, options: 0 };
      if (b === R.SIZE || b === R.RULER || b === R.FONT_STYLE_DEF || b === R.COLOR || b === R.FONT_DEF || b === R.ENCODING_DEF) {
        return { tag: b, options: 0 };
      }
      return { tag: b, options: this.r.u8() };
    }
    return { tag: b & 0x0f, options: (b & 0xf0) >> 4 };
  }

  private nudge(options: number): void {
    if (!(options & OPT_NUDGE)) return;
    const dx = this.r.u8();
    const dy = this.r.u8();
    if (dx === 128 && dy === 128) {
      this.r.u16();
      this.r.u16();
    }
  }

  private record(tag: number, options: number): MtNode | null {
    const r = this.r;
    switch (tag) {
      case R.LINE: {
        this.nudge(options);
        if (this.version === 5 && options & OPT_LINE_LSPACE) r.u16();
        if (options & OPT_LP_RULER) this.ruler();
        if (options & OPT_LINE_NULL) return { kind: 'line', items: [] };
        return { kind: 'line', items: this.objectList() };
      }
      case R.CHAR:
        return this.char(options);
      case R.TMPL: {
        this.nudge(options);
        const selector = r.u8();
        let variation = r.u8();
        if (this.version === 5 && variation & 0x80) variation = (variation & 0x7f) | (r.u8() << 8);
        r.u8(); // template-specific options
        return { kind: 'tmpl', selector, variation, items: this.objectList() };
      }
      case R.PILE: {
        this.nudge(options);
        const halign = r.u8();
        r.u8(); // valign
        if (options & OPT_LP_RULER) this.ruler();
        return { kind: 'pile', halign, lines: this.objectList() };
      }
      case R.MATRIX: {
        this.nudge(options);
        r.u8(); // valign
        r.u8(); // h_just
        r.u8(); // v_just
        const rows = r.u8();
        const cols = r.u8();
        const skipParts = (n: number) => {
          for (let i = 0; i < Math.ceil((n * 2) / 8); i++) r.u8();
        };
        skipParts(rows + 1);
        skipParts(cols + 1);
        return { kind: 'matrix', rows, cols, cells: this.objectList() };
      }
      case R.EMBELL:
        // Embellishments are read inside char(); a stray one is skipped.
        this.nudge(options);
        r.u8();
        return null;
      case R.RULER:
        this.ruler(true);
        return null;
      case R.FONT_STYLE_DEF:
        // v5: FONT_STYLE_DEF [font def index][char style]; v3: FONT [typeface][style][name].
        r.u8();
        r.u8();
        if (this.version !== 5) r.cstr();
        return null;
      case R.SIZE: {
        const lsize = r.u8();
        if (lsize === 101) r.u16();
        else if (lsize === 100) {
          r.u8();
          r.u16();
        } else r.u8();
        return null;
      }
      case R.FULL:
      case R.SUB:
      case R.SUB2:
      case R.SYM:
      case R.SUBSYM:
        return null;
      case R.COLOR:
        r.u8();
        return null;
      case R.COLOR_DEF: {
        const n = options & 0x01 ? 4 : 3;
        for (let i = 0; i < n; i++) r.u16();
        if (options & 0x04) r.cstr();
        return null;
      }
      case R.FONT_DEF:
        r.u8();
        r.cstr();
        return null;
      case R.EQN_PREFS:
        this.eqnPrefs();
        return null;
      case R.ENCODING_DEF:
        r.cstr();
        return null;
      default:
        if (tag >= 100) {
          const len = r.u16();
          r.pos += len;
          return null;
        }
        throw new Error(`MTEF: unknown record ${tag} at byte ${r.pos}`);
    }
  }

  private ruler(alreadyTagged = false): void {
    const r = this.r;
    if (!alreadyTagged && this.version === 5) r.u8(); // RULER tag inside LINE/PILE
    const n = r.u8();
    for (let i = 0; i < n; i++) {
      r.u8();
      r.u16();
    }
  }

  private char(options: number): MtChar {
    const r = this.r;
    this.nudge(options);
    const typeface = r.u8() - 128;
    let code = 0;
    if (this.version === 5) {
      if (!(options & OPT_CHAR_ENC_NO_MTCODE)) code = r.u16();
      if (options & OPT_CHAR_ENC_CHAR_8) {
        const c8 = r.u8();
        if (!code) code = c8;
      }
      if (options & OPT_CHAR_ENC_CHAR_16) {
        const c16 = r.u16();
        if (!code) code = c16;
      }
    } else {
      code = r.u16();
    }
    const embell: number[] = [];
    if (options & OPT_CHAR_EMBELL) {
      // A list of EMBELL records terminated by END.
      for (;;) {
        const { tag, options: eo } = this.header();
        if (tag === R.END) break;
        if (tag !== R.EMBELL) throw new Error(`MTEF: expected EMBELL, got ${tag}`);
        this.nudge(eo);
        embell.push(r.u8());
      }
    }
    return { kind: 'char', code, typeface, funcStart: !!(options & OPT_CHAR_FUNC_START), embell };
  }

  /**
   * Equation preferences: nibble-encoded dimension arrays (sizes, spacing) and a style
   * array. Only the first size ("full" size) is kept, converted to points.
   */
  private eqnPrefs(): void {
    const r = this.r;
    const dims = (): { unit: number; value: number }[] => {
      const n = r.u8();
      const out: { unit: number; value: number }[] = [];
      let nibbleBuf = -1;
      const nibble = () => {
        if (nibbleBuf >= 0) {
          const v = nibbleBuf;
          nibbleBuf = -1;
          return v;
        }
        const b = r.u8();
        nibbleBuf = b & 0x0f;
        return b >> 4;
      };
      while (out.length < n) {
        const unit = nibble();
        let text = '';
        for (let d = nibble(); d !== 0x0f; d = nibble()) text += d <= 9 ? String(d) : d === 0x0a ? '.' : d === 0x0b ? '-' : '';
        out.push({ unit, value: parseFloat(text) || 0 });
      }
      // Each array is padded to a whole byte.
      return out;
    };
    const sizes = dims();
    // Units: 0 inch, 1 cm, 2 point, 3 pica, 4 percent.
    const full = sizes[0];
    if (full) {
      const toPt = [72, 72 / 2.54, 1, 12, 0][full.unit] ?? 0;
      if (toPt && full.value > 0) this.fullSizePt = full.value * toPt;
    }
    dims(); // spaces
    const styles = r.u8();
    for (let i = 0; i < styles; i++) {
      const font = r.u8();
      if (font) r.u8();
    }
  }
}

export function parseMtef(bytes: Uint8Array): MtNode[] {
  return new MtefParser(bytes).parse();
}

/** Parses MTEF and also reports the equation's full font size (points), if recorded. */
export function parseMtefWithSize(bytes: Uint8Array): { nodes: MtNode[]; fullSizePt: number | null } {
  const p = new MtefParser(bytes);
  const nodes = p.parse();
  return { nodes, fullSizePt: p.fullSizePt };
}

/** The MTEF payload of an "Equation Native" stream (skips the 28-byte EQNOLEFILEHDR). */
export function mtefFromEquationNative(stream: Uint8Array): Uint8Array {
  const cbHdr = stream[0] | (stream[1] << 8);
  return stream.subarray(cbHdr || 28);
}

/* -------------------------------- to LaTeX --------------------------------- */

const GREEK: Record<number, string> = {
  0x03b1: '\\alpha', 0x03b2: '\\beta', 0x03b3: '\\gamma', 0x03b4: '\\delta', 0x03b5: '\\epsilon', 0x03f5: '\\epsilon',
  0x03b6: '\\zeta', 0x03b7: '\\eta', 0x03b8: '\\theta', 0x03d1: '\\vartheta', 0x03b9: '\\iota', 0x03ba: '\\kappa',
  0x03bb: '\\lambda', 0x03bc: '\\mu', 0x03bd: '\\nu', 0x03be: '\\xi', 0x03bf: 'o', 0x03c0: '\\pi', 0x03d6: '\\varpi',
  0x03c1: '\\rho', 0x03f1: '\\varrho', 0x03c3: '\\sigma', 0x03c2: '\\varsigma', 0x03c4: '\\tau', 0x03c5: '\\upsilon',
  0x03c6: '\\varphi', 0x03d5: '\\phi', 0x03c7: '\\chi', 0x03c8: '\\psi', 0x03c9: '\\omega',
  0x0393: '\\Gamma', 0x0394: '\\Delta', 0x0398: '\\Theta', 0x039b: '\\Lambda', 0x039e: '\\Xi', 0x03a0: '\\Pi',
  0x03a3: '\\Sigma', 0x03a5: '\\Upsilon', 0x03a6: '\\Phi', 0x03a8: '\\Psi', 0x03a9: '\\Omega',
};

const SYMBOLS: Record<number, string> = {
  0x00b1: '\\pm', 0x2213: '\\mp', 0x00d7: '\\times', 0x00f7: '\\div', 0x22c5: '\\cdot', 0x00b7: '\\cdot', 0x2219: '\\cdot',
  0x2212: '-', 0x2260: '\\ne', 0x2264: '\\le', 0x2265: '\\ge', 0x2248: '\\approx', 0x2261: '\\equiv', 0x223c: '\\sim',
  0x2245: '\\cong', 0x2243: '\\simeq', 0x221d: '\\propto', 0x226a: '\\ll', 0x226b: '\\gg', 0x2192: '\\to',
  0x2190: '\\leftarrow', 0x2194: '\\leftrightarrow', 0x21d2: '\\Rightarrow', 0x21d0: '\\Leftarrow', 0x21d4: '\\Leftrightarrow',
  0x2191: '\\uparrow', 0x2193: '\\downarrow', 0x21a6: '\\mapsto', 0x221e: '\\infty', 0x2202: '\\partial', 0x2207: '\\nabla',
  0x2208: '\\in', 0x2209: '\\notin', 0x220b: '\\ni', 0x2282: '\\subset', 0x2283: '\\supset', 0x2286: '\\subseteq',
  0x2287: '\\supseteq', 0x2284: '\\not\\subset', 0x222a: '\\cup', 0x2229: '\\cap', 0x2205: '\\varnothing', 0x2216: '\\setminus',
  0x2200: '\\forall', 0x2203: '\\exists', 0x00ac: '\\neg', 0x2227: '\\land', 0x2228: '\\lor', 0x2234: '\\therefore',
  0x2235: '\\because', 0x2220: '\\angle', 0x2221: '\\measuredangle', 0x22a5: '\\perp', 0x2225: '\\parallel', 0x2016: '\\|',
  0x25b3: '\\triangle', 0x2206: '\\triangle', 0x00b0: '^{\\circ}', 0x2218: '\\circ', 0x2032: "'", 0x2033: "''",
  0x2026: '\\ldots', 0x22ef: '\\cdots', 0x22ee: '\\vdots', 0x22f1: '\\ddots', 0x2295: '\\oplus', 0x2297: '\\otimes',
  0x2211: '\\sum', 0x220f: '\\prod', 0x222b: '\\int', 0x222c: '\\iint', 0x222d: '\\iiint', 0x222e: '\\oint',
  0x2329: '\\langle', 0x232a: '\\rangle', 0x27e8: '\\langle', 0x27e9: '\\rangle', 0x210f: '\\hbar', 0x2113: '\\ell',
  0x211d: '\\mathbb{R}', 0x2115: '\\mathbb{N}', 0x2124: '\\mathbb{Z}', 0x211a: '\\mathbb{Q}', 0x2102: '\\mathbb{C}',
  0x007b: '\\{', 0x007d: '\\}', 0x0025: '\\%', 0x0023: '\\#', 0x0026: '\\&', 0x005f: '\\_', 0x0024: '\\$',
  0x005c: '\\backslash', 0x2223: '\\mid', 0x2224: '\\nmid',
};

/** MathType's private-use characters (MT Extra and spacing). */
const MT_PRIVATE: Record<number, string> = {
  0xef00: '', // zero-width / marker
  0xef01: '', // 1/18 em (non-breaking hairline)
  0xef02: '\\,', // thin space
  0xef03: '\\:', // medium space
  0xef04: '\\;', // thick space
  0xef05: '\\quad ', // em space
  0xef06: '\\;', // 2/18 em?
  0xef07: '', // alignment mark
  0xef08: '\\,', // 1pt space
  0xec00: '\\to', // MT Extra arrows (common in Vietnamese textbooks)
  0xe98f: '\\Rightarrow',
  0xe990: '\\Leftrightarrow',
  0xe918: '\\ldots',
  0xe927: '\\cdots',
  0xe919: '\\vdots',
  0xe91a: '\\ddots',
};

const EMBELL: Record<number, (s: string) => string> = {
  2: (s) => `\\dot{${s}}`, 3: (s) => `\\ddot{${s}}`, 4: (s) => `\\dddot{${s}}`, 5: (s) => `${s}'`, 6: (s) => `${s}''`,
  7: (s) => `{}^{\\prime}${s}`, 8: (s) => `\\tilde{${s}}`, 9: (s) => `\\hat{${s}}`, 10: (s) => `\\not{${s}}`,
  11: (s) => `\\vec{${s}}`, 12: (s) => `\\overleftarrow{${s}}`, 13: (s) => `\\overleftrightarrow{${s}}`,
  14: (s) => `\\vec{${s}}`, 15: (s) => `\\overleftarrow{${s}}`, 16: (s) => `\\bar{${s}}`, 17: (s) => `\\bar{${s}}`,
  18: (s) => `${s}'''`, 19: (s) => `\\overset{\\frown}{${s}}`, 20: (s) => `\\overset{\\smile}{${s}}`,
  21: (s) => `\\cancel{${s}}`, 22: (s) => `\\bcancel{${s}}`, 23: (s) => `\\cancel{${s}}`, 24: (s) => `\\ddot{${s}}`,
  25: (s) => `\\underset{\\cdot}{${s}}`, 26: (s) => `\\underset{\\cdot\\cdot}{${s}}`, 29: (s) => `\\underline{${s}}`,
  30: (s) => `\\underset{\\sim}{${s}}`, 33: (s) => `\\underrightarrow{${s}}`, 34: (s) => `\\underleftarrow{${s}}`,
};

const BIG_OPS: Record<number, string> = { 16: '\\sum', 17: '\\prod', 18: '\\coprod', 19: '\\bigcup', 20: '\\bigcap', 21: '\\int', 22: '\\sum' };

const FENCES: Record<number, [string, string]> = {
  0: ['\\langle', '\\rangle'], 1: ['(', ')'], 2: ['\\{', '\\}'], 3: ['[', ']'], 4: ['|', '|'],
  5: ['\\|', '\\|'], 6: ['\\lfloor', '\\rfloor'], 7: ['\\lceil', '\\rceil'], 8: ['[\\![', ']\\!]'],
};

const FUNCTION_NAMES = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth', 'log', 'ln',
  'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'dim', 'gcd', 'deg', 'arg', 'ker', 'Pr', 'mod',
]);

function isChar(n: MtNode | undefined): n is MtChar {
  return !!n && n.kind === 'char';
}

class LatexWriter {
  /** A whole equation (top-level object list). */
  equation(nodes: MtNode[]): string {
    return tidy(this.list(nodes));
  }

  private list(nodes: MtNode[]): string {
    // A top-level PILE is a multi-line equation.
    let out = '';
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.kind === 'char') {
        // Group runs of text / function characters.
        if (n.typeface === FN.TEXT || n.typeface === FN.TEXT_FE) {
          let text = '';
          let j = i;
          while (j < nodes.length && isChar(nodes[j]) && [FN.TEXT, FN.TEXT_FE].includes((nodes[j] as MtChar).typeface) && !(nodes[j] as MtChar).embell.length) {
            text += String.fromCodePoint((nodes[j] as MtChar).code);
            j++;
          }
          if (text) {
            // Spaces typed next to an operator: the operator already brings its own spacing.
            const onlySpace = /^[\s ]+$/.test(text);
            if (!(onlySpace && (isOperatorChar(nodes[i - 1]) || isOperatorChar(nodes[j])))) out += textGroup(text);
            i = j - 1;
            continue;
          }
        }
        if (n.typeface === FN.FUNCTION) {
          let name = '';
          let j = i;
          while (j < nodes.length && isChar(nodes[j]) && (nodes[j] as MtChar).typeface === FN.FUNCTION && (j === i || !(nodes[j] as MtChar).funcStart)) {
            name += String.fromCodePoint((nodes[j] as MtChar).code);
            j++;
          }
          if (/^[A-Za-z]+$/.test(name) && name.length > 1) {
            out += FUNCTION_NAMES.has(name) ? `\\${name} ` : `\\operatorname{${name}}`;
            i = j - 1;
            continue;
          }
        }
        if ((n.code === 0x20 || n.code === 0xa0) && (isOperatorChar(nodes[i - 1]) || isOperatorChar(nodes[i + 1]))) continue;
        out += this.char(n);
        continue;
      }
      if (n.kind === 'tmpl' && (n.selector === 27 || n.selector === 28 || n.selector === 29)) {
        // Scripts attach to whatever precedes them; LaTeX needs a base.
        if (!out || /[\s(=+\-,]$/.test(out)) out += '{}';
        out += this.scripts(n);
        continue;
      }
      out += this.node(n);
    }
    return out;
  }

  private node(n: MtNode): string {
    switch (n.kind) {
      case 'char':
        return this.char(n);
      case 'line':
        return this.list(n.items);
      case 'pile':
        return this.pile(n, 'aligned');
      case 'matrix':
        return this.matrix(n, 'matrix');
      case 'tmpl':
        return this.tmpl(n);
    }
  }

  private char(c: MtChar): string {
    let s = charLatex(c);
    for (const e of c.embell) s = (EMBELL[e] ?? ((x: string) => x))(s);
    return s;
  }

  private slot(n: MtNode | undefined): string {
    return n ? tidy(this.node(n)) : '';
  }

  private scripts(t: MtTmpl): string {
    const [sub, sup] = t.items;
    const subS = this.slot(sub);
    const supS = this.slot(sup);
    let s = '';
    if (subS) s += `_{${subS}}`;
    if (supS) s += `^{${supS}}`;
    return s || '{}';
  }

  private pile(p: MtPile, env: 'aligned' | 'cases' | 'matrix'): string {
    const rows = p.lines.map((l) => tidy(this.node(l)));
    if (env === 'cases') return `\\begin{cases}${rows.join('\\\\')}\\end{cases}`;
    if (rows.length === 1) return rows[0];
    return `\\begin{matrix}${rows.join('\\\\')}\\end{matrix}`;
  }

  private matrix(m: MtMatrix, env: string): string {
    const rows: string[] = [];
    for (let r = 0; r < m.rows; r++) {
      const cells: string[] = [];
      for (let c = 0; c < m.cols; c++) cells.push(this.slot(m.cells[r * m.cols + c]));
      rows.push(cells.join('&'));
    }
    return `\\begin{${env}}${rows.join('\\\\')}\\end{${env}}`;
  }

  private tmpl(t: MtTmpl): string {
    const v = t.variation;
    const it = t.items;
    switch (t.selector) {
      case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7: case 8: {
        // Fences: [main][left char][right char]; variation bits say which sides are present.
        const [l, r] = FENCES[t.selector];
        const left = v & 0x0001 ? l : '.';
        const right = v & 0x0002 ? r : '.';
        const main = it[0];
        // A brace or bracket with only the left side around a pile = system of equations.
        if (main && main.kind === 'line' && main.items.length === 1 && main.items[0].kind === 'pile' && right === '.') {
          const pile = main.items[0] as MtPile;
          if (t.selector === 2) return this.pile(pile, 'cases');
          const rows = pile.lines.map((x) => tidy(this.node(x)));
          return `\\left${left}\\begin{aligned}${rows.map((r2) => `&${r2}`).join('\\\\')}\\end{aligned}\\right.`;
        }
        if (main && main.kind === 'line' && main.items.length === 1 && main.items[0].kind === 'matrix') {
          const env = { 1: 'pmatrix', 3: 'bmatrix', 4: 'vmatrix', 5: 'Vmatrix', 2: 'Bmatrix' }[t.selector as 1 | 2 | 3 | 4 | 5];
          if (env && left !== '.' && right !== '.') return this.matrix(main.items[0] as MtMatrix, env);
        }
        return `\\left${left}${this.slot(main)}\\right${right}`;
      }
      case 9: {
        // Interval: low nibble = left fence, next nibble = right fence (0 "(", 1 ")", 2 "[", 3 "]").
        const ch = ['(', ')', '[', ']'];
        return `\\left${ch[v & 0x3]}${this.slot(it[0])}\\right${ch[(v >> 4) & 0x3]}`;
      }
      case 10: {
        const idx = this.slot(it[1]);
        return v & 1 && idx ? `\\sqrt[${idx}]{${this.slot(it[0])}}` : `\\sqrt{${this.slot(it[0])}}`;
      }
      case 11: {
        const num = this.slot(it[0]);
        const den = this.slot(it[1]);
        if (v & 0x0002) return `{${num}}/{${den}}`;
        return v & 0x0001 ? `\\tfrac{${num}}{${den}}` : `\\frac{${num}}{${den}}`;
      }
      case 12:
        return `\\underline{${this.slot(it[0])}}`;
      case 13:
        return `\\overline{${this.slot(it[0])}}`;
      case 14: {
        const top = this.slot(it[0]);
        const bottom = this.slot(it[1]);
        const arrow = v & 0x0002 ? '\\xleftarrow' : v & 0x0004 ? '\\xleftrightarrow' : '\\xrightarrow';
        return bottom ? `${arrow}[${bottom}]{${top}}` : `${arrow}{${top}}`;
      }
      case 15: case 16: case 17: case 18: case 19: case 20: case 21: case 22: {
        // Big operators: [main][lower][upper][operator char].
        const op = t.selector === 15 ? integralSymbol(v) : opFromChar(it[3]) ?? BIG_OPS[t.selector];
        const lower = this.slot(it[1]);
        const upper = this.slot(it[2]);
        const limits = t.selector !== 15 && v & 0x0040 ? '\\limits' : '';
        let s = op + limits;
        if (lower) s += `_{${lower}}`;
        if (upper) s += `^{${upper}}`;
        return `${s} ${this.slot(it[0])}`;
      }
      case 23: {
        const lower = this.slot(it[1]);
        const upper = this.slot(it[2]);
        let s = `\\underset{${lower}}{${this.slot(it[0])}}`;
        if (upper) s = `\\overset{${upper}}{${s}}`;
        // "lim" written as a function name inside the main slot becomes \lim_{…}.
        const m = /^\\(lim|max|min|sup|inf) ?$/.exec(this.slot(it[0]));
        return m && lower && !upper ? `\\${m[1]}_{${lower}}` : s;
      }
      case 24: {
        const label = this.slot(it[1]);
        return v & 1
          ? `\\overbrace{${this.slot(it[0])}}${label ? `^{${label}}` : ''}`
          : `\\underbrace{${this.slot(it[0])}}${label ? `_{${label}}` : ''}`;
      }
      case 25:
        return v & 1 ? `\\overbracket{${this.slot(it[0])}}` : `\\underbracket{${this.slot(it[0])}}`;
      case 26:
        return `${this.slot(it[2])}\\overline{\\left)${this.slot(it[0])}\\right.}`;
      case 27: case 28: case 29:
        return this.scripts(t);
      case 30:
        return `\\left\\langle ${this.slot(it[0])}\\middle|${this.slot(it[1])}\\right\\rangle`;
      case 31: {
        const body = this.slot(it[0]);
        if (v & 0x0004) return v & 0x0001 && v & 0x0002 ? `\\underleftrightarrow{${body}}` : v & 0x0001 ? `\\underleftarrow{${body}}` : `\\underrightarrow{${body}}`;
        return v & 0x0001 && v & 0x0002 ? `\\overleftrightarrow{${body}}` : v & 0x0001 ? `\\overleftarrow{${body}}` : `\\overrightarrow{${body}}`;
      }
      case 32:
        return `\\widetilde{${this.slot(it[0])}}`;
      case 33:
        return `\\widehat{${this.slot(it[0])}}`;
      case 34:
        return `\\overset{\\frown}{${this.slot(it[0])}}`;
      case 35:
        return `\\left.${this.slot(it[0])}\\right|_{${this.slot(it[1])}}`;
      case 36:
        return `\\cancel{${this.slot(it[0])}}`;
      case 37:
        return `\\boxed{${this.slot(it[0])}}`;
      default:
        // Unknown template: keep its content rather than losing it.
        return it.map((x) => this.slot(x)).join(' ');
    }
  }
}

function integralSymbol(v: number): string {
  const count = v & 0x0003;
  if (v & 0x000c) return count === 2 ? '\\oiint' : '\\oint';
  return count === 2 ? '\\iint' : count === 3 ? '\\iiint' : '\\int';
}

function opFromChar(n: MtNode | undefined): string | null {
  if (!isChar(n)) return null;
  const s = SYMBOLS[n.code];
  return s && s.startsWith('\\') ? s : null;
}

function textGroup(text: string): string {
  // Plain digits/punctuation typed in text style don't need \text.
  if (/^[0-9.,;:!?()[\]+\-=<>/  ]+$/.test(text)) return text.replace(/[  ]/g, '\\ ');
  // Leading/trailing spaces become explicit "\ " outside \text (renderers trim them inside).
  const m = /^([\s ]*)([\s\S]*?)([\s ]*)$/.exec(text)!;
  const body = m[2].replace(/[\\{}$&#^_%~]/g, (c) => `\\${c}`);
  return '\\ '.repeat(m[1].length) + `\\text{${body}}` + '\\ '.repeat(m[3].length);
}

const OPERATOR_CODES = new Set([
  0x2b, 0x2d, 0x2212, 0x3d, 0x3c, 0x3e, 0x2264, 0x2265, 0x2260, 0xb1, 0xd7, 0xf7, 0x22c5, 0x3a, 0x2208, 0x2209,
  0x2282, 0x2283, 0x2286, 0x2287, 0x2192, 0x21d2, 0x21d4, 0x2248, 0x2261, 0x22ee,
]);

function isOperatorChar(n: MtNode | undefined): boolean {
  return isChar(n) && n.typeface !== FN.TEXT && OPERATOR_CODES.has(n.code);
}

function charLatex(c: MtChar): string {
  const code = c.code;
  if (MT_PRIVATE[code] !== undefined) return MT_PRIVATE[code];
  if (GREEK[code]) return GREEK[code] + ' ';
  if (SYMBOLS[code]) {
    const s = SYMBOLS[code];
    return /\\[a-zA-Z]+$/.test(s) ? s + ' ' : s;
  }
  const ch = String.fromCodePoint(code);
  if (c.typeface === FN.VECTOR && /[A-Za-z]/.test(ch)) return `\\mathbf{${ch}}`;
  if (c.typeface === FN.FUNCTION && /[A-Za-z]/.test(ch)) return `\\mathrm{${ch}}`;
  if (c.typeface === FN.TEXT && /[A-Za-z]/.test(ch)) return `\\text{${ch}}`;
  if (code === 0x20) return c.typeface === FN.TEXT ? '\\ ' : '';
  if (code === 0xa0) return '\\ ';
  return ch;
}

/** Collapses redundant spacing produced by command separators. */
function tidy(s: string): string {
  // Never touch an escaped space ("\ "): it is a LaTeX command, not a separator.
  return s
    .replace(/(?<!\\) {2,}/g, ' ')
    .replace(/(?<!\\) ([}^_)\]|,=+\-])/g, '$1')
    .replace(/^ +/, '')
    // Trailing spaces (typed in MathType before closing) have no effect: drop them.
    .replace(/(\s|\\ |\\[,:;]|\\quad\b|\\qquad\b)+$/, '');
}

/** MTEF bytes -> LaTeX. */
export function mtefToLatex(bytes: Uint8Array): string {
  return new LatexWriter().equation(parseMtef(bytes));
}

/** MTEF bytes -> LaTeX plus the equation's full font size in points (if recorded). */
export function mtefToLatexWithSize(bytes: Uint8Array): { latex: string; sizePt: number | null } {
  const { nodes, fullSizePt } = parseMtefWithSize(bytes);
  return { latex: new LatexWriter().equation(nodes), sizePt: fullSizePt };
}
