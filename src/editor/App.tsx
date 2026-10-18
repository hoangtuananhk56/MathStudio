import { useEffect, useMemo, useRef, useState } from 'react';
import { buildEquationPackage, fontById, MATH_FONTS } from '../core/equation';
import type { Layout, RenderKind } from '../core/ooxml';
import { renderSvg } from '../core/render-svg';
import { buildPagePackage } from '../core/page-ooxml';
import { LOW_CONFIDENCE, OcrPanel } from '../ocr/OcrPanel';
import { OCR_IMAGE_KEY, type DialogMessage, type EditorInit } from '../shared/protocol';
import { clearDraft, DraftBanner, useDraftOffer, useDraftSaver } from '../shared/draft';
import { loadSettings, saveSettings, type Settings } from '../shared/settings';
import { MenuBar, Modal, PaletteButton, Segmented, Tile, type MenuDef } from './components';
import { isFontInstalled } from './font-check';
import { t } from './i18n';
import { MathEditor, type EditorCommand, type MathEditorHandle } from './MathEditor';
import { GREEK_KEYS, SMALL_BAR, SYMBOL_PALETTES, TABS, TEMPLATE_PALETTES } from './mathtype/data';
import { createShortcutHandler, SHORTCUT_SHEET, type Chord, type MathStyle } from './mathtype/shortcuts';
import { PALETTE } from './palette';

const SIZES = [0, 10, 11, 12, 13, 14, 16, 18, 20, 24];
/** Where the equation being typed is kept until it reaches Word (see shared/draft). */
const DRAFT_KEY = 'mathstudio.draft.equation';
const ZOOMS = [100, 150, 200, 300, 400];
const STYLE_KEYS: Record<MathStyle, Parameters<typeof t>[1]> = {
  math: 'sMath', text: 'sText', function: 'sFunction', variable: 'sVariable', greek: 'sGreek', vector: 'sVector', number: 'sNumber',
};
const STYLE_SHORTCUTS: Record<MathStyle, string> = {
  math: 'Ctrl+Shift+=', text: 'Ctrl+Shift+E', function: 'Ctrl+Shift+F', variable: 'Ctrl+Shift+I',
  greek: 'Ctrl+Shift+G', vector: 'Ctrl+Shift+B', number: 'Ctrl+Shift+N',
};

interface Props {
  init: EditorInit;
  /** Null when running outside Office (browser preview). */
  send: ((msg: DialogMessage) => void) | null;
}

function copyText(text: string): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

