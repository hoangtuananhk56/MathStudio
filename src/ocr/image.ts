/**
 * Image preparation for OCR, in plain TypeScript so it runs the same in the browser, in
 * a worker and in tests: greyscale, paper/ink levelling (phone photos), trimming to the
 * ink, and high-quality resampling.
 */

/** RGBA pixels, like the browser's ImageData. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** Grey levels 0 (ink) … 255 (paper). */
export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function toGray(img: Pixels): Gray {
  const n = img.width * img.height;
  const out = new Uint8Array(n);
  const d = img.data;
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3] / 255;
    // transparent pixels are paper
    const y = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    out[i] = Math.round(y * a + 255 * (1 - a));
  }
  return { width: img.width, height: img.height, data: out };
}

export function crop(g: Gray, r: Rect): Gray {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(g.width, Math.ceil(r.x + r.w));
  const y1 = Math.min(g.height, Math.ceil(r.y + r.h));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const out = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h && y0 + y < g.height; y++) out.set(g.data.subarray((y0 + y) * g.width + x0, (y0 + y) * g.width + x0 + Math.min(w, g.width - x0)), y * w);
  return { width: w, height: h, data: out };
}

function percentile(hist: Uint32Array, total: number, p: number): number {
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total * p) return v;
  }
  return 255;
}

/**
 * Stretches the levels so the paper is white and the ink black: photographed pages are
 * grey and unevenly lit. The paper level is measured locally (in tiles) so a shadow
 * across the page does not turn into ink.
 */
export function level(g: Gray): Gray {
  const { width: w, height: h, data } = g;
  const tile = Math.max(16, Math.round(Math.max(w, h) / 8));
  const tx = Math.ceil(w / tile);
  const ty = Math.ceil(h / tile);
  const paper = new Float32Array(tx * ty);
  const hist = new Uint32Array(256);
  for (let j = 0; j < ty; j++)
    for (let i = 0; i < tx; i++) {
      hist.fill(0);
      let n = 0;
      for (let y = j * tile; y < Math.min(h, (j + 1) * tile); y++)
        for (let x = i * tile; x < Math.min(w, (i + 1) * tile); x++) {
          hist[data[y * w + x]]++;
          n++;
        }
      paper[j * tx + i] = percentile(hist, n, 0.9);
    }
  hist.fill(0);
  for (const v of data) hist[v]++;
  const ink = percentile(hist, data.length, 0.01);
  // a tile inside a thick stroke is not paper: the paper is never much darker than the page's middle
  const floor = percentile(hist, data.length, 0.5) - 30;
  for (let i = 0; i < paper.length; i++) paper[i] = Math.max(paper[i], floor);
  const out = new Uint8Array(data.length);
  for (let y = 0; y < h; y++) {
    // bilinear paper level between tile centres
    const fy = Math.min(ty - 1, Math.max(0, (y + 0.5) / tile - 0.5));
    const j0 = Math.floor(fy);
    const j1 = Math.min(ty - 1, j0 + 1);
    const wy = fy - j0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(tx - 1, Math.max(0, (x + 0.5) / tile - 0.5));
      const i0 = Math.floor(fx);
      const i1 = Math.min(tx - 1, i0 + 1);
      const wx = fx - i0;
      const p =
        (paper[j0 * tx + i0] * (1 - wx) + paper[j0 * tx + i1] * wx) * (1 - wy) + (paper[j1 * tx + i0] * (1 - wx) + paper[j1 * tx + i1] * wx) * wy;
      const lo = Math.min(ink, p - 40);
      const v = ((data[y * w + x] - lo) / Math.max(1, p - lo)) * 255;
      out[y * w + x] = v >= 255 ? 255 : v <= 0 ? 0 : Math.round(v);
    }
  }
  return { width: w, height: h, data: out };
}

