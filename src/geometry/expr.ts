/**
 * Tiny expression compiler for function graphs: y = f(x).
 * Supports + - * / ^, unary minus, parentheses, implicit multiplication (2x, 3sin x),
 * the constants pi and e, and the usual school functions.
 */

type Fn = (x: number) => number;

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, cot: (v) => 1 / Math.tan(v),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp, floor: Math.floor, ceil: Math.ceil,
};

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const s = src.replace(/\s+/g, '').replace(/[·×]/g, '*').replace(/[−–]/g, '-').replace(/π/g, 'pi');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i))!;
      out.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
    } else if (/[a-z]/i.test(c)) {
      // Split identifiers into known names / single letters so "2xsinx" works.
      const m = /^[a-z]+/i.exec(s.slice(i))![0].toLowerCase();
      let j = 0;
      while (j < m.length) {
        const name = ['arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan', 'sqrt', 'sin', 'cos', 'tan', 'cot', 'abs', 'exp', 'log', 'ln', 'floor', 'ceil', 'pi']
          .find((n) => m.startsWith(n, j));
        const v = name ?? m[j];
        out.push({ t: 'id', v });
        j += v.length;
      }
      i += m.length;
    } else if ('+-*/^()'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
    } else {
      throw new Error(`Ký tự không hợp lệ: "${c}"`);
    }
  }
  return out;
}

export function compileExpression(src: string): Fn {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (v: string) => peek()?.t === 'op' && peek().v === v;
  const startsPrimary = () => {
    const p = peek();
    return !!p && (p.t === 'num' || p.t === 'id' || (p.t === 'op' && p.v === '('));
  };

  function expr(): Fn {
    let left = term();
    while (isOp('+') || isOp('-')) {
      const op = toks[pos++].v;
      const l = left;
      const r = term();
      left = op === '+' ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
    }
    return left;
  }
  function term(): Fn {
    let left = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = toks[pos++].v;
        const l = left;
        const r = unary();
        left = op === '*' ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
      } else if (startsPrimary()) {
        // implicit multiplication: 2x, 3(x+1), x sin x
        const l = left;
        const r = unary();
        left = (x) => l(x) * r(x);
      } else return left;
    }
  }
  function unary(): Fn {
    if (isOp('-')) {
      pos++;
      const v = unary();
      return (x) => -v(x);
    }
    if (isOp('+')) {
      pos++;
      return unary();
    }
    return power();
  }
  function power(): Fn {
    const base = primary();
    if (isOp('^')) {
      pos++;
      const exp = unary(); // right-associative
      return (x) => Math.pow(base(x), exp(x));
    }
    return base;
  }
  function primary(): Fn {
    const tok = toks[pos++];
    if (!tok) throw new Error('Biểu thức chưa hoàn chỉnh');
    if (tok.t === 'num') return () => tok.v;
    if (tok.t === 'op' && tok.v === '(') {
      const v = expr();
      if (!isOp(')')) throw new Error('Thiếu dấu ")"');
      pos++;
      return v;
    }
    if (tok.t === 'id') {
      if (tok.v === 'x') return (x) => x;
      if (tok.v === 'pi') return () => Math.PI;
      if (tok.v === 'e') return () => Math.E;
      const f = FUNCS[tok.v];
      if (f) {
        const arg = isOp('(') ? primary() : power();
        return (x) => f(arg(x));
      }
      throw new Error(`Không biết "${tok.v}"`);
    }
    throw new Error(`Không mong đợi "${tok.v}"`);
  }

  const fn = expr();
  if (pos < toks.length) throw new Error(`Thừa "${toks[pos].v}"`);
  return fn;
}
