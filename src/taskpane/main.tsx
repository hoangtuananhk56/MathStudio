import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../editor/styles.css';
// the ribbon buttons run here (the shared runtime): see manifest <Runtimes>
import '../commands/commands';
import './taskpane.css';
import { MATH_FONTS } from '../core/equation';
import { convertMathTypeDocx, countMathTypeEquations, type MathTypeConvertReport } from '../core/docx-mathtype';
import type { RenderKind } from '../core/ooxml';
import { openAsNewDocument, readWholeDocument } from '../office/document-file';
import { runEditor } from '../office/editor-dialog';
import { rasterizeSvg } from '../office/rasterize';
import { exportForMathType } from '../office/word';
import { isFontInstalled } from '../editor/font-check';
import { loadSettings, saveSettings, type Lang } from '../shared/settings';

const TEXT = {
  hello: { vi: 'Xin chào! 👋', en: 'Hello! 👋' },
  intro: {
    vi: 'Soạn công thức Toán đẹp như sách giáo khoa, chèn thẳng vào Word và sửa lại bất cứ lúc nào.',
    en: 'Write textbook-quality math, insert it into Word and edit it any time.',
  },
  inline: { vi: 'Công thức trong dòng', en: 'Inline equation' },
  display: { vi: 'Công thức riêng dòng', en: 'Display equation' },
  edit: { vi: 'Sửa công thức đang chọn', en: 'Edit selected equation' },
  tips: { vi: 'Mẹo nhỏ', en: 'Tips' },
  tip1: { vi: 'Nhấp đúp vào công thức (hoặc bấm “Sửa”) để chỉnh lại.', en: 'Double-click an equation (or press “Edit”) to change it.' },
  tip2: { vi: 'Nhấn Ctrl + S để chèn nhanh, Esc để đóng.', en: 'Press Ctrl + S to insert, Esc to close.' },
  tip3: { vi: 'Phím tắt giống MathType: Ctrl+F phân số, Ctrl+H mũ, Ctrl+G rồi chữ cái → chữ Hy Lạp.', en: 'MathType shortcuts: Ctrl+F fraction, Ctrl+H superscript, Ctrl+G then a letter → Greek.' },
  tip4: { vi: 'Nút “Đổi dạng” chuyển công thức giữa dạng ảnh (giống MathType) và công thức Word.', en: '“Picture / Equation” switches between the MathType-style picture and a Word equation.' },
  fonts: { vi: 'Phông chữ toán', en: 'Math fonts' },
  installed: { vi: 'Đã cài', en: 'Installed' },
  download: { vi: 'Tải về', en: 'Download' },
  busy: { vi: 'Đang mở trình soạn…', en: 'Opening the editor…' },
  mtTitle: { vi: 'Chuyển đổi MathType', en: 'MathType conversion' },
  mtFromHint: {
    vi: 'Chuyển mọi công thức MathType trong tài liệu này sang MathStudio. Kết quả mở thành tài liệu mới — tài liệu hiện tại giữ nguyên.',
    en: 'Convert every MathType equation in this document to MathStudio. The result opens as a new document — this one stays unchanged.',
  },
  mtAs: { vi: 'Chuyển thành', en: 'Convert to' },
  kindImage: { vi: 'Ảnh (giống MathType)', en: 'Picture (MathType look)' },
  kindOmml: { vi: 'Công thức Word', en: 'Word equation' },
  mtFrom: { vi: 'Chuyển từ MathType', en: 'Convert from MathType' },
  mtReading: { vi: 'Đang đọc tài liệu…', en: 'Reading the document…' },
  mtNone: { vi: 'Không tìm thấy công thức MathType nào trong tài liệu.', en: 'No MathType equations found in this document.' },
  mtProgress: { vi: 'Đang chuyển', en: 'Converting' },
  mtOpening: { vi: 'Đang mở tài liệu mới…', en: 'Opening the new document…' },
  mtDone: { vi: 'Đã chuyển', en: 'Converted' },
  mtSkipped: { vi: 'công thức rỗng giữ nguyên', en: 'empty equations left as they are' },
  mtFailed: { vi: 'công thức chưa chuyển được (giữ nguyên MathType)', en: 'equations could not be converted (kept as MathType)' },
  mtToHint: {
    vi: 'Chuẩn bị cho MathType: đổi các công thức MathStudio trong tài liệu này, sau đó dùng lệnh tương ứng của MathType.',
    en: 'Prepare for MathType: change the MathStudio equations in this document, then use the matching MathType command.',
  },
  mtToOmml: { vi: 'Thành công thức Word → MathType ▸ Convert Equations', en: 'To Word equations → MathType ▸ Convert Equations' },
  mtToTex: { vi: 'Thành mã $TeX$ → MathType ▸ Toggle TeX', en: 'To $TeX$ text → MathType ▸ Toggle TeX' },
  mtExported: { vi: 'Đã đổi', en: 'Changed' },
  equations: { vi: 'công thức', en: 'equations' },
  error: { vi: 'Lỗi', en: 'Error' },
} satisfies Record<string, Record<Lang, string>>;

const FONT_FILES: Record<string, string> = {
  times: 'STIXTwoMath-Regular.otf',
  stix: 'STIXTwoMath-Regular.otf',
  mathtype: 'STIXTwoMath-Regular.otf',
  termes: 'texgyretermes-math.otf',
  latinmodern: 'latinmodern-math.otf',
};

type Tr = (k: keyof typeof TEXT) => string;

