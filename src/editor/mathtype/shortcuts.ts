/**
 * MathType-compatible keyboard shortcuts for the equation editor.
 * Handled in the capture phase so they win over MathLive's own bindings and
 * over browser accelerators (Ctrl+F find, Ctrl+R reload…).
 */
import { GREEK_KEYS, SYMBOL_KEYS, TEMPLATE_KEYS } from './data';

export type MathStyle = 'math' | 'text' | 'function' | 'variable' | 'greek' | 'vector' | 'number';
export type Chord = 'greek' | 'symbol' | 'template';

export interface ShortcutActions {
  insert(latex: string): void;
  style(style: MathStyle): void;
  submit(): void;
  cancel(): void;
  /** Called when a two-key chord starts (null = finished/aborted), for the status bar hint. */
  chord(chord: Chord | null): void;
}

interface Binding {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  code: string;
  run(a: ShortcutActions): void;
}

const ins = (latex: string) => (a: ShortcutActions) => a.insert(latex);

const BINDINGS: Binding[] = [
  { ctrl: true, code: 'KeyF', run: ins('\\frac{#0}{#?}') },
  { ctrl: true, code: 'Slash', run: ins('#0/#?') },
  { ctrl: true, code: 'KeyR', run: ins('\\sqrt{#0}') },
  { ctrl: true, code: 'KeyH', run: ins('#@^{#?}') },
  { ctrl: true, code: 'KeyL', run: ins('#@_{#?}') },
  { ctrl: true, code: 'KeyJ', run: ins('#@_{#?}^{#?}') },
  { ctrl: true, code: 'Digit9', run: ins('\\left(#0\\right)') },
  { ctrl: true, code: 'Digit0', run: ins('\\left(#0\\right)') },
  { ctrl: true, code: 'BracketLeft', run: ins('\\left[#0\\right]') },
  { ctrl: true, code: 'BracketRight', run: ins('\\left[#0\\right]') },
  { ctrl: true, shift: true, code: 'BracketLeft', run: ins('\\left\\{#0\\right\\}') },
  { ctrl: true, shift: true, code: 'BracketRight', run: ins('\\left\\{#0\\right\\}') },
  { ctrl: true, shift: true, code: 'Backslash', run: ins('\\left|#0\\right|') },
  { ctrl: true, code: 'KeyI', run: ins('\\int_{#?}^{#?}#?') },
  { ctrl: true, shift: true, code: 'Minus', run: ins('\\overline{#0}') },
  { ctrl: true, alt: true, code: 'Minus', run: ins('\\overrightarrow{#0}') },
  { ctrl: true, alt: true, code: 'Quote', run: ins("'") },
  { ctrl: true, code: 'Space', run: ins('\\,') },
  { ctrl: true, shift: true, code: 'Space', run: ins('\\;') },
  // Styles (MathType: Style menu)
  { ctrl: true, shift: true, code: 'Equal', run: (a) => a.style('math') },
  { ctrl: true, shift: true, code: 'KeyE', run: (a) => a.style('text') },
  { ctrl: true, shift: true, code: 'KeyF', run: (a) => a.style('function') },
  { ctrl: true, shift: true, code: 'KeyI', run: (a) => a.style('variable') },
  { ctrl: true, shift: true, code: 'KeyG', run: (a) => a.style('greek') },
  { ctrl: true, shift: true, code: 'KeyB', run: (a) => a.style('vector') },
  { ctrl: true, shift: true, code: 'KeyN', run: (a) => a.style('number') },
  // Document
  { ctrl: true, code: 'KeyS', run: (a) => a.submit() },
  { ctrl: true, code: 'Enter', run: (a) => a.submit() },
  { ctrl: true, code: 'F4', run: (a) => a.cancel() },
];

const CHORD_STARTS: Record<string, Chord> = { KeyG: 'greek', KeyK: 'symbol', KeyT: 'template' };
const CHORD_TABLES: Record<Chord, Record<string, string>> = {
  greek: GREEK_KEYS,
  symbol: SYMBOL_KEYS,
  template: TEMPLATE_KEYS,
};

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

