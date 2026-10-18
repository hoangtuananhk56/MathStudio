/**
 * Seeing a geometry figure in a picture: the strokes of the drawing (not its fills, not its
 * text), then the straight segments (solid or dashed) and circles they are made of.
 *
 *  1. ink: dark pixels; big dark areas (filled shapes) keep only their outline;
 *  2. the text found by the text recogniser is masked out;
 *  3. the strokes are thinned to one-pixel lines (Zhang–Suen) and traced; curved traces
 *     are tried as circles and arcs;
 *  4. straight segments are found with a Hough transform that removes each found line's
 *     pixels before looking for the next; gaps are bridged (dashes, crossings) and lines
 *     with many gaps are dashed.
 *
 * Coordinates are pixels of the picture, y down.
 */
import type { Gray, Rect } from './image';

export interface Vec {
  x: number;
  y: number;
}

export interface Segment {
  a: Vec;
  b: Vec;
  dashed: boolean;
}

export interface Circle {
  c: Vec;
  r: number;
  /** Angular coverage 0…1 (1 = full circle). */
  coverage: number;
  /** Middle direction of the drawn part (radians, y down), for arcs. */
  mid: number;
}

export interface FigureStrokes {
  width: number;
  height: number;
  /** Typical stroke width, px. */
  stroke: number;
  segments: Segment[];
  circles: Circle[];
  /** Pixels of ink (after masking text), for later checks. */
  ink: Uint8Array;
  /** Fill colours found inside the drawing (big uniform areas), with a sample point. */
  fills: { at: Vec; color: string }[];
}

export const len = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);

/* ------------------------------------------------------------------ masks */

/** Two-pass chamfer distance (3-4) to the nearest non-ink pixel, in px. */
function distanceToPaper(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 3);
        if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
      }
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) v = Math.min(v, 3);
      d[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 3);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
      }
      d[i] = v;
    }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/** Zhang–Suen thinning, in place. */
function thin(m: Uint8Array, w: number, h: number): void {
  const del: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const pass of [0, 1]) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!m[i]) continue;
          const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1];
          const p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let a = 0;
          for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) a++;
          if (a !== 1) continue;
          if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
          del.push(i);
        }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
  }
}

/* ------------------------------------------------------------------ circles */

/** Least-squares circle through points (Kåsa), or null. */
function fitCircle(pts: Vec[]): { c: Vec; r: number; err: number } | null {
  const n = pts.length;
  if (n < 8) return null;
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of pts) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const bu = 0.5 * (suuu + suvv);
  const bv = 0.5 * (svvv + svuu);
  const uc = (bu * svv - bv * suv) / det;
  const vc = (suu * bv - suv * bu) / det;
  const c = { x: uc + mx, y: vc + my };
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  let err = 0;
  for (const p of pts) err += Math.abs(len(p, c) - r);
  return { c, r, err: err / n };
}

function coverageOf(pts: Vec[], c: Vec): { coverage: number; mid: number } {
  const bins = new Uint8Array(36);
  for (const p of pts) bins[Math.floor(((Math.atan2(p.y - c.y, p.x - c.x) + Math.PI) / (2 * Math.PI)) * 36) % 36] = 1;
  const covered = bins.reduce((a, b) => a + b, 0);
  // middle of the drawn part: mean direction
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    const d = len(p, c) || 1;
    sx += (p.x - c.x) / d;
    sy += (p.y - c.y) / d;
  }
  return { coverage: covered / 36, mid: Math.atan2(sy, sx) };
}

/* ------------------------------------------------------------------ tracing */

const N8 = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
] as const;