function MathTypeCard({ tr }: { tr: Tr }) {
  const [kind, setKind] = useState<RenderKind>(loadSettings().kind);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [report, setReport] = useState<MathTypeConvertReport | null>(null);
  const [busy, setBusy] = useState(false);

  const convertFrom = async () => {
    setBusy(true);
    setReport(null);
    setProgress(null);
    try {
      setStatus(tr('mtReading'));
      const docx = await readWholeDocument();
      if (countMathTypeEquations(docx) === 0) {
        setStatus(tr('mtNone'));
        return;
      }
      const result = await convertMathTypeDocx(docx, {
        kind,
        fontId: loadSettings().fontId,
        rasterize: rasterizeSvg,
        onProgress: (done, total) => {
          setProgress(done / total);
          setStatus(`${tr('mtProgress')} ${done}/${total}…`);
        },
      });
      setStatus(tr('mtOpening'));
      await openAsNewDocument(result.docx);
      setReport(result.report);
      setStatus(null);
    } catch (e) {
      setStatus(`${tr('error')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const exportTo = async (mode: 'omml' | 'tex') => {
    setBusy(true);
    setReport(null);
    try {
      const s = loadSettings();
      const n = await exportForMathType(mode, { fontId: s.fontId, sizePt: s.sizePt || undefined });
      setStatus(`${tr('mtExported')} ${n} ${tr('equations')}.`);
    } catch (e) {
      setStatus(`${tr('error')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pane-card">
      <h2>{tr('mtTitle')}</h2>
      <p className="pane-muted">{tr('mtFromHint')}</p>
      <div className="mt-row">
        <span className="pane-muted">{tr('mtAs')}</span>
        <div className="segmented" role="radiogroup">
          {(['image', 'omml'] as RenderKind[]).map((k) => (
            <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'seg-on' : ''} onClick={() => setKind(k)}>
              {tr(k === 'image' ? 'kindImage' : 'kindOmml')}
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn-primary mt-btn" disabled={busy} onClick={convertFrom}>
        {tr('mtFrom')}
      </button>
      {progress !== null && (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
          <div style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {status && <p className="pane-muted">{status}</p>}
      {report && (
        <ul className="mt-report">
          <li>
            ✓ {tr('mtDone')} {report.converted}/{report.total} {tr('equations')}
          </li>
          {report.skipped > 0 && (
            <li>
              {report.skipped} {tr('mtSkipped')}
            </li>
          )}
          {report.failed.length > 0 && (
            <li className="mt-failed">
              {report.failed.length} {tr('mtFailed')}
            </li>
          )}
        </ul>
      )}

      <hr className="mt-sep" />
      <p className="pane-muted">{tr('mtToHint')}</p>
      <button className="btn btn-tonal mt-btn" disabled={busy} onClick={() => exportTo('omml')}>
        {tr('mtToOmml')}
      </button>
      <button className="btn btn-tonal mt-btn" disabled={busy} onClick={() => exportTo('tex')}>
        {tr('mtToTex')}
      </button>
    </section>
  );
}

function Taskpane() {
  const [lang, setLang] = useState<Lang>(loadSettings().lang);
  const [busy, setBusy] = useState(false);
  const tr: Tr = (k) => TEXT[k][lang];

  const open = async (display: boolean) => {
    setBusy(true);
    try {
      await runEditor(display ? 'display' : 'inline');
    } finally {
      setBusy(false);
    }
  };

  const toggleLang = () => {
    const next: Lang = lang === 'vi' ? 'en' : 'vi';
    setLang(next);
    saveSettings({ ...loadSettings(), lang: next });
  };

  return (
    <div className="pane">
      <div className="pane-head">
        <h1>{tr('hello')}</h1>
        <button className="lang-btn" onClick={toggleLang}>
          {lang.toUpperCase()}
        </button>
      </div>
      <p className="pane-intro">{tr('intro')}</p>

      <div className="pane-actions">
        <button className="big-action" disabled={busy} onClick={() => open(false)}>
          <img src="../assets/inline-80.png" alt="" />
          {tr('inline')}
        </button>
        <button className="big-action" disabled={busy} onClick={() => open(true)}>
          <img src="../assets/display-80.png" alt="" />
          {tr('display')}
        </button>
        <button className="big-action" disabled={busy} onClick={() => open(false)}>
          <img src="../assets/edit-80.png" alt="" />
          {tr('edit')}
        </button>
      </div>
      {busy && <p className="pane-muted">{tr('busy')}</p>}

      <MathTypeCard tr={tr} />

      <section className="pane-card">
        <h2>{tr('tips')}</h2>
        <ul>
          <li>{tr('tip1')}</li>
          <li>{tr('tip2')}</li>
          <li>{tr('tip3')}</li>
          <li>{tr('tip4')}</li>
        </ul>
      </section>

      <section className="pane-card">
        <h2>{tr('fonts')}</h2>
        {MATH_FONTS.map((f) => {
          const ok = f.builtIn || isFontInstalled(f.family);
          return (
            <div className="font-row" key={f.id}>
              <span>{f.label}</span>
              {ok ? (
                <span className="badge-ok">✓ {tr('installed')}</span>
              ) : (
                <a className="text-btn" href={`../fonts/${FONT_FILES[f.id] ?? FONT_FILES.stix}`} download>
                  {tr('download')}
                </a>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

Office.onReady(() => createRoot(document.getElementById('root')!).render(<Taskpane />));
