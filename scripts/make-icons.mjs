// Renders the ribbon/add-in icons (SVG -> PNG at the sizes Office asks for).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/assets');
mkdirSync(out, { recursive: true });

const BLUE = '#1A73E8';
const PURPLE = '#8B5CF6';
const GRAY = '#9AA0A6';
const ORANGE = '#F29900';

const wrap = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`;

// Small fraction glyph: two boxes and a bar, centred at (cx, cy).
const fraction = (cx, cy, s = 1, color = BLUE) => `
  <rect x="${cx - 4 * s}" y="${cy - 10 * s}" width="${8 * s}" height="${7 * s}" rx="${1.6 * s}" fill="none" stroke="${color}" stroke-width="${2 * s}"/>
  <rect x="${cx - 6.5 * s}" y="${cy - 1.1 * s}" width="${13 * s}" height="${2.2 * s}" rx="${1.1 * s}" fill="${color}"/>
  <rect x="${cx - 4 * s}" y="${cy + 3 * s}" width="${8 * s}" height="${7 * s}" rx="${1.6 * s}" fill="none" stroke="${color}" stroke-width="${2 * s}"/>`;

const ICONS = {
  logo: wrap(`
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4F8DFD"/><stop offset="1" stop-color="${PURPLE}"/></linearGradient></defs>
    <rect width="32" height="32" rx="9" fill="url(#g)"/>
    <path d="M8 17.5h3l3 5.5 5-14h5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  inline: wrap(`
    <rect x="2" y="15" width="7" height="2.4" rx="1.2" fill="${GRAY}"/>
    ${fraction(16, 16)}
    <rect x="23" y="15" width="7" height="2.4" rx="1.2" fill="${GRAY}"/>`),
  display: wrap(`
    <rect x="3" y="2" width="26" height="2.4" rx="1.2" fill="${GRAY}"/>
    ${fraction(16, 16, 0.85)}
    <rect x="3" y="27.6" width="26" height="2.4" rx="1.2" fill="${GRAY}"/>`),
  edit: wrap(`
    ${fraction(11, 16, 0.9)}
    <path d="M27.5 9.5l-9.8 9.8-3.7 1 1-3.7 9.8-9.8a1.9 1.9 0 0 1 2.7 0 1.9 1.9 0 0 1 0 2.7z" fill="${ORANGE}"/>`),
  right: wrap(`
    ${fraction(12, 16, 0.85)}
    <text x="30" y="20" text-anchor="end" font-family="Segoe UI, Arial" font-size="10" font-weight="700" fill="${GRAY}">(1)</text>`),
  left: wrap(`
    <text x="2" y="20" font-family="Segoe UI, Arial" font-size="10" font-weight="700" fill="${GRAY}">(1)</text>
    ${fraction(21, 16, 0.85)}`),
  tex: wrap(`
    <rect x="1.5" y="6" width="29" height="20" rx="5" fill="none" stroke="${PURPLE}" stroke-width="2"/>
    <text x="16" y="21" text-anchor="middle" font-family="Segoe UI, Arial" font-size="12" font-weight="700" fill="${PURPLE}">TeX</text>`),
  renumber: wrap(`
    <text x="16" y="21" text-anchor="middle" font-family="Segoe UI, Arial" font-size="12" font-weight="700" fill="${BLUE}">(n)</text>
    <path d="M27 9a12 12 0 0 0-20-2M5 23a12 12 0 0 0 20 2" fill="none" stroke="${ORANGE}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M7 3v4h4M25 29v-4h-4" fill="none" stroke="${ORANGE}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  convert: wrap(`
    <rect x="2" y="4" width="13" height="11" rx="2.5" fill="none" stroke="${BLUE}" stroke-width="2"/>
    <path d="M5 12l3-4 2.5 3 1.5-2 2 3" fill="none" stroke="${BLUE}" stroke-width="1.6" stroke-linejoin="round"/>
    ${fraction(23, 21, 0.62, PURPLE)}
    <path d="M17 5h7a3 3 0 0 1 3 3v1M15 27H8a3 3 0 0 1-3-3v-1" fill="none" stroke="${ORANGE}" stroke-width="2" stroke-linecap="round"/>
    <path d="M25 7l2 2.5 2-2.5M3 25l2-2.5 2 2.5" fill="none" stroke="${ORANGE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
  mathtype: wrap(`
    <rect x="1.5" y="3" width="17" height="14" rx="3" fill="#E8F0FE" stroke="${BLUE}" stroke-width="1.6"/>
    <text x="10" y="13.5" text-anchor="middle" font-family="Segoe UI, Arial" font-size="8.5" font-weight="700" fill="${BLUE}">MT</text>
    ${fraction(24, 21, 0.6, PURPLE)}
    <path d="M20 8h5a3 3 0 0 1 3 3M12 26H7a3 3 0 0 1-3-3" fill="none" stroke="${ORANGE}" stroke-width="2" stroke-linecap="round"/>
    <path d="M26 9.5l2 2.5 2-2.5M2 21.5l2-2.5 2 2.5" fill="none" stroke="${ORANGE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`),
  geometry: wrap(`
    <path d="M4 26L16 5l12 21z" fill="#E8F5EC" stroke="#1e8449" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="16" cy="18" r="6" fill="none" stroke="${BLUE}" stroke-width="1.8"/>
    <circle cx="4" cy="26" r="2.4" fill="#1e8449"/><circle cx="28" cy="26" r="2.4" fill="#1e8449"/><circle cx="16" cy="5" r="2.4" fill="#1e8449"/>`),
  geoEdit: wrap(`
    <path d="M3 27L12 9l9 18z" fill="#E8F5EC" stroke="#1e8449" stroke-width="2" stroke-linejoin="round"/>
    <path d="M28.5 8.5l-9.8 9.8-3.7 1 1-3.7 9.8-9.8a1.9 1.9 0 0 1 2.7 0 1.9 1.9 0 0 1 0 2.7z" fill="${ORANGE}"/>`),
  ocr: wrap(`
    <path d="M3 10V6a3 3 0 0 1 3-3h4M22 3h4a3 3 0 0 1 3 3v4M29 22v4a3 3 0 0 1-3 3h-4M10 29H6a3 3 0 0 1-3-3v-4" fill="none" stroke="${ORANGE}" stroke-width="2.4" stroke-linecap="round"/>
    ${fraction(16, 16, 0.78)}`),
  help: wrap(`
    <circle cx="16" cy="16" r="13" fill="none" stroke="${BLUE}" stroke-width="2.4"/>
    <path d="M12.2 12.4a3.9 3.9 0 0 1 7.6 1.1c0 2.6-3.8 3.1-3.8 5.6" fill="none" stroke="${BLUE}" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="16" cy="23" r="1.7" fill="${BLUE}"/>`),
};

const SIZES = Object.fromEntries(Object.keys(ICONS).map((k) => [k, k === 'logo' ? [16, 32, 64, 80, 128] : [16, 32, 80]]));

for (const [name, svg] of Object.entries(ICONS)) {
  for (const size of SIZES[name]) {
    await sharp(Buffer.from(svg), { density: 72 * (size / 32) * 4 })
      .resize(size, size)
      .png()
      .toFile(resolve(out, `${name}-${size}.png`));
  }
}
console.log('Icons written to', out);
