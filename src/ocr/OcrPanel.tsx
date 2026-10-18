/**
 * "From a picture": the user pastes, drops or picks a picture (or brings the one selected in
 * the document), may drag a rectangle over the part to read, and gets either one formula
 * (LaTeX for the editor) or the whole exercise (text with formulas, editable before use).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { latexToMathml } from '../core/latex';
import { computeAll } from '../geometry/engine';
import type { Construction } from '../geometry/model';
import { renderConstruction } from '../geometry/render';
import { NOT_A_FIGURE, ocrSupported, recognizeFigure, recognizeFormula, recognizePage, type FigureReading, type FormulaReading, type OcrStage, type PageParagraph } from './client';
import { pageToTex, texToPage } from './page';
import './ocr.css';

export type OcrMode = 'formula' | 'page' | 'figure';

interface Props {
  lang: 'vi' | 'en';
  /** What can be read here; the first one is the default until the user picks another. */
  modes: OcrMode[];
  /** A picture to start with (data URL), e.g. the one selected in the document. */
  initialImage?: string | null;
  onFormula?(reading: FormulaReading): void;
  onPage?(paragraphs: PageParagraph[]): void;
  /** Label of the button that uses the exercise ("Insert into the document"…). */
  pageAction: string;
  onFigure?(construction: Construction): void;
  /** Label of the button that uses the figure ("Open in the figure editor"…). */
  figureAction?: string;
  onClose(): void;
}

