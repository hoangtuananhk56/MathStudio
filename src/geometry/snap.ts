/**
 * Smart snapping for placing and dragging points:
 *  - alignment guides: horizontal / vertical with existing points,
 *  - grid (0.5 units) when the grid is shown,
 *  - with Shift, from an anchor point: 15° angle steps and lengths rounded to 0.5.
 */
import { add, dist, mul, sub, type Vec } from './engine';

export interface SnapContext {
  /** Screen pixels per world unit. */
  scale: number;
  /** Existing points to align with. */
  points: Vec[];
  /** The previously picked point of the current tool (segment start, angle vertex…). */
  anchor?: Vec | null;
  shift: boolean;
  grid: boolean;
}

export interface Guide {
  a: Vec;
  b: Vec;
}

export interface SnapResult {
  p: Vec;
  guides: Guide[];
  /** Human-readable measure while snapping from an anchor (e.g. "3 cm · 45°"). */
  measure?: { length: number; deg: number };
}

const ALIGN_PX = 7;
const round = (x: number, step: number) => Math.round(x / step) * step;

export function snapPoint(raw: Vec, ctx: SnapContext): SnapResult {
  const guides: Guide[] = [];
  let p = { ...raw };

  if (ctx.shift && ctx.anchor) {
    const v = sub(raw, ctx.anchor);
    const len = Math.max(0.5, round(Math.hypot(v.x, v.y), 0.5));
    const ang = round(Math.atan2(v.y, v.x), Math.PI / 12);
    p = add(ctx.anchor, { x: len * Math.cos(ang), y: len * Math.sin(ang) });
    guides.push({ a: ctx.anchor, b: p });
    return { p: clean(p), guides, measure: { length: len, deg: ((ang * 180) / Math.PI + 360) % 360 } };
  }

  if (ctx.grid) p = { x: round(raw.x, 0.5), y: round(raw.y, 0.5) };

  const tol = ALIGN_PX / ctx.scale;
  const candidates = ctx.anchor ? [ctx.anchor, ...ctx.points] : ctx.points;
  let bestX: Vec | null = null;
  let bestY: Vec | null = null;
  for (const q of candidates) {
    if (dist(q, raw) < tol) continue; // that is the point itself, not an alignment
    if (Math.abs(q.x - raw.x) < tol && (!bestX || Math.abs(q.x - raw.x) < Math.abs(bestX.x - raw.x))) bestX = q;
    if (Math.abs(q.y - raw.y) < tol && (!bestY || Math.abs(q.y - raw.y) < Math.abs(bestY.y - raw.y))) bestY = q;
  }
  if (bestX) {
    p.x = bestX.x;
    guides.push({ a: bestX, b: { x: bestX.x, y: p.y } });
  }
  if (bestY) {
    p.y = bestY.y;
    guides.push({ a: bestY, b: { x: p.x, y: bestY.y } });
  }
  p = clean(p);
  const measure = ctx.anchor ? { length: dist(ctx.anchor, p), deg: ((Math.atan2(p.y - ctx.anchor.y, p.x - ctx.anchor.x) * 180) / Math.PI + 360) % 360 } : undefined;
  return { p, guides, measure };
}

/** Removes floating-point noise (3.0000000004 -> 3). */
function clean(p: Vec): Vec {
  const c = (x: number) => Math.round(x * 1e6) / 1e6;
  return { x: c(p.x), y: c(p.y) };
}

/** Midpoint helper used by guide rendering. */
export const mid = (a: Vec, b: Vec): Vec => mul(add(a, b), 0.5);