/** Splits the skeleton into traces between ends and junctions. */
function traces(sk: Uint8Array, w: number, h: number): Vec[][] {
  const deg = (x: number, y: number) => {
    let n = 0;
    for (const [dx, dy] of N8) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && sk[yy * w + xx]) n++;
    }
    return n;
  };
  const seen = new Uint8Array(w * h);
  const node = (i: number) => {
    const d = deg(i % w, Math.floor(i / w));
    return d !== 2;
  };
  const out: Vec[][] = [];
  const walk = (start: number, first: number) => {
    const path: Vec[] = [{ x: start % w, y: Math.floor(start / w) }];
    let prev = start;
    let cur = first;
    for (;;) {
      seen[cur] = 1;
      path.push({ x: cur % w, y: Math.floor(cur / w) });
      if (node(cur) && cur !== start) break;
      const cx = cur % w;
      const cy = Math.floor(cur / w);
      let next = -1;
      for (const [dx, dy] of N8) {
        const xx = cx + dx;
        const yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!sk[j] || j === prev || (seen[j] && !node(j))) continue;
        next = j;
        if (!seen[j]) break;
      }
      if (next < 0 || next === start) break;
      prev = cur;
      cur = next;
    }
    out.push(path);
  };
  for (let i = 0; i < sk.length; i++) {
    if (!sk[i] || !node(i)) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const [dx, dy] of N8) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (sk[j] && !seen[j] && !node(j)) {
        seen[i] = 1;
        walk(i, j);
      }
    }
  }
  // closed loops without nodes (a circle, a polygon drawn as one stroke)
  for (let i = 0; i < sk.length; i++) {
    if (!sk[i] || seen[i]) continue;
    seen[i] = 1;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const [dx, dy] of N8) {
      const j = (y + dy) * w + x + dx;
      if (sk[j] && !seen[j]) {
        walk(i, j);
        break;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ measures */

/** Most common width of short ink runs, across rows and columns: the pen width (fills don't count). */
export function strokeWidth(ink: Uint8Array, w: number, h: number): number {
  const hist = new Uint32Array(16);
  const count = (run: number) => {
    if (run > 0 && run < 16) hist[run]++;
  };
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      if (ink[y * w + x]) run++;
      else {
        count(run);
        run = 0;
      }
    }
    count(run);
  }
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y < h; y++) {
      if (ink[y * w + x]) run++;
      else {
        count(run);
        run = 0;
      }
    }
    count(run);
  }
  // weighted by pixels: the jaggies of slanted lines make many 1-pixel runs, but few pixels
  let best = 1;
  for (let r = 1; r < 16; r++) if (hist[r] * r > hist[best] * best) best = r;
  return best;
}

/**
 * True when the picture is a drawing (a figure, a diagram, a scan of one) rather than a
 * photograph: a few flat colours cover almost all of it.
 */
export function looksLikeDrawing(rgba: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }): boolean {
  const bins = new Map<number, number>();
  const n = rgba.width * rgba.height;
  const step = Math.max(1, Math.floor(n / 60000));
  let total = 0;
  for (let i = 0; i < n; i += step) {
    const k = ((rgba.data[i * 4] >> 4) << 8) | ((rgba.data[i * 4 + 1] >> 4) << 4) | (rgba.data[i * 4 + 2] >> 4);
    bins.set(k, (bins.get(k) ?? 0) + 1);
    total++;
  }
  const top = [...bins.values()].sort((a, b) => b - a).slice(0, 6).reduce((a, b) => a + b, 0);
  return top / total > 0.8;
}

export interface Glyph {
  box: Rect;
  /** Pieces (connected components) it is made of. */
  pieces: number;
  /** Its pixels (indices), to erase it from the drawing once it is read as text. */
  pixels: number[];
}

export interface Glyphs {
  glyphs: Glyph[];
  /** Round dots the size of a point mark (vertices drawn with a dot). */
  dots: Vec[];
}

/**
 * Groups of small, separate blobs of ink the size of letters: point names (A, B′, M₁), numbers
 * and measures ("30 m", "8cm²"). Letters touching a line are not found (they are part of it).
 */
