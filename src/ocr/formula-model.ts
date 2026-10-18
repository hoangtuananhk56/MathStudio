/**
 * The formula recognition model (Pix2Text MFR 1.5, a TrOCR-style encoder–decoder):
 * picture → LaTeX, greedy decoding. Runs with onnxruntime-web, in a worker or in tests.
 */
import type * as Ort from 'onnxruntime-web';
import { MODEL_SIZE } from './image';
import { cleanOcrLatex } from './latex-clean';
import { BOS, decodeTokens, EOS } from './tokenizer';

export interface FormulaReading {
  /** Tidy LaTeX, ready for the editor. */
  latex: string;
  /** What the model wrote, before tidying. */
  raw: string;
  /** Mean probability of the chosen tokens, 0…1: below ~0.8 the reading deserves a look. */
  confidence: number;
}

export interface ModelFiles {
  encoder: Uint8Array;
  decoder: Uint8Array;
  vocab: string[];
}

const MAX_TOKENS = 400;

/** True when the end of the sequence repeats itself (a stuck decoder). */
function looping(ids: number[]): boolean {
  for (let len = 1; len <= 12; len++) {
    const reps = len === 1 ? 24 : Math.ceil(32 / len);
    if (ids.length < len * reps) continue;
    const tail = ids.slice(-len);
    let same = true;
    for (let r = 2; r <= reps && same; r++) for (let i = 0; i < len && same; i++) same = ids[ids.length - r * len + i] === tail[i];
    if (same) return true;
  }
  return false;
}

export class FormulaModel {
  private constructor(
    private readonly ort: typeof Ort,
    private readonly encoder: Ort.InferenceSession,
    private readonly decoder: Ort.InferenceSession,
    private readonly vocab: string[],
  ) {}

  static async create(ort: typeof Ort, files: ModelFiles): Promise<FormulaModel> {
    const opts: Ort.InferenceSession.SessionOptions = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
    const encoder = await ort.InferenceSession.create(files.encoder, opts);
    const decoder = await ort.InferenceSession.create(files.decoder, opts);
    return new FormulaModel(ort, encoder, decoder, files.vocab);
  }

  /** Reads a picture prepared by `formulaInput` (`maxTokens`: stop early, e.g. for a point's name). */
  async read(pixels: Float32Array, maxTokens = MAX_TOKENS): Promise<FormulaReading> {
    const { Tensor } = this.ort;
    const enc = await this.encoder.run({ pixel_values: new Tensor('float32', pixels, [1, 3, MODEL_SIZE, MODEL_SIZE]) });
    const hidden = enc.last_hidden_state;
    const ids = [BOS];
    let logProb = 0;
    try {
      while (ids.length <= maxTokens) {
        const input = new Tensor('int64', BigInt64Array.from(ids, (i) => BigInt(i)), [1, ids.length]);
        const out = await this.decoder.run({ input_ids: input, encoder_hidden_states: hidden });
        const logits = out.logits.data as Float32Array;
        const v = this.vocab.length;
        const base = (ids.length - 1) * v;
        let best = 0;
        for (let i = 1; i < v; i++) if (logits[base + i] > logits[base + best]) best = i;
        let sum = 0;
        for (let i = 0; i < v; i++) sum += Math.exp(logits[base + i] - logits[base + best]);
        logProb -= Math.log(sum);
        input.dispose();
        out.logits.dispose();
        if (best === EOS) break;
        ids.push(best);
        if (looping(ids)) break;
      }
    } finally {
      hidden.dispose();
    }
    const raw = decodeTokens(this.vocab, ids);
    return { raw, latex: cleanOcrLatex(raw), confidence: Math.exp(logProb / Math.max(1, ids.length)) };
  }

  async dispose(): Promise<void> {
    await this.encoder.release();
    await this.decoder.release();
  }
}
