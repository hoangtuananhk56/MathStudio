// Copies runtime assets that must be served locally (offline support).
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dest = resolve(root, 'public/mathlive/fonts');
mkdirSync(dest, { recursive: true });
cpSync(resolve(root, 'node_modules/mathlive/fonts'), dest, { recursive: true });
console.log('Copied MathLive fonts ->', dest);

// Math fonts offered for download in the task pane (OFL / GUST licensed).
const fonts = resolve(root, 'public/fonts');
mkdirSync(fonts, { recursive: true });
cpSync(resolve(root, 'vendor/fonts'), fonts, { recursive: true });
console.log('Copied math fonts ->', fonts);