/** Smallest rectangle holding all pixels darker than `threshold`, or null for a blank image. */
export function inkBox(g: Gray, threshold = 160, within?: Rect): Rect | null {
  const x0 = within ? Math.max(0, Math.floor(within.x)) : 0;
  const y0 = within ? Math.max(0, Math.floor(within.y)) : 0;
  const x1 = within ? Math.min(g.width, Math.ceil(within.x + within.w)) : g.width;
  const y1 = within ? Math.min(g.height, Math.ceil(within.y + within.h)) : g.height;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (g.data[y * g.width + x] < threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Bicubic kernel (a = -0.5, as in Pillow). */
function cubic(x: number): number {
  const a = -0.5;
  x = Math.abs(x);
  if (x < 1) return ((a + 2) * x - (a + 3)) * x * x + 1;
  if (x < 2) return (((x - 5) * x + 8) * x - 4) * a;
  return 0;
}

/** Weights of a 1-D resampling pass; when shrinking the kernel widens (anti-aliasing), as in Pillow. */
function weights(inSize: number, outSize: number): { start: Int32Array; count: Int32Array; w: Float32Array; k: number } {
  const scale = inSize / outSize;
  const support = 2 * Math.max(1, scale);
  const k = Math.ceil(support) * 2 + 1;
  const start = new Int32Array(outSize);
  const count = new Int32Array(outSize);
  const w = new Float32Array(outSize * k);
  const fs = Math.max(1, scale);
  for (let o = 0; o < outSize; o++) {
    const center = (o + 0.5) * scale;
    const lo = Math.max(0, Math.floor(center - support));
    const hi = Math.min(inSize, Math.ceil(center + support));
    let sum = 0;
    for (let i = lo; i < hi; i++) {
      const v = cubic((i - center + 0.5) / fs);
      w[o * k + (i - lo)] = v;
      sum += v;
    }
    if (sum) for (let i = 0; i < hi - lo; i++) w[o * k + i] /= sum;
    start[o] = lo;
    count[o] = hi - lo;
  }
  return { start, count, w, k };
}

export function resize(g: Gray, outW: number, outH: number): Gray {
  const { width: w, height: h, data } = g;
  const hx = weights(w, outW);
  const tmp = new Float32Array(outW * h);
  for (let y = 0; y < h; y++)
    for (let o = 0; o < outW; o++) {
      let s = 0;
      for (let i = 0; i < hx.count[o]; i++) s += data[y * w + hx.start[o] + i] * hx.w[o * hx.k + i];
      tmp[y * outW + o] = s;
    }
  const vy = weights(h, outH);
  const out = new Uint8Array(outW * outH);
  for (let o = 0; o < outH; o++)
    for (let x = 0; x < outW; x++) {
      let s = 0;
      for (let i = 0; i < vy.count[o]; i++) s += tmp[(vy.start[o] + i) * outW + x] * vy.w[o * vy.k + i];
      out[o * outW + x] = s >= 255 ? 255 : s <= 0 ? 0 : Math.round(s);
    }
  return { width: outW, height: outH, data: out };
}

/** Places the image in the middle of a white square (the formula model reads square pictures). */
export function padToSquare(g: Gray, margin: number): Gray {
  const side = Math.max(g.width, g.height) + 2 * margin;
  const out = new Uint8Array(side * side).fill(255);
  const ox = Math.floor((side - g.width) / 2);
  const oy = Math.floor((side - g.height) / 2);
  for (let y = 0; y < g.height; y++) out.set(g.data.subarray(y * g.width, (y + 1) * g.width), (oy + y) * side + ox);
  return { width: side, height: side, data: out };
}

/**
 * Tilt of the text lines, in degrees (positive = lines go down to the right): the angle at
 * which the rows of ink are sharpest (horizontal projection with the most contrast).
 */
export function estimateSkew(g: Gray, maxDeg = 6): number {
  // ink points of a reduced copy
  const step = Math.max(1, Math.round(Math.max(g.width, g.height) / 900));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < g.height; y += step)
    for (let x = 0; x < g.width; x += step)
      if (g.data[y * g.width + x] < 128) {
        xs.push(x);
        ys.push(y);
      }
  if (xs.length < 50) return 0;
  const bins = new Float64Array(Math.ceil(g.height + g.width) + 2);
  const score = (deg: number) => {
    const t = Math.tan((deg * Math.PI) / 180);
    bins.fill(0);
    const off = g.width * Math.abs(t) + 1;
    for (let i = 0; i < xs.length; i++) bins[Math.round(ys[i] - xs[i] * t + off) >> 1]++;
    let s = 0;
    for (const b of bins) s += b * b;
    return s;
  };
  let best = 0;
  let bestScore = score(0);
  for (let d = -maxDeg; d <= maxDeg; d += 0.25) {
    const s = score(d);
    if (s > bestScore * 1.0001) {
      best = d;
      bestScore = s;
    }
  }
  for (let d = best - 0.25; d <= best + 0.25; d += 0.05) {
    const s = score(d);
    if (s > bestScore) {
      best = d;
      bestScore = s;
    }
  }
  return Math.abs(best) < 0.1 ? 0 : Math.round(best * 100) / 100;
}

/** Rotates by `deg` degrees (clockwise when positive) around the centre; new corners are paper. */
export function rotate(g: Gray, deg: number): Gray {
  if (!deg) return g;
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const { width: w, height: h, data } = g;
  const W = Math.ceil(Math.abs(w * c) + Math.abs(h * s));
  const H = Math.ceil(Math.abs(w * s) + Math.abs(h * c));
  const out = new Uint8Array(W * H);
  const cx = w / 2;
  const cy = h / 2;
  const CX = W / 2;
  const CY = H / 2;
  for (let Y = 0; Y < H; Y++)
    for (let X = 0; X < W; X++) {
      // inverse mapping, bilinear
      const dx = X - CX;
      const dy = Y - CY;
      const x = dx * c + dy * s + cx - 0.5;
      const y = -dx * s + dy * c + cy - 0.5;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const px = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? 255 : data[yy * w + xx]);
      const v = (px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx) * (1 - fy) + (px(x0, y0 + 1) * (1 - fx) + px(x0 + 1, y0 + 1) * fx) * fy;
      out[Y * W + X] = Math.round(v);
    }
  return { width: W, height: H, data: out };
}

