/**
 * Virtual drawing instruments for the editor only (never exported): a ruler (cm and mm),
 * a set square, and a protractor with both scales — so children read measures the way
 * they do on paper. Sizes are real centimetres in the figure.
 */
import { distanceTo, type Values, type Vec } from '../geometry/engine';
import type { Construction } from '../geometry/model';

export type InstrumentKind = 'ruler' | 'setSquare' | 'protractor';

export interface Instrument {
  kind: InstrumentKind;
  /** Anchor in world cm: the 0 mark (ruler), the right-angle corner (set square), the centre (protractor). */
  x: number;
  y: number;
  /** Rotation in degrees, counter-clockwise. */
  rot: number;
}

const RULER_CM = 15;
const RULER_W = 2.2;
const SQUARE_CM = 8;
const PROTRACTOR_R = 5;

/** Where the rotate handle sits, in the instrument's own cm coordinates (y up). */
export function handleLocal(kind: InstrumentKind): Vec {
  if (kind === 'ruler') return { x: RULER_CM - 1.1, y: RULER_W / 2 };
  if (kind === 'setSquare') return { x: SQUARE_CM - 1.6, y: 0.7 };
  return { x: PROTRACTOR_R * 0.92, y: PROTRACTOR_R * 0.62 };
}

/** World position of a point given in the instrument's own coordinates. */
export function toWorld(ins: Instrument, local: Vec): Vec {
  const a = (ins.rot * Math.PI) / 180;
  return { x: ins.x + local.x * Math.cos(a) - local.y * Math.sin(a), y: ins.y + local.x * Math.sin(a) + local.y * Math.cos(a) };
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** SVG for the instruments, in screen pixels. `X`/`Y` map world → screen, `s` is px per cm. */
export function instrumentsSvg(list: Instrument[], X: (p: Vec) => number, Y: (p: Vec) => number, s: number): string {
  return list
    .map((ins) => {
      // local cm (y up) → px (y down); the group is then turned and placed
      const P = (u: number, v: number) => `${f(u * s)} ${f(-v * s)}`;
      const parts: string[] = [];
      const font = (size: number) => `font-family:Segoe UI,Arial,sans-serif;font-size:${f(size)}px;fill:#3d3d3d`;
      if (ins.kind === 'ruler') {
        parts.push(`<path d="M${P(-0.4, 0)}L${P(RULER_CM - 0.4, 0)}L${P(RULER_CM - 0.4, RULER_W)}L${P(-0.4, RULER_W)}Z" fill="#fff6cf" fill-opacity="0.82" stroke="#b08d2b" stroke-width="1"/>`);
        const ticks: string[] = [];
        for (let mm = 0; mm <= (RULER_CM - 1) * 10; mm++) {
          const u = mm / 10;
          const h = mm % 10 === 0 ? 0.45 : mm % 5 === 0 ? 0.3 : 0.18;
          ticks.push(`M${P(u, 0)}L${P(u, h)}`);
          if (mm % 10 === 0) parts.push(`<text x="${f(u * s - 3)}" y="${f(-0.75 * s)}" style="${font(Math.max(8, s * 0.26))}">${mm / 10}</text>`);
        }
        parts.push(`<path d="${ticks.join('')}" stroke="#5a4a12" stroke-width="0.8"/>`);
        parts.push(`<text x="${f(RULER_CM * s * 0.42)}" y="${f(-1.55 * s)}" style="${font(Math.max(8, s * 0.22))}">cm</text>`);
      } else if (ins.kind === 'setSquare') {
        const L = SQUARE_CM;
        parts.push(`<path d="M${P(0, 0)}L${P(L, 0)}L${P(0, L)}Z" fill="#d8ecff" fill-opacity="0.75" stroke="#3a78b5" stroke-width="1"/>`);
        parts.push(`<path d="M${P(1.6, 1.6)}L${P(L - 3.2, 1.6)}L${P(1.6, L - 3.2)}Z" fill="#ffffff" fill-opacity="0.6" stroke="#3a78b5" stroke-width="0.8"/>`);
        const ticks: string[] = [];
        for (let mm = 0; mm <= (L - 0.5) * 10; mm += 1) {
          const h = mm % 10 === 0 ? 0.4 : mm % 5 === 0 ? 0.25 : 0.14;
          ticks.push(`M${P(mm / 10, 0)}L${P(mm / 10, h)}`);
          if (mm % 10 === 0 && mm > 0) parts.push(`<text x="${f((mm / 10) * s - 3)}" y="${f(-0.7 * s)}" style="${font(Math.max(8, s * 0.24))}">${mm / 10}</text>`);
        }
        parts.push(`<path d="${ticks.join('')}" stroke="#1f4e7a" stroke-width="0.8"/>`);
        // the right-angle corner
        parts.push(`<path d="M${P(0.5, 0)}L${P(0.5, 0.5)}L${P(0, 0.5)}" fill="none" stroke="#1f4e7a" stroke-width="1"/>`);
      } else {
        const R = PROTRACTOR_R;
        parts.push(`<path d="M${P(-R, 0)}A${f(R * s)} ${f(R * s)} 0 0 1 ${P(R, 0)}Z" fill="#e9f7ec" fill-opacity="0.8" stroke="#2e7d4a" stroke-width="1"/>`);
        const ticks: string[] = [];
        for (let d = 0; d <= 180; d++) {
          const a = (d * Math.PI) / 180;
          const h = d % 10 === 0 ? 0.5 : d % 5 === 0 ? 0.32 : 0.18;
          ticks.push(`M${P(R * Math.cos(a), R * Math.sin(a))}L${P((R - h) * Math.cos(a), (R - h) * Math.sin(a))}`);
          if (d % 10 === 0) {
            // outer scale counts from the right, inner scale from the left
            const o = { x: (R - 0.85) * Math.cos(a), y: (R - 0.85) * Math.sin(a) };
            const i = { x: (R - 1.45) * Math.cos(a), y: (R - 1.45) * Math.sin(a) };
            parts.push(`<text x="${f(o.x * s - 6)}" y="${f(-o.y * s + 3)}" style="${font(Math.max(7, s * 0.2))}">${d}</text>`);
            parts.push(`<text x="${f(i.x * s - 6)}" y="${f(-i.y * s + 3)}" style="${font(Math.max(6, s * 0.16))};fill:#2e7d4a">${180 - d}</text>`);
          }
        }
        parts.push(`<path d="${ticks.join('')}" stroke="#1d5233" stroke-width="0.7"/>`);
        parts.push(`<path d="M${P(-R, 0)}L${P(R, 0)}M${P(0, 0)}L${P(0, 0.6)}" stroke="#1d5233" stroke-width="1"/>`);
        parts.push(`<circle cx="0" cy="0" r="2.5" fill="#1d5233"/>`);
      }
      // rotate handle
      const h = handleLocal(ins.kind);
      parts.push(
        `<g data-instr="${ins.kind}" data-rot="1" style="cursor:grab"><circle cx="${f(h.x * s)}" cy="${f(-h.y * s)}" r="11" fill="#ffffff" stroke="#1a73e8" stroke-width="1.6"/>` +
          `<text x="${f(h.x * s - 6)}" y="${f(-h.y * s + 5)}" style="font-family:Segoe UI Symbol,Arial;font-size:14px;fill:#1a73e8">⟳</text></g>`,
      );
      return `<g data-instr="${ins.kind}" style="cursor:move" transform="translate(${f(X(ins))} ${f(Y(ins))}) rotate(${f(-ins.rot)})">${parts.join('')}</g>`;
    })
    .join('');
}

/**
 * On release: the anchor sticks to a nearby point, and the instrument lines up with a line
 * through that point when it is within 3°.
 */
export function snapInstrument(ins: Instrument, c: Construction, values: Values, tol: number): Instrument {
  let { x, y, rot } = ins;
  let best = tol;
  for (const o of c.objects) {
    const v = values.get(o.id);
    if (v?.k !== 'point' || o.style.hidden) continue;
    const d = Math.hypot(v.p.x - x, v.p.y - y);
    if (d < best) {
      best = d;
      x = v.p.x;
      y = v.p.y;
    }
  }
  let bestA = 3;
  for (const o of c.objects) {
    const v = values.get(o.id);
    if (v?.k !== 'straight' || o.style.hidden || distanceTo(v, { x, y }) > 1e-3) continue;
    for (const k of [0, 180]) {
      const a = (Math.atan2(v.d.y, v.d.x) * 180) / Math.PI + k;
      const diff = Math.abs(((rot - a + 540) % 360) - 180);
      if (diff < bestA) {
        bestA = diff;
        rot = a;
      }
    }
  }
  return { ...ins, x, y, rot: Math.round(rot * 100) / 100 };
}
