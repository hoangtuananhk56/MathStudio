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

// OCR, all served by the add-in (offline): the formula model (vendor/models, see
// scripts/build-ocr-model.py), Tesseract and its Vietnamese data. (ONNX Runtime's
// WebAssembly is bundled by Vite with the OCR worker.)
const ocr = resolve(root, 'public/ocr');
mkdirSync(resolve(ocr, 'tesseract/lang'), { recursive: true });
cpSync(resolve(root, 'vendor/models/mfr'), resolve(ocr, 'mfr'), { recursive: true });
cpSync(resolve(root, 'node_modules/tesseract.js/dist/worker.min.js'), resolve(ocr, 'tesseract/worker.min.js'));
for (const core of ['tesseract-core-relaxedsimd-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-lstm']) {
  cpSync(resolve(root, `node_modules/tesseract.js-core/${core}.wasm.js`), resolve(ocr, `tesseract/${core}.wasm.js`));
}
cpSync(resolve(root, 'node_modules/@tesseract.js-data/vie/4.0.0_best_int/vie.traineddata.gz'), resolve(ocr, 'tesseract/lang/vie.traineddata.gz'));
console.log('Copied OCR runtime ->', ocr);