interface Picture {
  url: string;
  width: number;
  height: number;
  bitmap: ImageBitmap;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Below this, a formula reading deserves a second look. */
export const LOW_CONFIDENCE = 0.85;

async function openPicture(src: Blob | string): Promise<Picture> {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  // a picture handed over as an object URL is now copied: release the original
  if (typeof src === 'string' && src.startsWith('blob:')) URL.revokeObjectURL(src);
  const bitmap = await createImageBitmap(blob);
  return { url: URL.createObjectURL(blob), width: bitmap.width, height: bitmap.height, bitmap };
}

/** RGBA pixels of (part of) the picture, at most `maxSide` pixels on the long side. */
function pixelsOf(p: Picture, box: Box | null, maxSide: number) {
  const b = box ?? { x: 0, y: 0, w: p.width, h: p.height };
  const k = Math.min(1, maxSide / Math.max(b.w, b.h));
  const w = Math.max(1, Math.round(b.w * k));
  const h = Math.max(1, Math.round(b.h * k));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(p.bitmap, b.x, b.y, b.w, b.h, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

const MODE_KEY = 'mathstudio.ocrMode';

/** The mode used last time (a teacher scanning exercises keeps doing so). */
function lastMode(modes: OcrMode[]): OcrMode {
  try {
    const m = localStorage.getItem(MODE_KEY) as OcrMode | null;
    if (m && modes.includes(m)) return m;
  } catch {
    /* no storage */
  }
  return modes[0];
}

function imageFromClipboard(e: ClipboardEvent): File | null {
  for (const item of e.clipboardData?.items ?? []) if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  return null;
}

export function OcrPanel(props: Props) {
  const vi = props.lang === 'vi';
  const [picture, setPicture] = useState<Picture | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [mode, setMode] = useState<OcrMode>(() => lastMode(props.modes));
  const [busy, setBusy] = useState<{ stage: OcrStage; fraction: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageText, setPageText] = useState<string | null>(null);
  const [figure, setFigure] = useState<FigureReading | null>(null);
  const [lowFormulas, setLowFormulas] = useState<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const load = async (src: Blob | string) => {
    try {
      const p = await openPicture(src);
      setPicture((old) => {
        if (old) {
          URL.revokeObjectURL(old.url);
          old.bitmap.close();
        }
        return p;
      });
      setBox(null);
      setPageText(null);
      setFigure(null);
      setError(null);
    } catch {
      setError(vi ? 'Không mở được ảnh này.' : 'This picture cannot be opened.');
    }
  };

  // The picture lives only in memory, and only while the panel is open.
  const current = useRef<Picture | null>(null);
  current.current = picture;
  useEffect(
    () => () => {
      const p = current.current;
      if (p) {
        URL.revokeObjectURL(p.url);
        p.bitmap.close();
      }
    },
    [],
  );

  useEffect(() => {
    if (props.initialImage) void load(props.initialImage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl+V anywhere in the panel
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromClipboard(e);
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      void load(file);
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        e.stopPropagation();
        props.onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  /** Mouse position in picture pixels. */
  const at = (e: React.PointerEvent) => {
    const r = imgRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(picture!.width, ((e.clientX - r.left) / r.width) * picture!.width)),
      y: Math.max(0, Math.min(picture!.height, ((e.clientY - r.top) / r.height) * picture!.height)),
    };
  };

  async function recognize() {
    if (!picture) return;
    setError(null);
    setBusy({ stage: 'model', fraction: 0 });
    const progress = (stage: OcrStage, fraction: number) => setBusy({ stage, fraction });
    try {
      if (mode === 'formula') {
        const reading = await recognizeFormula(pixelsOf(picture, box, 1600), progress);
        if (!reading.latex) throw new Error(vi ? 'Không thấy công thức nào trong ảnh.' : 'No formula found in the picture.');
        props.onFormula?.(reading);
      } else if (mode === 'figure') {
        setFigure(await recognizeFigure(pixelsOf(picture, box, 1600), progress));
      } else {
        const paragraphs = await recognizePage(pixelsOf(picture, box, 2600), progress);
        if (!paragraphs.length) throw new Error(vi ? 'Không đọc được chữ nào trong ảnh.' : 'No text found in the picture.');
        setLowFormulas(new Set(paragraphs.flatMap((p) => p.segments.flatMap((s) => (s.kind === 'math' && s.confidence < LOW_CONFIDENCE ? [s.latex] : [])))));
        setPageText(pageToTex(paragraphs));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === NOT_A_FIGURE)
        setError(
          vi
            ? 'Ảnh này giống ảnh chụp thật, không phải hình vẽ hình học. Hãy chọn ảnh hình vẽ (nét, tên điểm), hoặc cắt riêng phần hình.'
            : 'This looks like a photograph, not a geometry drawing. Pick a drawing (lines, point names), or crop to the figure.',
        );
      else setError(`${vi ? 'Không nhận diện được' : 'Recognition failed'}: ${message}`);
    } finally {
      setBusy(null);
    }
  }

  const stageLabel = (s: OcrStage) =>
    s === 'model'
      ? vi ? 'Đang chuẩn bị bộ nhận diện (lần đầu mất một chút)…' : 'Preparing the recogniser (takes a moment the first time)…'
      : s === 'figure'
        ? vi ? 'Đang đọc tên điểm, số đo và nét vẽ…' : 'Reading names, measures and lines…'
        : s === 'text'
        ? vi ? 'Đang đọc chữ…' : 'Reading the text…'
        : vi ? 'Đang đọc công thức…' : 'Reading the formulas…';

  const preview = useMemo(() => (pageText === null ? [] : texToPage(pageText)), [pageText]);

  if (!ocrSupported()) {
    return (
      <Shell title={vi ? 'Nhận diện từ ảnh' : 'Read from a picture'} onClose={props.onClose} vi={vi}>
        <p className="ocr-note">
          {vi
            ? 'Phiên bản Word này chưa hỗ trợ nhận diện ảnh. Hãy cập nhật Microsoft 365 / Office 2021 trở lên.'
            : 'This version of Word cannot read pictures. Please update to Microsoft 365 / Office 2021 or later.'}
        </p>
      </Shell>
    );
  }

  return (
    <Shell title={vi ? 'Nhận diện từ ảnh' : 'Read from a picture'} onClose={() => !busy && props.onClose()} vi={vi}>
      {figure ? (
        <FigureResult vi={vi} reading={figure} action={props.figureAction ?? ''} onBack={() => setFigure(null)} onUse={() => props.onFigure?.(figure.construction)} />
      ) : pageText === null ? (
        <>
          {props.modes.length > 1 && (
            <div className="segmented ocr-modes" role="radiogroup">
              {props.modes.map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={m === mode}
                  className={m === mode ? 'seg-on' : ''}
                  disabled={!!busy}
                  onClick={() => {
                    setMode(m);
                    try {
                      localStorage.setItem(MODE_KEY, m);
                    } catch {
                      /* no storage */
                    }
                  }}
                >
                  {m === 'formula'
                    ? vi ? 'Một công thức' : 'One formula'
                    : m === 'figure'
                      ? vi ? 'Hình vẽ' : 'Figure'
                      : vi ? 'Cả đề bài (chữ + công thức)' : 'Whole exercise (text + formulas)'}
                </button>
              ))}
            </div>
          )}
          <div
            className={`ocr-drop ${picture ? 'has-picture' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
              if (f) void load(f);
            }}
          >
            {picture ? (
              <div
                className="ocr-stage"
                onPointerDown={(e) => {
                  if (busy) return;
                  (e.target as Element).setPointerCapture(e.pointerId);
                  drag.current = at(e);
                  setBox(null);
                }}
                onPointerMove={(e) => {
                  if (!drag.current) return;
                  const p = at(e);
                  const d = drag.current;
                  setBox({ x: Math.min(d.x, p.x), y: Math.min(d.y, p.y), w: Math.abs(p.x - d.x), h: Math.abs(p.y - d.y) });
                }}
                onPointerUp={() => {
                  drag.current = null;
                  setBox((b) => (!b || b.w < 8 || b.h < 8 ? null : b));
                }}
              >
                <img ref={imgRef} src={picture.url} alt="" draggable={false} />
                {box && (
                  <div
                    className="ocr-box"
                    style={{
                      left: `${(box.x / picture.width) * 100}%`,
                      top: `${(box.y / picture.height) * 100}%`,
                      width: `${(box.w / picture.width) * 100}%`,
                      height: `${(box.h / picture.height) * 100}%`,
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="ocr-empty">
                <div className="ocr-empty-icon" aria-hidden>
                  ⧉
                </div>
                <p>
                  <b>{vi ? 'Dán ảnh (Ctrl+V)' : 'Paste a picture (Ctrl+V)'}</b>
                  {vi ? ', kéo thả ảnh vào đây, hoặc chọn một tệp ảnh.' : ', drop one here, or pick a picture file.'}
                </p>
                <p className="ocr-muted">
                  {vi
                    ? 'Ảnh chụp sách, đề thi, ảnh quét hoặc ảnh màn hình. Nên chụp thẳng, đủ sáng, chữ rõ.'
                    : 'A photo of a book or a test, a scan or a screenshot. Shoot straight, in good light, with sharp text.'}
                </p>
              </div>
            )}
          </div>
          {picture && !busy && (
            <p className="ocr-muted">
              {box
                ? vi ? 'Chỉ đọc vùng đã chọn. Kéo lại để chọn vùng khác.' : 'Only the selected area is read. Drag again to change it.'
                : vi ? 'Mẹo: kéo chuột trên ảnh để chỉ đọc một vùng.' : 'Tip: drag over the picture to read only part of it.'}
            </p>
          )}
          {busy && (
            <div className="ocr-progress" role="status">
              <span>{stageLabel(busy.stage)}</span>
              <div className="ocr-bar">
                <div style={{ width: `${Math.round(busy.fraction * 100)}%` }} />
              </div>
            </div>
          )}
          {error && <div className="banner banner-error ocr-error">{error}</div>}
          <div className="ocr-actions">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void load(f);
                e.target.value = '';
              }}
            />
            <button className="btn btn-tonal" disabled={!!busy} onClick={() => fileInput.current?.click()}>
              {picture ? (vi ? 'Ảnh khác…' : 'Another picture…') : vi ? 'Chọn ảnh…' : 'Pick a picture…'}
            </button>
            <span className="ocr-spacer" />
            <button className="btn btn-primary" disabled={!picture || !!busy} onClick={() => void recognize()}>
              {vi ? 'Nhận diện' : 'Recognise'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="ocr-muted">
            {vi
              ? 'Kiểm tra và sửa nếu cần. Công thức nằm giữa hai dấu $ … $ (riêng dòng: $$ … $$).'
              : 'Check and correct if needed. Formulas are between $ … $ ($$ … $$ on their own line).'}
          </p>
          <textarea className="ocr-text" spellCheck={false} value={pageText} onChange={(e) => setPageText(e.target.value)} />
          <div className="ocr-preview" aria-label={vi ? 'Xem trước' : 'Preview'}>
            {preview.map((p, i) => (
              <p key={i}>
                {p.segments.map((s, k) => (s.kind === 'text' ? <span key={k}>{s.text}</span> : <MathPreview key={k} latex={s.latex} display={s.display} low={lowFormulas.has(s.latex)} />))}
              </p>
            ))}
          </div>
          {lowFormulas.size > 0 && (
            <p className="ocr-warn">
              {vi
                ? `Có ${lowFormulas.size} công thức nên xem lại (tô vàng).`
                : `${lowFormulas.size} formula(s) deserve a second look (highlighted).`}
            </p>
          )}
          <div className="ocr-actions">
            <button className="btn btn-tonal" onClick={() => setPageText(null)}>
              {vi ? '← Quay lại ảnh' : '← Back to the picture'}
            </button>
            <span className="ocr-spacer" />
            <button className="btn btn-primary" disabled={!preview.length} onClick={() => props.onPage?.(texToPage(pageText))}>
              {props.pageAction}
            </button>
          </div>
        </>
      )}
    </Shell>
  );
}

function FigureResult(props: { vi: boolean; reading: FigureReading; action: string; onBack(): void; onUse(): void }) {
  const { vi, reading } = props;
  const svg = useMemo(() => {
    const c = reading.construction;
    const out = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 }).svg;
    return out.replace(/ width="[^"]*" height="[^"]*"/, ' width="100%" height="100%" preserveAspectRatio="xMidYMid meet"');
  }, [reading]);
  const st = reading.stats;
  const parts = vi
    ? [
        `${st.points} điểm${st.labels ? ` (${st.labels} có tên)` : ''}`,
        `${st.segments} đoạn thẳng`,
        st.circles ? `${st.circles} đường tròn` : '',
        st.measures ? `${st.measures} số đo` : '',
        st.marks ? `${st.marks} ký hiệu` : '',
        st.fills ? `${st.fills} vùng tô màu` : '',
      ]
    : [
        `${st.points} points${st.labels ? ` (${st.labels} named)` : ''}`,
        `${st.segments} segments`,
        st.circles ? `${st.circles} circles` : '',
        st.measures ? `${st.measures} measures` : '',
        st.marks ? `${st.marks} marks` : '',
        st.fills ? `${st.fills} filled regions` : '',
      ];
  return (
    <>
      <p className="ocr-muted">
        {vi ? 'Đã dựng lại hình: ' : 'Figure rebuilt: '}
        {parts.filter(Boolean).join(', ')}.{' '}
        {vi ? 'Sau đó có thể kéo điểm, sửa, đặt lại tên như hình tự vẽ.' : 'It can then be dragged, fixed and renamed like any figure drawn here.'}
      </p>
      <div className="ocr-figure" dangerouslySetInnerHTML={{ __html: svg }} />
      {reading.unplaced.length > 0 && (
        <p className="ocr-warn">
          {vi ? `Chưa gắn được vào điểm nào (để thành chữ trên hình): ${reading.unplaced.join(', ')}` : `Not attached to a point (kept as text): ${reading.unplaced.join(', ')}`}
        </p>
      )}
      <div className="ocr-actions">
        <button className="btn btn-tonal" onClick={props.onBack}>
          {vi ? '← Quay lại ảnh' : '← Back to the picture'}
        </button>
        <span className="ocr-spacer" />
        <button className="btn btn-primary" disabled={!reading.construction.objects.length} onClick={props.onUse}>
          {props.action}
        </button>
      </div>
    </>
  );
}

function MathPreview({ latex, display, low }: { latex: string; display: boolean; low: boolean }) {
  const html = useMemo(() => {
    try {
      return latexToMathml(latex, display);
    } catch {
      return null;
    }
  }, [latex, display]);
  const cls = `ocr-math ${display ? 'is-display' : ''} ${low ? 'is-low' : ''} ${html ? '' : 'is-bad'}`;
  return html ? <span className={cls} dangerouslySetInnerHTML={{ __html: html }} /> : <span className={cls}>{`$${latex}$`}</span>;
}

function Shell(props: { title: string; vi: boolean; onClose(): void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop ocr-backdrop" onMouseDown={props.onClose}>
      <div className="modal ocr-modal" role="dialog" aria-label={props.title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{props.title}</h2>
          <button className="icon-only" onClick={props.onClose} aria-label={props.vi ? 'Đóng' : 'Close'}>
            ✕
          </button>
        </div>
        <div className="modal-body ocr-body">{props.children}</div>
      </div>
    </div>
  );
}
