import { useEffect, useRef, useState, type ReactNode } from 'react';
import { convertLatexToMarkup } from 'mathlive';
import type { Lang } from '../shared/settings';
import type { ToolItem, ToolPalette } from './mathtype/data';

/* ----------------------------------- tiles ---------------------------------- */

const markupCache = new Map<string, string>();

/** Renders LaTeX to static markup; empty slots (#0, #@, #?) appear as small squares like MathType's templates. */
export function mathMarkup(latex: string): string {
  let html = markupCache.get(latex);
  if (html === undefined) {
    try {
      html = convertLatexToMarkup(latex.replace(/#0|#@|#\?/g, '\\square '));
    } catch {
      html = latex;
    }
    markupCache.set(latex, html);
  }
  return html;
}

export function Tile(props: { item: ToolItem; lang: Lang; onPick(latex: string): void; className?: string }) {
  const { item, lang } = props;
  return (
    <button
      className={props.className ?? 'tile'}
      title={item[lang]}
      aria-label={item[lang]}
      onMouseDown={(e) => e.preventDefault()} // keep the caret in the math field
      onClick={() => props.onPick(item.insert)}
      dangerouslySetInnerHTML={{ __html: mathMarkup(item.preview ?? item.insert) }}
    />
  );
}

/* ------------------------------ click-outside util --------------------------- */

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault(); // consumed: don't also close the editor
        close();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, ref]);
}

/* ------------------------- palette drop-down (rows 1–2) ---------------------- */

export function PaletteButton(props: {
  palette: ToolPalette;
  lang: Lang;
  open: boolean;
  onOpen(id: string | null): void;
  onPick(latex: string): void;
}) {
  const { palette, lang, open } = props;
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => props.onOpen(null), ref);

  return (
    <div className="pal" ref={ref}>
      <button
        className={`pal-btn ${open ? 'pal-open' : ''}`}
        title={palette[lang]}
        aria-label={palette[lang]}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => props.onOpen(open ? null : palette.id)}
      >
        <span className="pal-face" dangerouslySetInnerHTML={{ __html: mathMarkup(palette.face) }} />
        <svg className="caret" viewBox="0 0 10 10" width="8" height="8" aria-hidden>
          <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="pal-pop" role="menu" aria-label={palette[lang]}>
          <div className="pal-title">{palette[lang]}</div>
          <div className="pal-grid" style={{ gridTemplateColumns: `repeat(${palette.cols ?? 6}, auto)` }}>
            {palette.items.map((item, i) => (
              <Tile
                key={i}
                item={item}
                lang={lang}
                className="pal-tile"
                onPick={(latex) => {
                  props.onOpen(null);
                  props.onPick(latex);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- menu bar --------------------------------- */

export type MenuEntry =
  | { label: string; shortcut?: string; checked?: boolean; disabled?: boolean; onClick(): void }
  | 'separator';

export interface MenuDef {
  id: string;
  label: string;
  entries: MenuEntry[];
}

export function MenuBar(props: { menus: MenuDef[]; right?: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open !== null, () => setOpen(null), ref);

  return (
    <div className="menubar" ref={ref} role="menubar">
      {props.menus.map((m) => (
        <div key={m.id} className="menu">
          <button
            role="menuitem"
            className={`menu-btn ${open === m.id ? 'menu-open' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(open === m.id ? null : m.id)}
            onMouseEnter={() => open && setOpen(m.id)}
          >
            {m.label}
          </button>
          {open === m.id && (
            <div className="menu-pop" role="menu">
              {m.entries.map((e, i) =>
                e === 'separator' ? (
                  <div key={i} className="menu-sep" />
                ) : (
                  <button
                    key={i}
                    role="menuitemcheckbox"
                    aria-checked={!!e.checked}
                    className="menu-item"
                    disabled={e.disabled}
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => {
                      setOpen(null);
                      e.onClick();
                    }}
                  >
                    <span className="menu-check">{e.checked ? '✓' : ''}</span>
                    <span className="menu-label">{e.label}</span>
                    <span className="menu-shortcut">{e.shortcut}</span>
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
      <div className="menubar-right">{props.right}</div>
    </div>
  );
}

/* ----------------------------------- modal ----------------------------------- */

export function Modal(props: { title: string; onClose(): void; children: ReactNode; closeLabel: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props]);
  return (
    <div className="modal-backdrop" onMouseDown={props.onClose}>
      <div className="modal" role="dialog" aria-label={props.title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{props.title}</h2>
          <button className="icon-only" onClick={props.onClose} aria-label={props.closeLabel}>
            ✕
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
      </div>
    </div>
  );
}

/* --------------------------------- segmented --------------------------------- */

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange(v: T): void }) {
  return (
    <div className="segmented" role="radiogroup">
      {props.options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === props.value}
          className={o.value === props.value ? 'seg-on' : ''}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