/** Human-readable list for the Help ▸ Shortcuts sheet. */
export const SHORTCUT_SHEET: { keys: string; vi: string; en: string }[] = [
  { keys: 'Ctrl+F', vi: 'Phân số', en: 'Fraction' },
  { keys: 'Ctrl+/', vi: 'Phân số gạch chéo', en: 'Slash fraction' },
  { keys: 'Ctrl+R', vi: 'Căn bậc hai', en: 'Square root' },
  { keys: 'Ctrl+T, N', vi: 'Căn bậc n', en: 'Nth root' },
  { keys: 'Ctrl+H', vi: 'Chỉ số trên (mũ)', en: 'Superscript' },
  { keys: 'Ctrl+L', vi: 'Chỉ số dưới', en: 'Subscript' },
  { keys: 'Ctrl+J', vi: 'Chỉ số trên và dưới', en: 'Sub & superscript' },
  { keys: 'Ctrl+9 / Ctrl+0', vi: 'Ngoặc tròn', en: 'Parentheses' },
  { keys: 'Ctrl+[ / Ctrl+]', vi: 'Ngoặc vuông', en: 'Brackets' },
  { keys: 'Ctrl+{ / Ctrl+}', vi: 'Ngoặc nhọn', en: 'Braces' },
  { keys: 'Ctrl+|', vi: 'Giá trị tuyệt đối', en: 'Absolute value' },
  { keys: 'Ctrl+I', vi: 'Tích phân', en: 'Integral' },
  { keys: 'Ctrl+T, S', vi: 'Tổng', en: 'Summation' },
  { keys: 'Ctrl+T, L', vi: 'Giới hạn', en: 'Limit' },
  { keys: 'Ctrl+T, M', vi: 'Ma trận 2×2', en: '2×2 matrix' },
  { keys: 'Ctrl+T, C', vi: 'Hệ phương trình', en: 'System of equations' },
  { keys: 'Ctrl+Shift+-', vi: 'Gạch trên', en: 'Overbar' },
  { keys: 'Ctrl+Alt+-', vi: 'Vectơ (mũi tên trên)', en: 'Vector arrow' },
  { keys: "Ctrl+Alt+'", vi: 'Dấu phẩy (đạo hàm)', en: 'Prime' },
  { keys: 'Ctrl+G, chữ', vi: 'Chữ Hy Lạp (a→α, b→β, p→π, q→θ, D→Δ…)', en: 'Greek letter (a→α, b→β, p→π, q→θ, D→Δ…)' },
  { keys: 'Ctrl+K, phím', vi: 'Ký hiệu (I→∞, A→→, D→∂, T→×, +→±, <→≤, >→≥, /→≠)', en: 'Symbol (I→∞, A→→, D→∂, T→×, +→±, <→≤, >→≥, /→≠)' },
  { keys: 'Ctrl+Space', vi: 'Khoảng trắng hẹp', en: 'Thin space' },
  { keys: 'Ctrl+Shift+E', vi: 'Kiểu văn bản', en: 'Text style' },
  { keys: 'Ctrl+Shift+=', vi: 'Kiểu toán', en: 'Math style' },
  { keys: 'Ctrl+Shift+F', vi: 'Kiểu hàm', en: 'Function style' },
  { keys: 'Ctrl+Shift+I', vi: 'Kiểu biến', en: 'Variable style' },
  { keys: 'Ctrl+Shift+B', vi: 'Kiểu vectơ – ma trận', en: 'Vector-matrix style' },
  { keys: 'Tab / Shift+Tab', vi: 'Sang ô kế tiếp / trước', en: 'Next / previous slot' },
  { keys: 'Ctrl+S', vi: 'Cập nhật vào Word và đóng', en: 'Update Word and close' },
  { keys: 'Esc / Ctrl+F4', vi: 'Đóng trình soạn', en: 'Close the editor' },
];

/** Returns a keydown handler implementing the MathType shortcuts. */
export function createShortcutHandler(actions: ShortcutActions): (e: KeyboardEvent) => void {
  let pending: Chord | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const endChord = () => {
    pending = null;
    clearTimeout(timer);
    actions.chord(null);
  };

  return (e: KeyboardEvent) => {
    if (e.isComposing || MODIFIER_KEYS.has(e.key)) return;

    if (pending) {
      const table = CHORD_TABLES[pending];
      const latex = table[e.key] ?? table[e.key.toLowerCase()];
      e.preventDefault();
      e.stopPropagation();
      endChord();
      if (latex) actions.insert(latex);
      return;
    }

    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.shiftKey && !e.altKey && CHORD_STARTS[e.code]) {
      e.preventDefault();
      e.stopPropagation();
      pending = CHORD_STARTS[e.code];
      actions.chord(pending);
      clearTimeout(timer);
      timer = setTimeout(endChord, 4000);
      return;
    }

    const b = BINDINGS.find(
      (x) => x.code === e.code && !!x.ctrl === ctrl && !!x.shift === e.shiftKey && !!x.alt === e.altKey,
    );
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    b.run(actions);
  };
}
