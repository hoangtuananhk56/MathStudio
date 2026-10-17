import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { MathfieldElement, type Style } from 'mathlive';

// Fonts come from the bundled stylesheets (mathlive/fonts.css + math-fonts.css, imported in
// main.tsx) so the editor works offline and uses the MathType-like Times faces.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

export type EditorCommand =
  | 'undo'
  | 'redo'
  | 'cutToClipboard'
  | 'copyToClipboard'
  | 'pasteFromClipboard'
  | 'selectAll'
  | 'moveToNextPlaceholder'
  | 'moveToPreviousPlaceholder';

export interface MathEditorHandle {
  insert(latex: string): void;
  getLatex(): string;
  getMathml(): string;
  setLatex(latex: string): void;
  command(cmd: EditorCommand): void;
  applyStyle(style: Style): void;
  switchMode(mode: 'math' | 'text'): void;
  focus(): void;
  toggleKeyboard(): void;
}

interface Props {
  initialLatex: string;
  placeholder: string;
  /** Font size of the editing area in px (zoom). */
  fontSize: number;
  onChange(latex: string): void;
  /** Capture-phase key handler (MathType shortcuts), runs before MathLive's own bindings. */
  onKeyDown(e: KeyboardEvent): void;
}

export const MathEditor = forwardRef<MathEditorHandle, Props>(function MathEditor(
  { initialLatex, placeholder, fontSize, onChange, onKeyDown },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const mf = useRef<MathfieldElement | null>(null);
  const callbacks = useRef({ onChange, onKeyDown });
  callbacks.current = { onChange, onKeyDown };

  const emit = () => mf.current && callbacks.current.onChange(mf.current.getValue('latex-without-placeholders'));

  useEffect(() => {
    const field = new MathfieldElement();
    field.className = 'math-field';
    field.mathVirtualKeyboardPolicy = 'manual';
    field.smartFence = true;
    field.popoverPolicy = 'off';
    host.current!.appendChild(field);
    field.value = initialLatex;
    field.addEventListener('input', emit);
    field.addEventListener('keydown', (e) => callbacks.current.onKeyDown(e), { capture: true });
    mf.current = field;
    requestAnimationFrame(() => field.focus());
    return () => {
      field.remove();
      mf.current = null;
    };
    // The field is created once; later prop changes are applied below or via the handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mf.current) return;
    mf.current.placeholder = `\\text{${placeholder}}`;
    mf.current.setAttribute('aria-label', placeholder);
  }, [placeholder]);

  useEffect(() => {
    if (mf.current) mf.current.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  useImperativeHandle(ref, () => ({
    insert(latex) {
      mf.current?.insert(latex, { selectionMode: 'placeholder', focus: true });
      emit();
    },
    getLatex: () => mf.current?.getValue('latex-without-placeholders') ?? '',
    getMathml: () => mf.current?.getValue('math-ml') ?? '',
    setLatex(latex) {
      if (!mf.current) return;
      mf.current.value = latex;
      emit();
    },
    command(cmd) {
      mf.current?.executeCommand(cmd);
      mf.current?.focus();
      emit();
    },
    applyStyle(style) {
      mf.current?.applyStyle(style);
      mf.current?.focus();
      emit();
    },
    switchMode(mode) {
      mf.current?.executeCommand(['switchMode', mode]);
      mf.current?.focus();
    },
    focus: () => mf.current?.focus(),
    toggleKeyboard() {
      const kb = window.mathVirtualKeyboard;
      mf.current?.focus();
      if (kb.visible) kb.hide();
      else kb.show({ animate: true });
    },
  }));

  return <div ref={host} className="math-host" />;
});
