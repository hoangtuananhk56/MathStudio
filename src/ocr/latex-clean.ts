/**
 * Tidies the LaTeX read by the formula model into what a teacher would type:
 * "\operatorname { s i n }" → "\sin", "\left\{ \begin{matrix} … \right." → cases,
 * "\left( \begin{matrix}" → pmatrix, no spacing commands, no needless braces.
 */

type Node = string | Node[];

const TOKEN = /\\begin\s*\{[^}]*\}|\\end\s*\{[^}]*\}|\\[A-Za-z]+\*?|\\.|[{}]|\S/g;

function parse(src: string): Node[] {
  const root: Node[] = [];
  const stack: Node[][] = [root];
  for (const m of src.matchAll(TOKEN)) {
    const tok = m[0].replace(/\s+/g, '');
    const top = stack[stack.length - 1];
    if (tok === '{') {
      const g: Node[] = [];
      top.push(g);
      stack.push(g);
    } else if (tok === '}') {
      if (stack.length > 1) stack.pop();
    } else top.push(tok);
  }
  return root;
}

const isGroup = (n: Node | undefined): n is Node[] => Array.isArray(n);
const text = (n: Node): string => (isGroup(n) ? n.map(text).join('') : n);

/** Operator names written upright with their own command. */
const NAMED_OPS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth',
  'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'arg', 'deg', 'dim', 'ker', 'Pr',
]);

/** How many brace arguments a command takes (the groups after it are not free groups). */
const ARGS: Record<string, number> = {
  '\\frac': 2, '\\dfrac': 2, '\\tfrac': 2, '\\cfrac': 2, '\\binom': 2, '\\dbinom': 2, '\\underset': 2, '\\overset': 2, '\\stackrel': 2,
  '\\sqrt': 1, '\\overrightarrow': 1, '\\overleftarrow': 1, '\\widehat': 1, '\\hat': 1, '\\overline': 1, '\\underline': 1,
  '\\vec': 1, '\\bar': 1, '\\dot': 1, '\\ddot': 1, '\\tilde': 1, '\\widetilde': 1, '\\mathrm': 1, '\\mathbf': 1, '\\mathit': 1,
  '\\mathbb': 1, '\\mathcal': 1, '\\boldsymbol': 1, '\\text': 1, '\\textrm': 1, '\\textbf': 1, '\\textit': 1, '\\mbox': 1,
  '\\operatorname': 1, '\\operatorname*': 1, '\\overbrace': 1, '\\underbrace': 1, '\\boxed': 1, '\\cancel': 1,
  '\\xrightarrow': 1, '\\xleftarrow': 1, '\\pmod': 1, '\\overparen': 1, '\\arc': 1,
};

/** Spacing the model copies from the picture; Word spaces the equation itself. */
const DROP = new Set(['\\:', '\\;', '\\!', '\\hfill', '\\>', '\\enspace', '\\thinspace', '~']);

/** Bold and size switches (also the ones taking a group: \mathbf{x} → x). */
const BOLD = new Set(['\\boldsymbol', '\\bm', '\\mathbf', '\\bf', '\\boldmath', '\\large', '\\Large', '\\LARGE', '\\small', '\\normalsize', '\\displaystyle', '\\textstyle', '\\scriptstyle']);

const ENVS =/^\\(begin|end)\{(matrix|array|aligned|gathered|split|align\*?)\}$/;
const OPEN_FENCE: Record<string, string> = { '(': 'pmatrix', '[': 'bmatrix', '|': 'vmatrix', '\\|': 'Vmatrix', '\\{': 'cases', '\\lbrace': 'cases' };
const CLOSE_FENCE: Record<string, string> = { pmatrix: ')', bmatrix: ']', vmatrix: '|', Vmatrix: '\\|', cases: '.' };

function clean(nodes: Node[]): Node[] {
  let out: Node[] = nodes.map((n) => (isGroup(n) ? clean(n) : n));
  out = collapseOperatorNames(out);
  // heavy print or a contrasty photo reads as bold; school maths writes vectors with arrows
  out = out.flatMap((n, i) => (isGroup(n) && BOLD.has(String(out[i - 1])) ? n : BOLD.has(String(n)) ? [] : [n]));
  // point names and variables are italic like other letters: \mathrm{AB} → AB, \mathrm{x} → x
  // (units such as \mathrm{cm} stay upright)
  const plainName = (g: Node | undefined) =>
    isGroup(g) && g.length > 0 && g.every((x) => typeof x === 'string') && (/^[A-Z]+$|^\d+$/.test(g.join('')) || (g.length === 1 && /^[a-z]$/.test(g[0] as string)));
  out = out.flatMap((n, i) => (out[i - 1] === '\\mathrm' && plainName(n) ? (n as Node[]) : n === '\\mathrm' && plainName(out[i + 1]) ? [] : [n]));
  out = out.flatMap((n, i) => (n === '\\not' && out[i + 1] === '=' ? ['\\neq'] : n === '=' && out[i - 1] === '\\not' ? [] : [n]));
  out = out.filter((n, i) => !(typeof n === 'string' && (DROP.has(n) || (n === '\\,' && !beforeDifferential(out, i)))));
  out = schoolNotation(out);
  out = fencedEnvironments(out);
  out = unwrapGroups(out);
  return out;
}