/**
 * A page (photo, scan or screenshot) made ready for reading: levelled, straightened, and
 * at a size the text recogniser reads well (small screenshots enlarged, big photos reduced).
 */
export function preparePage(g: Gray): Gray {
  const longSide = Math.max(g.width, g.height);
  const scale = longSide > 2600 ? 2600 / longSide : g.width < 1400 ? Math.min(3, 1400 / g.width) : 1;
  let page = scale !== 1 ? resize(g, Math.round(g.width * scale), Math.round(g.height * scale)) : g;
  page = level(page);
  const skew = estimateSkew(page);
  // straightening turns the photo's dark corners white
  return skew ? rotate(page, -skew) : page;
}

export const MODEL_SIZE = 384;

/**
 * The formula model's input for (part of) an image: levelled, trimmed to the ink with a
 * margin (a fraction of its size; one letter reads best small in the square, margin 1.5),
 * centred in a square, 384×384, values in [-1, 1] on three channels.
 * Null when there is no ink.
 */
export function formulaInput(img: Gray, region?: Rect, margin = 0.04): Float32Array | null {
  let g = level(region ? crop(img, region) : img);
  const box = inkBox(g);
  if (!box) return null;
  g = crop(g, box);
  g = padToSquare(g, Math.round(Math.max(4, margin * Math.max(box.w, box.h))));
  g = resize(g, MODEL_SIZE, MODEL_SIZE);
  const n = MODEL_SIZE * MODEL_SIZE;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const v = g.data[i] / 127.5 - 1;
    out[i] = v;
    out[n + i] = v;
    out[2 * n + i] = v;
  }
  return out;
}
