import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/geometry/engine';
import { emptyConstruction, type Construction, type Def } from '../src/geometry/model';
import { readFileSync } from 'node:fs';
import { decodeConstructionFromOoxml, decodeConstructionFromSvg, renderConstruction } from '../src/geometry/render';

function triangle(): Construction {
  const c = emptyConstruction();
  const defs: [string, Def, object?][] = [
    ['A', { t: 'point', x: 0, y: 0 }],
    ['B', { t: 'point', x: 4, y: 0 }],
    ['C', { t: 'point', x: 0, y: 3 }],
    ['abc', { t: 'polygon', pts: ['A', 'B', 'C'] }],
    ['AB', { t: 'segment', a: 'A', b: 'B' }, { ticks: 2 }],
    ['ang', { t: 'angle', a: 'B', b: 'A', c: 'C' }],
    ['v', { t: 'vector', a: 'B', b: 'C' }],
    ['d', { t: 'line', a: 'A', b: 'B' }, { dash: 'dashed' }],
    ['M', { t: 'midpoint', a: 'B', b: 'C' }],
  ];
  c.objects = defs.map(([id, def, style]) => ({ id, def, style: { ...(style ?? {}) } }));
  return c;
}

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');

describe('geometry renderer', () => {
  it('exports a well-formed SVG cropped to the drawing, in centimetres', () => {
    const c = triangle();
    const fig = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 });
    expect(parse(fig.svg).getElementsByTagName('parsererror').length).toBe(0);
    // 4 × 3 cm triangle; line AB runs 0.7 cm past A and B; plus a 0.8 cm margin each side
    expect(fig.width).toBeCloseTo(7, 6);
    expect(fig.height).toBeCloseTo(5.1, 6);
    expect(fig.svg).toMatch(/width="7cm" height="5.1cm"/);
  });

  it('embeds the construction so the figure can be edited again', () => {
    const c = triangle();
    const fig = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 });
    expect(decodeConstructionFromSvg(fig.svg)).toEqual(c);
  });

  it('reads the figure back from the OOXML Word returns (SVG as base64 or as XML)', () => {
    const c = triangle();
    const svg = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 }).svg;
    const part = (body: string) =>
      `<pkg:package><pkg:part pkg:name="/word/media/image1.png" pkg:contentType="image/png"><pkg:binaryData>iVBO</pkg:binaryData></pkg:part>` +
      `<pkg:part pkg:name="/word/media/image2.svg" pkg:contentType="image/svg+xml" pkg:compression="store">${body}</pkg:part></pkg:package>`;
    const b64 = Buffer.from(svg, 'utf8').toString('base64').replace(/(.{76})/g, '$1\n');
    expect(decodeConstructionFromOoxml(part(`<pkg:binaryData>${b64}</pkg:binaryData>`))).toEqual(c);
    // what Word gives back once it has saved the document
    expect(decodeConstructionFromOoxml(part(`<pkg:xmlData pkg:originalXmlStandalone="no">${svg}</pkg:xmlData>`))).toEqual(c);
    expect(decodeConstructionFromOoxml(part('<pkg:binaryData>AAAA</pkg:binaryData>'))).toBeNull();
  });

  it.skipIf(!process.env.FIGURE_OOXML)('reads a figure from OOXML produced by Word', () => {
    const c = decodeConstructionFromOoxml(readFileSync(process.env.FIGURE_OOXML!, 'utf8'));
    expect(c?.objects.length).toBeGreaterThan(0);
  });

  it('draws textbook marks: right angle square, equal ticks, vector arrow, dashes, labels', () => {
    const c = triangle();
    const svg = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 }).svg;
    expect(svg).toContain('stroke-dasharray="6 4"'); // dashed line
    expect(svg).toMatch(/<path d="M[^"]*Z" fill="#111111"\/>/); // arrow head
    expect((svg.match(/<text /g) ?? []).length).toBeGreaterThanOrEqual(4); // A B C M
    expect(svg).toContain('font-style:italic');
    // right angle at A is drawn as a square corner (no arc command)
    const angPaths = svg.match(/<path d="M[\d. ]+L[\d. ]+L[\d. ]+" stroke="#111111"/g) ?? [];
    expect(angPaths.length).toBeGreaterThan(0);
  });

  it('formats measures with a decimal comma in the Vietnamese style', () => {
    const c = triangle();
    c.objects.push({ id: 'angB', def: { t: 'angle', a: 'C', b: 'B', c: 'A' }, style: { showValue: true } });
    c.angleFormat = 'decimal';
    const vn = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 }).svg;
    expect(vn).toContain('36,9°');
    c.preset = 'intl';
    const intl = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 }).svg;
    expect(intl).toContain('36.9°');
  });

  it('escapes labels and keeps XML valid', () => {
    const c = triangle();
    c.objects[0].style.label = 'A<1&"';
    const svg = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 }).svg;
    expect(parse(svg).getElementsByTagName('parsererror').length).toBe(0);
  });

  it('renders the international preset with fills and colours', () => {
    const c = triangle();
    c.preset = 'intl';
    const svg = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 }).svg;
    expect(svg).toContain('fill-opacity="0.07"');
    expect(svg).toContain('#c0392b');
  });
});