/** "\," before the dx of an integral is kept; everywhere else it is dropped. */
function beforeDifferential(nodes: Node[], i: number): boolean {
  const next = nodes[i + 1];
  const after = nodes[i + 2];
  return next === 'd' && typeof after === 'string' && /^[a-zA-Z]$/.test(after) && nodes.slice(0, i).some((n) => /^\\i+nt$|^\\oint$/.test(String(n)));
}

/** "\operatorname* { l i m }" → "\lim"; "\underset { x \to 0 } { \lim }" → "\lim _ { x \to 0 }". */
function collapseOperatorNames(nodes: Node[]): Node[] {
  const out: Node[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const arg = nodes[i + 1];
    if ((n === '\\operatorname' || n === '\\operatorname*' || n === '\\mathrm') && isGroup(arg) && arg.every((x) => typeof x === 'string' && /^[A-Za-z]$/.test(x))) {
      const name = arg.join('');
      if (NAMED_OPS.has(name)) out.push(`\\${name}`);
      else out.push(n, [name]);
      i++;
      continue;
    }
    if (n === '\\underset' && isGroup(arg) && isGroup(nodes[i + 2])) {
      const body = nodes[i + 2] as Node[];
      if (body.length === 1 && typeof body[0] === 'string' && NAMED_OPS.has(body[0].slice(1))) {
        out.push(body[0], '_', arg);
        i += 2;
        continue;
      }
    }
    out.push(n);
  }
  return out;
}

const ACCENTS = new Set(['\\bar', '\\hat', '\\overline', '\\widehat', '\\widetilde']);
const upperName = (g: Node | undefined): g is string[] => isGroup(g) && g.length > 0 && g.every((x) => typeof x === 'string' && /^[A-Z]$/.test(x));

/**
 * Notation of Vietnamese school maths that the model reads loosely:
 * an angle written over three points (\bar{B}\bar{A}\bar{C}, \overline{BAC}) is \widehat{BAC};
 * a degree sign read as "*" or "o" after a number is \circ.
 */
function schoolNotation(nodes: Node[]): Node[] {
  const out: Node[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    // \bar{B}\bar{A}\bar{C} → \widehat{BAC}
    if (typeof n === 'string' && ACCENTS.has(n) && upperName(nodes[i + 1])) {
      const letters: string[] = [];
      let j = i;
      while (typeof nodes[j] === 'string' && ACCENTS.has(nodes[j] as string) && upperName(nodes[j + 1])) {
        letters.push(...(nodes[j + 1] as string[]));
        j += 2;
      }
      if (letters.length === 3) {
        out.push('\\widehat', letters);
        i = j - 1;
        continue;
      }
    }
    // 60^{*} / 60^o → 60^\circ
    if ((n === '^') && /^\d$/.test(String(out[out.length - 1]))) {
      const s = nodes[i + 1];
      const sup = isGroup(s) && s.length === 1 ? s[0] : s;
      if (sup === '*' || sup === 'o' || sup === '\\ast') {
        out.push('^', '\\circ');
        i++;
        continue;
      }
    }
    out.push(n);
  }
  return out;
}

/** Rows of an environment body: cells split at "&", rows at "\\" (empty rows are dropped). */
function rowsOf(body: Node[]): Node[][][] {
  const rows: Node[][][] = [[[]]];
  for (const n of body) {
    const row = rows[rows.length - 1];
    if (n === '\\\\') rows.push([[]]);
    else if (n === '&') row.push([]);
    else row[row.length - 1].push(n);
  }
  const empty = (r: Node[][]) => r.every((c) => c.length === 0 || c.every((x) => isGroup(x) && x.length === 0));
  const kept = rows.filter((r) => !empty(r));
  return kept.length ? kept : [[[]]];
}

function environment(name: string, rows: Node[][][], dropEmptyCells: boolean): Node[] {
  const body: Node[] = [];
  rows.forEach((row, r) => {
    if (r > 0) body.push('\\\\');
    const cells = dropEmptyCells ? row.filter((c) => c.length && !c.every((x) => isGroup(x) && x.length === 0)) : row;
    (cells.length ? cells : [[]]).forEach((c, k) => {
      if (k > 0) body.push('&');
      body.push(...unwrapGroups(c));
    });
  });
  return [`\\begin{${name}}`, ...body, `\\end{${name}}`];
}