export function App({ init, send: sendToWord }: Props) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [layout, setLayout] = useState<Layout>(init.layout);
  const [kind, setKind] = useState<RenderKind>(() => init.kind ?? loadSettings().kind);
  const [devSvg, setDevSvg] = useState<string | null>(null);
  const [latex, setLatex] = useState(init.latex);
  const [style, setStyle] = useState<MathStyle>('math');
  const [openPalette, setOpenPalette] = useState<string | null>(null);
  const [tab, setTab] = useState(TABS[0].id);
  const [simpleCat, setSimpleCat] = useState(PALETTE[0].id);
  const [showLatex, setShowLatex] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(init.error ? `${t(settings.lang, 'insertFailed')}: ${init.error}` : null);
  const [devOutput, setDevOutput] = useState<string | null>(null);
  // "From a picture": open with the picture selected in Word, or when one is pasted
  const [ocr, setOcr] = useState<{ image: string | null } | null>(() => {
    if (!init.ocr) return null;
    let image: string | null = null;
    try {
      image = localStorage.getItem(OCR_IMAGE_KEY);
      localStorage.removeItem(OCR_IMAGE_KEY);
    } catch {
      /* storage unavailable: the user pastes the picture */
    }
    return { image };
  });
  const editor = useRef<MathEditorHandle>(null);
  const greekNext = useRef(false);

  // unsaved work survives a lost dialog; a new equation offers to bring it back
  const [draft, dropDraft] = useDraftOffer<{ latex: string; layout: Layout }>(DRAFT_KEY, init.mode === 'insert' && !init.latex.trim() && !init.ocr && !init.error);
  useEffect(() => {
    if (draft && latex.trim() !== init.latex.trim()) dropDraft(); // typing a new one: that is the answer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latex]);
  const work = useMemo(() => (latex.trim() ? { latex, layout } : null), [latex, layout]);
  useDraftSaver(DRAFT_KEY, work, !draft);
  const send = (msg: DialogMessage) => {
    clearDraft(DRAFT_KEY);
    sendToWord?.(msg);
  };
  const lang = settings.lang;

  const update = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `MathStudio – ${t(lang, init.mode === 'edit' ? 'titleEdit' : 'title')}`;
  }, [lang, init.mode]);

  const fontInstalled = useMemo(() => {
    const f = fontById(settings.fontId);
    return f.builtIn || isFontInstalled(f.family);
  }, [settings.fontId]);

  const insert = (l: string) => editor.current?.insert(l);
  const run = (cmd: EditorCommand) => editor.current?.command(cmd);

  function applyStyle(s: MathStyle) {
    const ed = editor.current;
    if (!ed) return;
    setStyle(s);
    greekNext.current = false;
    setHint(null);
    switch (s) {
      case 'math': ed.switchMode('math'); break;
      case 'text': ed.switchMode('text'); break;
      case 'function':
      case 'number': ed.applyStyle({ variant: 'normal', variantStyle: 'up' }); break;
      case 'variable': ed.applyStyle({ variant: 'normal', variantStyle: 'italic' }); break;
      case 'vector': ed.applyStyle({ variant: 'normal', variantStyle: 'bold' }); break;
      case 'greek':
        greekNext.current = true;
        setHint(t(lang, 'greekNext'));
        ed.focus();
        break;
    }
  }

  function submit() {
    const value = editor.current?.getLatex().trim() ?? latex.trim();
    if (!value) {
      setError(t(lang, 'empty'));
      editor.current?.focus();
      return;
    }
    const opts = { layout, kind, fontId: settings.fontId, sizePt: settings.sizePt || undefined };
    let pkg: string;
    try {
      pkg = buildEquationPackage(value, opts);
    } catch (e) {
      setError(`${t(lang, 'invalid')}: ${e instanceof Error ? e.message.replace(/^.*?Error:\s*/, '') : e}`);
      return;
    }
    if (sendToWord) {
      send({ type: 'insert', latex: value, ...opts });
      return;
    }
    // Browser preview (outside Office): show what would be inserted.
    setDevOutput(pkg);
    setDevSvg(null);
    if (kind === 'image') {
      renderSvg(value, true, fontById(settings.fontId).imageFont)
        .then((r) => setDevSvg(r.svg))
        .catch((e) => setError(`${t(lang, 'invalid')}: ${e instanceof Error ? e.message : e}`));
    }
  }

  const cancel = () => send({ type: 'cancel' });

  // A picture pasted into the editor is read as a formula (MathLive would ignore it).
  const ocrOpen = useRef(false);
  ocrOpen.current = !!ocr;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (ocrOpen.current) return;
      const file = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      setOcr({ image: URL.createObjectURL(file) });
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, []);

  // MathType keyboard shortcuts (+ the one-shot Greek style).
  const actions = useRef({ insert, applyStyle, submit, cancel, setHint, lang });
  actions.current = { insert, applyStyle, submit, cancel, setHint, lang };
  const onKeyDown = useMemo(() => {
    const chordHints: Record<Chord, Parameters<typeof t>[1]> = { greek: 'chordGreek', symbol: 'chordSymbol', template: 'chordTemplate' };
    const shortcuts = createShortcutHandler({
      insert: (l) => actions.current.insert(l),
      style: (s) => actions.current.applyStyle(s),
      submit: () => actions.current.submit(),
      cancel: () => actions.current.cancel(),
      chord: (c) => actions.current.setHint(c ? t(actions.current.lang, chordHints[c]) : null),
    });
    return (e: KeyboardEvent) => {
      if (greekNext.current && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const g = GREEK_KEYS[e.key];
        greekNext.current = false;
        actions.current.setHint(null);
        setStyle('math');
        if (g) {
          e.preventDefault();
          e.stopPropagation();
          actions.current.insert(g);
          return;
        }
      }
      shortcuts(e);
    };
  }, []);

  const layoutLabel = (l: Layout) => t(lang, l);
  // The chosen rendering becomes the default for new equations.
  const chooseKind = (k: RenderKind) => {
    setKind(k);
    update({ kind: k });
  };
  const menus: MenuDef[] = [
    {
      id: 'file', label: t(lang, 'mFile'),
      entries: [
        { label: t(lang, init.mode === 'edit' ? 'updateClose' : 'insertClose'), shortcut: 'Ctrl+S', onClick: submit },
        { label: t(lang, 'closeNoSave'), shortcut: 'Ctrl+F4', onClick: cancel, disabled: !sendToWord },
        'separator',
        { label: t(lang, 'fromPictureMenu'), onClick: () => setOcr({ image: null }) },
        'separator',
        { label: t(lang, 'copyLatex'), onClick: () => { copyText(editor.current?.getLatex() ?? ''); setHint(t(lang, 'copied')); } },
        { label: t(lang, 'copyMathml'), onClick: () => { copyText(editor.current?.getMathml() ?? ''); setHint(t(lang, 'copied')); } },
      ],
    },
    {
      id: 'edit', label: t(lang, 'mEdit'),
      entries: [
        { label: t(lang, 'undo'), shortcut: 'Ctrl+Z', onClick: () => run('undo') },
        { label: t(lang, 'redo'), shortcut: 'Ctrl+Y', onClick: () => run('redo') },
        'separator',
        { label: t(lang, 'cut'), shortcut: 'Ctrl+X', onClick: () => run('cutToClipboard') },
        { label: t(lang, 'copy'), shortcut: 'Ctrl+C', onClick: () => run('copyToClipboard') },
        { label: t(lang, 'paste'), shortcut: 'Ctrl+V', onClick: () => run('pasteFromClipboard') },
        'separator',
        { label: t(lang, 'selectAll'), shortcut: 'Ctrl+A', onClick: () => run('selectAll') },
        { label: t(lang, 'clear'), onClick: () => editor.current?.setLatex('') },
      ],
    },
    {
      id: 'view', label: t(lang, 'mView'),
      entries: [
        ...ZOOMS.map((z) => ({ label: `${t(lang, 'zoom')} ${z}%`, checked: settings.zoom === z, onClick: () => update({ zoom: z }) })),
        'separator' as const,
        { label: t(lang, 'symbolRows'), checked: settings.symbolRows, onClick: () => update({ symbolRows: !settings.symbolRows }) },
        { label: t(lang, 'smallBar'), checked: settings.smallBar, onClick: () => update({ smallBar: !settings.smallBar }) },
        { label: t(lang, 'tabBar'), checked: settings.tabBar, onClick: () => update({ tabBar: !settings.tabBar }) },
        { label: t(lang, 'latexPanel'), checked: showLatex, onClick: () => setShowLatex((v) => !v) },
        { label: t(lang, 'keyboard'), onClick: () => editor.current?.toggleKeyboard() },
        'separator' as const,
        { label: t(lang, 'simpleMode'), checked: settings.simple, onClick: () => update({ simple: !settings.simple }) },
      ],
    },
    {
      id: 'format', label: t(lang, 'mFormat'),
      entries: [
        ...(['inline', 'display', 'right', 'left'] as Layout[]).map((l) => ({
          label: layoutLabel(l), checked: layout === l, onClick: () => setLayout(l),
        })),
        'separator' as const,
        { label: t(lang, 'kindImage'), checked: kind === 'image', onClick: () => chooseKind('image') },
        { label: t(lang, 'kindOmml'), checked: kind === 'omml', onClick: () => chooseKind('omml') },
      ],
    },
    {
      id: 'style', label: t(lang, 'mStyle'),
      entries: [
        ...(Object.keys(STYLE_KEYS) as MathStyle[]).map((s) => ({
          label: t(lang, STYLE_KEYS[s]), shortcut: STYLE_SHORTCUTS[s], checked: style === s, onClick: () => applyStyle(s),
        })),
        'separator' as const,
        ...MATH_FONTS.map((f) => ({ label: f.label, checked: settings.fontId === f.id, onClick: () => update({ fontId: f.id }) })),
      ],
    },
    {
      id: 'size', label: t(lang, 'mSize'),
      entries: SIZES.map((s) => ({
        label: s === 0 ? t(lang, 'sizeAuto') : `${s} pt`, checked: settings.sizePt === s, onClick: () => update({ sizePt: s }),
      })),
    },
    {
      id: 'help', label: t(lang, 'mHelp'),
      entries: [
        { label: t(lang, 'shortcuts'), shortcut: 'F1', onClick: () => setShowShortcuts(true) },
        { label: t(lang, 'language'), onClick: () => update({ lang: lang === 'vi' ? 'en' : 'vi' }) },
      ],
    },
  ];

  // F1 = shortcut sheet. Esc = close the editor (a second Esc is needed if the equation changed),
  // unless a menu, palette or dialog consumed it first.
  const escArmed = useRef(false);
  const escState = useRef({ dirty: false, cancel, lang });
  escState.current = { dirty: latex.trim() !== init.latex.trim(), cancel, lang };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const st = escState.current;
      if (!st.dirty || escArmed.current) {
        st.cancel();
        return;
      }
      escArmed.current = true;
      setHint(t(st.lang, 'escAgain'));
      setTimeout(() => (escArmed.current = false), 3000);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeTab = TABS.find((x) => x.id === tab) ?? TABS[0];
  const simpleCategory = PALETTE.find((c) => c.id === simpleCat) ?? PALETTE[0];
  const simpleCategories = PALETTE.filter((c) => c.basic);

  return (
    <div className={`app ${settings.simple ? 'is-simple' : 'is-mathtype'}`}>
      <MenuBar
        menus={menus}
        right={
          <button className="lang-btn" onClick={() => update({ lang: lang === 'vi' ? 'en' : 'vi' })} aria-label="Language">
            {lang.toUpperCase()}
          </button>
        }
      />

      {!settings.simple && (
        <div className="toolbars">
          {settings.symbolRows && (
            <>
              <div className="toolbar-row">
                {SYMBOL_PALETTES.map((p) => (
                  <PaletteButton key={p.id} palette={p} lang={lang} open={openPalette === p.id} onOpen={setOpenPalette} onPick={insert} />
                ))}
              </div>
              <div className="toolbar-row">
                {TEMPLATE_PALETTES.map((p) => (
                  <PaletteButton key={p.id} palette={p} lang={lang} open={openPalette === p.id} onOpen={setOpenPalette} onPick={insert} />
                ))}
              </div>
            </>
          )}
          {settings.smallBar && (
            <div className="smallbar">
              {SMALL_BAR.map((item, i) => (
                <Tile key={i} item={item} lang={lang} className="small-tile" onPick={insert} />
              ))}
            </div>
          )}
          {settings.tabBar && (
            <div className="tabbar">
              <div className="tabs" role="tablist">
                {TABS.map((x) => (
                  <button
                    key={x.id}
                    role="tab"
                    aria-selected={x.id === activeTab.id}
                    className={`tab ${x.id === activeTab.id ? 'tab-on' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setTab(x.id)}
                  >
                    {x[lang]}
                  </button>
                ))}
              </div>
              <div className="tab-items" role="tabpanel">
                {activeTab.items.map((item, i) => (
                  <Tile key={i} item={item} lang={lang} className="tab-tile" onPick={insert} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {settings.simple && (
        <div className="simple">
          <nav className="chips" role="tablist">
            {simpleCategories.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c.id === simpleCategory.id}
                className={`chip ${c.id === simpleCategory.id ? 'chip-active' : ''}`}
                style={{ '--chip-h': c.hue } as React.CSSProperties}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setSimpleCat(c.id)}
              >
                <span className="chip-icon">{c.icon}</span>
                {c[lang]}
              </button>
            ))}
          </nav>
          <section className="palette">
            {simpleCategory.items
              .filter((i) => i.basic)
              .map((item, i) => (
                <Tile key={i} item={item} lang={lang} onPick={insert} />
              ))}
          </section>
        </div>
      )}

      <section className="workspace">
        <MathEditor
          ref={editor}
          initialLatex={init.latex}
          placeholder={t(lang, 'placeholder')}
          fontSize={Math.round((16 * settings.zoom) / 100)}
          onChange={(v) => {
            setLatex(v);
            setError(null);
          }}
          onKeyDown={onKeyDown}
        />
        {showLatex && (
          <textarea
            className="latex-input"
            spellCheck={false}
            value={latex}
            aria-label={t(lang, 'latexPanel')}
            onChange={(e) => {
              setLatex(e.target.value);
              editor.current?.setLatex(e.target.value);
            }}
          />
        )}
      </section>

      {draft && (
        <DraftBanner
          lang={lang}
          at={draft.at}
          what={['công thức đang soạn dở', 'an unfinished equation']}
          onRestore={() => {
            editor.current?.setLatex(draft.value.latex);
            setLatex(draft.value.latex);
            setLayout(draft.value.layout);
            dropDraft();
            editor.current?.focus();
          }}
          onDismiss={() => {
            clearDraft(DRAFT_KEY);
            dropDraft();
          }}
        />
      )}
      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}
      {!fontInstalled && <div className="banner banner-warn">{t(lang, 'fontMissing')}</div>}
      {devOutput && (
        <details className="dev-output" open>
          <summary>{t(lang, 'preview')}</summary>
          {devSvg && <div className="dev-svg" dangerouslySetInnerHTML={{ __html: devSvg }} />}
          <pre>{devOutput}</pre>
        </details>
      )}

      <footer className="statusbar">
        <div className="status-left">
          <label className="status-field">
            <span>{t(lang, 'style')}</span>
            <select value={style} onChange={(e) => applyStyle(e.target.value as MathStyle)}>
              {(Object.keys(STYLE_KEYS) as MathStyle[]).map((s) => (
                <option key={s} value={s}>
                  {t(lang, STYLE_KEYS[s])}
                </option>
              ))}
            </select>
          </label>
          <label className="status-field">
            <span>{t(lang, 'size')}</span>
            <select value={settings.sizePt} onChange={(e) => update({ sizePt: Number(e.target.value) })}>
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s === 0 ? t(lang, 'sizeAuto') : `${s} pt`}
                </option>
              ))}
            </select>
          </label>
          <label className="status-field">
            <span>{t(lang, 'zoom')}</span>
            <select value={settings.zoom} onChange={(e) => update({ zoom: Number(e.target.value) })}>
              {ZOOMS.map((z) => (
                <option key={z} value={z}>
                  {z}%
                </option>
              ))}
            </select>
          </label>
          <label className="status-field">
            <span>{t(lang, 'font')}</span>
            <select value={settings.fontId} onChange={(e) => update({ fontId: e.target.value })}>
              {MATH_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <div className="status-field">
            <span>{t(lang, 'kind')}</span>
            <Segmented<RenderKind>
              value={kind}
              options={[
                { value: 'image', label: t(lang, 'kindImageShort') },
                { value: 'omml', label: t(lang, 'kindOmmlShort') },
              ]}
              onChange={chooseKind}
            />
          </div>
          <div className="status-field">
            <span>{t(lang, 'layout')}</span>
            <Segmented<Layout>
              value={layout}
              options={(['inline', 'display', 'right', 'left'] as Layout[]).map((l) => ({ value: l, label: layoutLabel(l) }))}
              onChange={setLayout}
            />
          </div>
        </div>
        <div className="status-right">
          {hint && <span className="hint">{hint}</span>}
          <button className="btn btn-tonal" onMouseDown={(e) => e.preventDefault()} onClick={() => setOcr({ image: null })} title={t(lang, 'fromPictureMenu')}>
            {t(lang, 'fromPicture')}
          </button>
          <button className="btn btn-tonal" onMouseDown={(e) => e.preventDefault()} onClick={cancel}>
            {t(lang, 'cancel')}
          </button>
          <button className="btn btn-primary" onMouseDown={(e) => e.preventDefault()} onClick={submit} title="Ctrl+S">
            {t(lang, init.mode === 'edit' ? 'update' : 'insert')}
          </button>
        </div>
      </footer>

      {ocr && (
        <OcrPanel
          lang={lang}
          modes={['formula', 'page', 'figure']}
          initialImage={ocr.image}
          pageAction={t(lang, 'ocrInsertPage')}
          figureAction={t(lang, 'ocrOpenFigure')}
          onFigure={(construction) => {
            if (sendToWord) {
              send({ type: 'openFigure', construction });
              return;
            }
            setOcr(null);
            setDevOutput(JSON.stringify(construction, null, 1));
            setDevSvg(null);
          }}
          onClose={() => {
            setOcr(null);
            editor.current?.focus();
          }}
          onFormula={(r) => {
            setOcr(null);
            const ed = editor.current;
            if (!ed) return;
            if (ed.getLatex().trim()) ed.insert(r.latex);
            else ed.setLatex(r.latex);
            setLatex(ed.getLatex());
            setHint(t(lang, r.confidence < LOW_CONFIDENCE ? 'ocrCheck' : 'ocrDone'));
            ed.focus();
          }}
          onPage={(paragraphs) => {
            const style = { fontId: settings.fontId, sizePt: settings.sizePt || undefined };
            if (sendToWord) {
              send({ type: 'insertPage', paragraphs, ...style });
              return;
            }
            setOcr(null);
            setDevOutput(buildPagePackage(paragraphs, style));
            setDevSvg(null);
          }}
        />
      )}

      {showShortcuts && (
        <Modal title={t(lang, 'shortcuts')} closeLabel={t(lang, 'close')} onClose={() => setShowShortcuts(false)}>
          <table className="shortcut-table">
            <tbody>
              {SHORTCUT_SHEET.map((r) => (
                <tr key={r.keys}>
                  <td>
                    <kbd>{r.keys}</kbd>
                  </td>
                  <td>{r[lang]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
