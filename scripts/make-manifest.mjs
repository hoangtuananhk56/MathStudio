// Writes the manifest for a public host: every https://localhost:3000 address becomes the
// host where the built add-in (dist/) is served.
// Usage: node scripts/make-manifest.mjs https://example.github.io/MathStudio [out=dist/manifest.xml]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!/^https:\/\/[^/]+/.test(host)) {
  console.error('Usage: node scripts/make-manifest.mjs https://your.host/path [out]');
  process.exit(1);
}
const out = resolve(root, process.argv[3] ?? 'dist/manifest.xml');
const origin = new URL(host).origin;
const xml = readFileSync(resolve(root, 'manifest.xml'), 'utf8')
  .replace(/<!--\s*Development manifest[\s\S]*?-->\s*/, '')
  // the app domain is an origin; every other address keeps its path under the host
  .replace(/<AppDomain>https:\/\/localhost:3000<\/AppDomain>/g, `<AppDomain>${origin}</AppDomain>`)
  .replace(/https:\/\/localhost:3000/g, host);
if (xml.includes('localhost')) throw new Error('localhost left in the manifest');
writeFileSync(out, xml);
console.log(`Manifest for ${host} -> ${out}`);