/**
 * "\left( \begin{matrix} … \end{matrix} \right)" → pmatrix (also [ ] | | and cases for "\left\{ … \right.");
 * a lone one-cell matrix or aligned block is just its content.
 */
function fencedEnvironments(nodes: Node[]): Node[] {
  const out: Node[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const begin = typeof nodes[i] === 'string' ? ENVS.exec(nodes[i] as string) : null;
    if (!begin || begin[1] !== 'begin') {
      out.push(nodes[i]);
      continue;
    }
    // find the matching \end
    let depth = 0;
    let j = i;
    for (; j < nodes.length; j++) {
      const m = typeof nodes[j] === 'string' ? ENVS.exec(nodes[j] as string) : null;
      if (m) depth += m[1] === 'begin' ? 1 : -1;
      if (depth === 0) break;
    }
    if (j >= nodes.length) {
      out.push(nodes[i]);
      continue;
    }
    let bodyStart = i + 1;
    if (begin[2] === 'array' && isGroup(nodes[bodyStart])) bodyStart++; // column spec
    const rows = rowsOf(nodes.slice(bodyStart, j));
    const fenced = out.length >= 2 && out[out.length - 2] === '\\left' && typeof out[out.length - 1] === 'string' ? (out[out.length - 1] as string) : null;
    const kind = fenced ? OPEN_FENCE[fenced] : undefined;
    const close = nodes[j + 1] === '\\right' ? nodes[j + 2] : undefined;
    if (kind && close === CLOSE_FENCE[kind]) {
      out.splice(out.length - 2, 2);
      out.push(...environment(kind, rows, kind === 'cases'));
      i = j + 2;
      continue;
    }
    // a lone one-row block: its content (aligned cells are one line of text: x &> 0 → x > 0)
    const cells = rows[0].filter((c) => c.length);
    if (!fenced && rows.length === 1 && (cells.length <= 1 || begin[2] !== 'matrix')) {
      out.push(...cells.flatMap((c) => unwrapGroups(c)));
      i = j;
      continue;
    }
    const env = environment(begin[2], rows, false);
    if (bodyStart > i + 1) env.splice(1, 0, nodes[i + 1]); // array column spec
    out.push(...env);
    i = j;
  }
  return out;
}

/**
 * Braces that only group ("{ \frac … }", "{ 1 } & { 2 }") are removed; command arguments
 * keep theirs, and a one-character script loses them ("^ { 2 }" → "^2").
 */
function unwrapGroups(nodes: Node[]): Node[] {
  const out: Node[] = [];
  let pendingArgs = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (typeof n === 'string') {
      if (n === '\\sqrt' && nodes[i + 1] === '[') {
        // optional index: \sqrt [ 3 ] { x }
        const close = nodes.indexOf(']', i + 1);
        if (close > 0) {
          out.push(...nodes.slice(i, close + 1));
          i = close;
          pendingArgs = 1;
          continue;
        }
      }
      pendingArgs = ARGS[n] ?? (/^\\begin\{array\}$/.test(n) ? 1 : 0);
      out.push(n);
      continue;
    }
    const prev = out[out.length - 1];
    if (pendingArgs > 0) {
      pendingArgs--;
      out.push(n);
      continue;
    }
    if (prev === '^' || prev === '_') {
      const single = n.length === 1 && typeof n[0] === 'string' && (/^[A-Za-z0-9]$/.test(n[0]) || /^\\[A-Za-z]+$/.test(n[0]));
      out.push(single ? n[0] : n);
      continue;
    }
    const next = nodes[i + 1];
    if (((next === '^' || next === '_') && n.length > 1) || n.some((x) => x === '\\over' || x === '\\choose')) {
      out.push(n);
      continue;
    }
    out.push(...n); // a group that only groups
  }
  return out;
}

const CONTROL_WORD = /\\[A-Za-z]+\*?$/;

function serialize(nodes: Node[]): string {
  let s = '';
  for (const n of nodes) {
    const piece = isGroup(n) ? `{${serialize(n)}}` : n;
    // a control word needs a space before a following letter or digit ("\pi r", "\to 0")
    if (CONTROL_WORD.test(s) && /^[A-Za-z0-9]/.test(piece)) s += ' ';
    s += piece;
  }
  return s;
}

/** The tidy LaTeX for a raw model output. */
export function cleanOcrLatex(raw: string): string {
  return serialize(clean(parse(raw))).trim();
}

/** Plain text of LaTeX, for comparing two readings regardless of braces and spacing. */
export function latexKey(latex: string): string {
  return text(clean(parse(latex)))
    .replace(/\\dfrac/g, '\\frac')
    .replace(/\\(left|right)(?![a-z])\.?/g, '');
}
