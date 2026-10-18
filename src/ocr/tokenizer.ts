/**
 * Decoder of the formula model's byte-level BPE vocabulary (GPT-2 style): every byte is
 * written as a printable character, and "Ġ" (byte 0x20) marks a space.
 */

/** Printable character → byte, the inverse of GPT-2's bytes_to_unicode table. */
const BYTE_OF: Map<string, number> = (() => {
  const printable: number[] = [];
  for (let b = 0x21; b <= 0x7e; b++) printable.push(b);
  for (let b = 0xa1; b <= 0xac; b++) printable.push(b);
  for (let b = 0xae; b <= 0xff; b++) printable.push(b);
  const map = new Map<string, number>();
  let extra = 0;
  for (let b = 0; b < 256; b++) {
    const ch = printable.includes(b) ? b : 256 + extra++;
    map.set(String.fromCodePoint(ch), b);
  }
  return map;
})();

export const BOS = 1;
export const EOS = 2;
const SPECIAL = new Set([0, BOS, EOS, 3, 4]);

/** The text of a token sequence (special tokens dropped), like HF `tokenizer.decode`. */
export function decodeTokens(vocab: readonly string[], ids: readonly number[]): string {
  const bytes: number[] = [];
  for (const id of ids) {
    if (SPECIAL.has(id)) continue;
    for (const ch of vocab[id] ?? '') {
      const b = BYTE_OF.get(ch);
      if (b !== undefined) bytes.push(b);
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes)).trim();
}