export function findGlyphs(ink: Uint8Array, w: number, h: number, stroke: number): Glyphs {
  const label = new Int32Array(w * h).fill(-1);
  const boxes: { x0: number; y0: number; x1: number; y1: number; n: number; sx: number; sy: number; sxx: number; syy: number; sxy: number }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i] || label[i] >= 0) continue;
    const id = boxes.length;
    const b = { x0: w, y0: h, x1: 0, y1: 0, n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 };
    label[i] = id;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w;
      const y = (j - x) / w;
      b.n++;
      b.sx += x;
      b.sy += y;
      b.sxx += x * x;
      b.syy += y * y;
      b.sxy += x * y;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const k = yy * w + xx;
          if (ink[k] && label[k] < 0) {
            label[k] = id;
            stack.push(k);
          }
        }
    }
    boxes.push(b);
  }
  const diag = Math.hypot(w, h);
  const maxH = Math.max(14, diag * 0.09);
  const minH = Math.max(5, stroke * 2.5, diag * 0.01);
  // letter-sized pieces (and the small marks of letters: accents, primes, dots of i)
  type Piece = { x0: number; y0: number; x1: number; y1: number; small: boolean; id: number };
  const pieces: Piece[] = [];
  const dots: Vec[] = [];
  // straight thin blobs in a row are the dashes of a dashed line, not letters
  const shape = boxes.map((b) => {
    const mx = b.sx / b.n;
    const my = b.sy / b.n;
    const a = b.sxx / b.n - mx * mx;
    const c = b.syy / b.n - my * my;
    const d = b.sxy / b.n - mx * my;
    const tr = (a + c) / 2;
    const det = Math.sqrt(Math.max(0, ((a - c) / 2) ** 2 + d * d));
    const l1 = tr + det;
    const l2 = Math.max(1e-6, tr - det);
    const dir = 0.5 * Math.atan2(2 * d, a - c);
    return { c: { x: mx, y: my }, long: Math.sqrt(l1 / l2), dir, length: Math.sqrt(12 * l1) };
  });
  const dash = new Set<number>();
  boxes.forEach((b, i) => {
    const si = shape[i];
    if (si.long < 2.8 || b.n > 40 * stroke * stroke) return;
    boxes.forEach((_, j) => {
      const sj = shape[j];
      if (j === i || sj.long < 2.8) return;
      const dx = sj.c.x - si.c.x;
      const dy = sj.c.y - si.c.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 4 * Math.max(si.length, sj.length)) return;
      const along = Math.abs(Math.sin(Math.atan2(dy, dx) - si.dir));
      const parallel = Math.abs(Math.sin(sj.dir - si.dir));
      if (along < 0.26 && parallel < 0.26) {
        dash.add(i);
        dash.add(j);
      }
    });
  });
  boxes.forEach((b, id) => {
    if (dash.has(id)) return;
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    if (bh > maxH || bw > maxH * 1.6) return;
    const fill = b.n / (bw * bh);
    // a filled round blob is a point's dot, not a letter
    if (fill > 0.6 && bw <= bh * 1.4 && bh <= bw * 1.4 && bh >= stroke * 1.5 && bh < minH * 2) {
      dots.push({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
      return;
    }
    const letter = bh >= minH && bw <= bh * 2.2;
    if (letter) pieces.push({ ...b, small: false, id });
    else if (bh < minH && bw < minH * 1.5) pieces.push({ ...b, small: true, id });
  });
  // a small mark goes with the letter right next to it; letters close on a line form a word
  const groups: Piece[][] = pieces.filter((p) => !p.small).map((p) => [p]);
  const box = (g: Piece[]) => ({ x0: Math.min(...g.map((p) => p.x0)), y0: Math.min(...g.map((p) => p.y0)), x1: Math.max(...g.map((p) => p.x1)), y1: Math.max(...g.map((p) => p.y1)) });
  for (const p of pieces.filter((q) => q.small)) {
    let best: Piece[] | null = null;
    let bd = Infinity;
    for (const g of groups) {
      const b = box(g);
      const gh = b.y1 - b.y0 + 1;
      const dx = Math.max(0, b.x0 - p.x1, p.x0 - b.x1);
      const dy = Math.max(0, b.y0 - p.y1, p.y0 - b.y1);
      if (dx > gh * 0.5 || dy > gh * 0.6) continue;
      if (dx + dy < bd) {
        bd = dx + dy;
        best = g;
      }
    }
    best?.push(p);
  }
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const a = box(groups[i]);
        const b = box(groups[j]);
        const ha = a.y1 - a.y0 + 1;
        const hb = b.y1 - b.y0 + 1;
        const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        const gap = Math.max(b.x0 - a.x1, a.x0 - b.x1);
        // same line, close: letters of one word; a superscript (cm²) sits higher and is small
        const sameLine = overlap > 0.35 * Math.min(ha, hb);
        if (sameLine && gap < 0.55 * Math.max(ha, hb)) {
          groups[i].push(...groups[j]);
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
  }
  const ids = new Map<number, number>();
  groups.forEach((g, k) => g.forEach((p) => ids.set(p.id, k)));
  const pixels: number[][] = groups.map(() => []);
  for (let i = 0; i < label.length; i++) {
    const k = label[i] >= 0 ? ids.get(label[i]) : undefined;
    if (k !== undefined) pixels[k].push(i);
  }
  const glyphs = groups.map((g, k) => {
    const b = box(g);
    return { box: { x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 }, pieces: g.length, pixels: pixels[k] };
  });
  return { glyphs, dots };
}

/* ------------------------------------------------------------------ main */

export interface VisionOptions {
  /** Pixels of text (labels, measures) to leave out of the strokes. */
  erase: Iterable<number>;
}

/** Ink of the picture: dark pixels (lines may be coloured: blue, red…). */
export function inkMask(rgba: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }, gray: Gray): Uint8Array {
  const { width: w, height: h } = gray;
  const m = new Uint8Array(w * h);
  const d = rgba.data;
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    // dark, or a strongly coloured line (pure red / blue strokes are not that dark)
    m[i] = gray.data[i] < 150 || (sat > 120 && gray.data[i] < 185) ? 1 : 0;
  }
  solidifyDither(m, w, h);
  return m;
}

/**
 * A colour printed as a checkerboard of dots (dithered pictures) is a filled area, not a
 * mesh of lines: where dots touch only diagonally, in a patch of such dots, fill it in.
 */
function solidifyDither(m: Uint8Array, w: number, h: number): void {
  const checker = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!m[i] || m[i - 1] || m[i + 1] || m[i - w] || m[i + w]) continue;
      if (m[i - w - 1] + m[i - w + 1] + m[i + w - 1] + m[i + w + 1] >= 3) checker[i] = 1;
    }
  const fill: number[] = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (checker[i] && checker[i - w - 1] + checker[i - w + 1] + checker[i + w - 1] + checker[i + w + 1] >= 2) fill.push(i);
    }
  for (const i of fill) for (const d of [-w - 1, -w, -w + 1, -1, 0, 1, w - 1, w, w + 1]) m[i + d] = 1;
}

export function seeStrokes(rgba: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }, gray: Gray, opts: VisionOptions): FigureStrokes {
  const { width: w, height: h } = gray;
  const ink = inkMask(rgba, gray);
  for (const i of opts.erase) ink[i] = 0;

  // stroke width, and filled areas reduced to their outline
  const dist = distanceToPaper(ink, w, h);
  const stroke = strokeWidth(ink, w, h);
  const T = Math.max(4, stroke * 2.5);
  const fills: { at: Vec; color: string }[] = [];
  const core = new Uint8Array(w * h);
  let cores = 0;
  for (let i = 0; i < dist.length; i++)
    if (dist[i] > T) {
      core[i] = 1;
      cores++;
    }
  const strokes = new Uint8Array(ink);
  if (cores) {
    // the filled area: ink within T of a core pixel; keep only its boundary
    const near = distanceToPaper(core.map((v) => (v ? 0 : 1)) as Uint8Array, w, h);
    const area = new Uint8Array(w * h);
    for (let i = 0; i < area.length; i++) if (ink[i] && near[i] <= T + 1.5) area[i] = 1;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!area[i]) continue;
        const edge = !ink[i - 1] || !ink[i + 1] || !ink[i - w] || !ink[i + w];
        strokes[i] = edge ? 1 : 0;
      }
    // one sample of each filled area's colour
    const seen = new Uint8Array(w * h);
    for (let i = 0; i < core.length; i++) {
      if (!core[i] || seen[i]) continue;
      const stack = [i];
      seen[i] = 1;
      let n = 0;
      let sx = 0;
      let sy = 0;
      while (stack.length) {
        const j = stack.pop()!;
        n++;
        sx += j % w;
        sy += Math.floor(j / w);
        for (const k of [j - 1, j + 1, j - w, j + w]) if (k >= 0 && k < core.length && core[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
      if (n < 50) continue;
      const at = { x: Math.round(sx / n), y: Math.round(sy / n) };
      const k = (at.y * w + at.x) * 4;
      const hex = (v: number) => v.toString(16).padStart(2, '0');
      fills.push({ at, color: `#${hex(rgba.data[k])}${hex(rgba.data[k + 1])}${hex(rgba.data[k + 2])}` });
    }
  }

  // skeleton and its traces
  const sk = new Uint8Array(strokes);
  for (let x = 0; x < w; x++) sk[x] = sk[(h - 1) * w + x] = 0;
  for (let y = 0; y < h; y++) sk[y * w] = sk[y * w + w - 1] = 0;
  thin(sk, w, h);

  const diag = Math.hypot(w, h);
  const circles: Circle[] = [];
  const straight = new Uint8Array(w * h);
  const curved: Vec[][] = [];
  for (const t of traces(sk, w, h)) {
    if (t.length < 3) {
      for (const p of t) straight[p.y * w + p.x] = 1;
      continue;
    }
    // a curve: the trace leaves its chord, yet stays on one circle (a corner does not)
    const chord = len(t[0], t[t.length - 1]);
    const L = Math.max(1, chord);
    let dev = 0;
    for (const p of t) dev = Math.max(dev, Math.abs((t[t.length - 1].x - t[0].x) * (t[0].y - p.y) - (t[0].x - p.x) * (t[t.length - 1].y - t[0].y)) / L);
    const closed = chord < 3;
    const fit = t.length >= 12 && (closed || dev > Math.max(2, stroke)) ? fitCircle(t) : null;
    if (fit && fit.err <= Math.max(1.2, stroke * 0.5) && fit.r < diag / 2) curved.push(t);
    else for (const p of t) straight[p.y * w + p.x] = 1;
  }
  // curved traces: whole circles, or arcs (angle marks); several traces of one circle are joined
  const used = new Set<number>();
  for (let i = 0; i < curved.length; i++) {
    if (used.has(i)) continue;
    let pts = curved[i];
    let fit = fitCircle(pts);
    if (!fit || fit.err > Math.max(1.5, stroke * 0.7)) {
      for (const p of curved[i]) straight[p.y * w + p.x] = 1;
      continue;
    }
    for (let j = i + 1; j < curved.length; j++) {
      if (used.has(j)) continue;
      const f2 = fitCircle([...pts, ...curved[j]]);
      if (f2 && f2.err <= Math.max(1.5, stroke * 0.7) && Math.abs(f2.r - fit.r) < Math.max(3, fit.r * 0.1)) {
        pts = [...pts, ...curved[j]];
        fit = f2;
        used.add(j);
      }
    }
    if (fit.r > diag) {
      for (const p of pts) straight[p.y * w + p.x] = 1;
      continue;
    }
    circles.push({ c: fit.c, r: fit.r, ...coverageOf(pts, fit.c) });
  }

  const segments = houghSegments(straight, w, h, stroke);
  return { width: w, height: h, stroke, segments, circles, ink: strokes, fills };
}

/**
 * Straight segments of a skeleton: the strongest Hough line, its pixels split into runs
 * (gaps up to a few strokes are bridged), the pixels of every run taken away; again.
 */
function houghSegments(px: Uint8Array, w: number, h: number, stroke: number): Segment[] {
  const pts: number[] = [];
  for (let i = 0; i < px.length; i++) if (px[i]) pts.push(i);
  const n = pts.length;
  const X = new Float32Array(n);
  const Y = new Float32Array(n);
  pts.forEach((i, k) => {
    X[k] = i % w;
    Y[k] = Math.floor(i / w);
  });
  const active = new Uint8Array(n).fill(1);
  const NT = 360;
  const cos = new Float32Array(NT);
  const sin = new Float32Array(NT);
  for (let t = 0; t < NT; t++) {
    cos[t] = Math.cos((t * Math.PI) / NT);
    sin[t] = Math.sin((t * Math.PI) / NT);
  }
  const D = Math.ceil(Math.hypot(w, h));
  const NR = 2 * D + 1;
  const acc = new Int32Array(NT * NR);
  const vote = (k: number, d: number) => {
    for (let t = 0; t < NT; t++) acc[t * NR + Math.round(X[k] * cos[t] + Y[k] * sin[t]) + D] += d;
  };
  for (let k = 0; k < n; k++) vote(k, 1);

  const diag = Math.hypot(w, h);
  const minVotes = Math.max(10, Math.round(diag * 0.015));
  const minLen = Math.max(6, stroke * 3);
  const gapMax = Math.max(8, stroke * 5, diag * 0.012);
  const tol = Math.max(1.5, stroke * 0.5);
  const out: Segment[] = [];

  for (let iter = 0; iter < 400; iter++) {
    let best = 0;
    let bi = -1;
    for (let i = 0; i < acc.length; i++)
      if (acc[i] > best) {
        best = acc[i];
        bi = i;
      }
    if (best < minVotes) break;
    const t = Math.floor(bi / NR);
    const rho = (bi % NR) - D;
    // pixels near the line, then a total-least-squares refit
    let nx = cos[t];
    let ny = sin[t];
    let c0 = rho;
    let near: number[] = [];
    for (let pass = 0; pass < 2; pass++) {
      near = [];
      for (let k = 0; k < n; k++) if (active[k] && Math.abs(X[k] * nx + Y[k] * ny - c0) <= tol + (pass ? 0 : 0.5)) near.push(k);
      if (near.length < 2) break;
      let mx = 0;
      let my = 0;
      for (const k of near) {
        mx += X[k];
        my += Y[k];
      }
      mx /= near.length;
      my /= near.length;
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      for (const k of near) {
        sxx += (X[k] - mx) ** 2;
        syy += (Y[k] - my) ** 2;
        sxy += (X[k] - mx) * (Y[k] - my);
      }
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy); // direction of the line
      nx = -Math.sin(ang);
      ny = Math.cos(ang);
      c0 = mx * nx + my * ny;
    }
    // along the line
    const dx = ny;
    const dy = -nx;
    const along = near.map((k) => ({ k, s: X[k] * dx + Y[k] * dy })).sort((a, b) => a.s - b.s);
    let took = false;
    let start = 0;
    for (let i = 1; i <= along.length; i++) {
      if (i < along.length && along[i].s - along[i - 1].s <= gapMax) continue;
      const run = along.slice(start, i);
      start = i;
      const s0 = run[0].s;
      const s1 = run[run.length - 1].s;
      if (s1 - s0 < minLen || run.length < minLen * 0.5) continue;
      // density of the run (an 8-connected line has max(|dx|,|dy|) pixels per unit length)
      const density = run.length / ((s1 - s0 + 1) * Math.max(Math.abs(dx), Math.abs(dy)));
      let gaps = 0;
      for (let j = 1; j < run.length; j++) if (run[j].s - run[j - 1].s > Math.max(2.5, stroke * 1.2)) gaps++;
      const at = (s: number) => ({ x: c0 * nx + s * dx, y: c0 * ny + s * dy });
      out.push({ a: at(s0), b: at(s1), dashed: gaps >= 3 && density < 0.8 });
      for (const r of run) {
        active[r.k] = 0;
        vote(r.k, -1);
      }
      took = true;
    }
    if (!took) acc[bi] = 0; // nothing usable on this line: never pick it again
  }
  return out;
}
