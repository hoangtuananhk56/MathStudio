/** Template library by school year, and "type the exercise, get the figure". */
import { useEffect, useMemo, useState } from 'react';
import { computeAll } from '../geometry/engine';
import { figureFromText, teachPhrase, type SentenceReport, type TextFigure, type UserPhrase } from '../geometry/fromText';
import type { Grade } from '../geometry/grades';
import type { Construction } from '../geometry/model';
import { renderConstruction } from '../geometry/render';
import { TEMPLATES } from '../geometry/templates';
import { OcrPanel } from '../ocr/OcrPanel';
import { pageToPlain } from '../ocr/page';
import type { Lang } from '../shared/settings';

/** The figure as a picture that scales to its box. */
function Thumb({ c }: { c: Construction }) {
  const svg = useMemo(() => {
    const s = renderConstruction(c, computeAll(c), { mode: 'export', view: c.view, scale: 1 }).svg;
    return s.replace(/ width="[^"]*" height="[^"]*"/, ' width="100%" height="100%" preserveAspectRatio="xMidYMid meet"');
  }, [c]);
  return <span className="geo-thumb" dangerouslySetInnerHTML={{ __html: svg }} />;
}

const EXAMPLES: [string, string][] = [
  ['Lớp 6', 'Một mảnh vườn hình chữ nhật có chiều dài 15 m, chiều rộng 8 m.'],
  ['Lớp 6', 'Trên tia Ox lấy hai điểm A, B sao cho OA = 2 cm, OB = 5 cm. Gọi M là trung điểm của AB.'],
  ['Lớp 7', 'Cho tam giác ABC vuông tại A có AB = 3 cm, AC = 4 cm. Kẻ đường cao AH. Gọi M là trung điểm của BC. N là trung điểm của AC. Nối B với N.'],
  ['Lớp 7', 'Cho ∆ABC có AB = AC, M là trung điểm BC. Trên tia đối của tia MA lấy điểm D sao cho MD = MA.'],
  ['Lớp 8', 'Cho tam giác ABC có AB = 6 cm, AC = 9 cm. Trên cạnh AB lấy điểm D sao cho AD = 2 cm. Qua D kẻ đường thẳng song song với BC cắt AC tại E.'],
  ['Lớp 9', 'Cho đường tròn (O; 3 cm) và điểm M nằm ngoài đường tròn. Từ M kẻ hai tiếp tuyến MA, MB với đường tròn (A, B là các tiếp điểm).'],
  ['Lớp 9', 'Cho tam giác ABC có ba góc nhọn. Đường tròn đường kính BC cắt AB, AC lần lượt tại E, F. BF cắt CE tại H.'],
  ['Lớp 10', 'Trong mặt phẳng Oxy cho A(1; 2), B(4; 3), C(2; -1). Vẽ tam giác ABC.'],
  ['Lớp 11', 'Cho hình chóp S.ABCD có đáy ABCD là hình vuông, SA ⊥ (ABCD). Gọi M là trung điểm của SC.'],
];

const PHRASES_KEY = 'mathstudio.geoPhrases.v1';
function loadPhrases(): UserPhrase[] {
  try {
    return JSON.parse(localStorage.getItem(PHRASES_KEY) ?? '[]') as UserPhrase[];
  } catch {
    return [];
  }
}
function savePhrases(p: UserPhrase[]): void {
  try {
    localStorage.setItem(PHRASES_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

const STATUS: Record<SentenceReport['status'], [string, string, string]> = {
  ok: ['ok', 'Đã hiểu', 'Understood'],
  partial: ['partial', 'Hiểu một phần', 'Partly'],
  none: ['none', 'Chưa hiểu', 'Not understood'],
  skip: ['skip', 'Câu hỏi (bỏ qua)', 'Question (skipped)'],
  off: ['off', 'Đã bỏ chọn', 'Left out'],
};

export function LibraryDialog(props: {
  lang: Lang;
  grade: Grade;
  initialTab?: 'tpl' | 'text';
  initialText?: string;
  onClose(): void;
  onInsert(c: Construction, todo?: string[]): void;
}) {
  const vi = props.lang === 'vi';
  const [tab, setTab] = useState<'tpl' | 'text'>(props.initialTab ?? 'tpl');
  const [year, setYear] = useState<number | 'all'>(props.grade === 'all' ? 'all' : props.grade);
  const list = useMemo(() => TEMPLATES.filter((t) => year === 'all' || t.grade === year).map((t) => ({ t, c: t.build() })), [year]);
  const [text, setText] = useState(props.initialText ?? '');
  const [off, setOff] = useState<number[]>([]);
  const [phrases, setPhrases] = useState<UserPhrase[]>(loadPhrases);
  const [remember, setRemember] = useState(true);
  const [result, setResult] = useState<TextFigure | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** "Exercise from a picture" (with the picture pasted into the text box, if any). */
  const [ocr, setOcr] = useState<{ image: string | null } | null>(null);

  // the figure follows the text as it is typed
  useEffect(() => {
    if (tab !== 'text') return;
    if (!text.trim()) {
      setResult(null);
      setError(null);
      return;
    }
    const id = window.setTimeout(() => {
      try {
        setResult(figureFromText(text, { phrases, off }));
        setError(null);
      } catch (e) {
        setResult(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 350);
    return () => window.clearTimeout(id);
  }, [text, off, phrases, tab]);

  /** Puts a suggestion in place of the clause (and remembers the wording if asked). */
  const applySuggestion = (clause: string, replacement: string) => {
    const i = text.indexOf(clause);
    if (i >= 0) setText(text.slice(0, i) + replacement + text.slice(i + clause.length));
    if (remember) {
      const p = [...phrases.filter((x) => x.from !== teachPhrase(clause, replacement).from), teachPhrase(clause, replacement)];
      setPhrases(p);
      savePhrases(p);
    }
  };

  const toggle = (i: number) => setOff((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]));
  const missed = result ? result.sentences.flatMap((s) => (s.status === 'off' || s.status === 'skip' ? [] : [...s.clauses.filter((c) => !c.ok).map((c) => c.text), ...s.errors])) : [];

  return (
    <div className="modal-backdrop" onMouseDown={props.onClose}>
      <div className="modal geo-lib" onMouseDown={(e) => e.stopPropagation()}>
        {ocr && (
          <OcrPanel
            lang={props.lang}
            modes={['page']}
            initialImage={ocr.image}
            pageAction={vi ? 'Dùng đề này' : 'Use this exercise'}
            onClose={() => setOcr(null)}
            onPage={(paragraphs) => {
              setOcr(null);
              setTab('text');
              setText(pageToPlain(paragraphs));
            }}
          />
        )}
        <div className="modal-head geo-lib-head">
          <div className="segmented">
            <button className={tab === 'tpl' ? 'seg-on' : ''} onClick={() => setTab('tpl')}>{vi ? 'Hình mẫu theo lớp' : 'Templates by year'}</button>
            <button className={tab === 'text' ? 'seg-on' : ''} onClick={() => setTab('text')}>{vi ? 'Gõ đề bài' : 'Type the exercise'}</button>
          </div>
          <button className="icon-btn" onClick={props.onClose}>{vi ? 'Đóng' : 'Close'}</button>
        </div>
        {tab === 'tpl' ? (
          <div className="modal-body">
            <div className="geo-quick">
              {([2, 3, 4, 5, 6, 7, 8, 9, 10, 'all'] as const).map((g) => (
                <button key={String(g)} className={`geo-chip ${year === g ? 'on' : ''}`} onClick={() => setYear(g)}>
                  {g === 'all' ? (vi ? 'Tất cả' : 'All') : `${vi ? 'Lớp' : 'Year'} ${g}${g === 10 ? '+' : ''}`}
                </button>
              ))}
            </div>
            <div className="geo-lib-grid">
              {list.map(({ t, c }) => (
                <button key={t.id} className="geo-lib-card" onClick={() => props.onInsert(c)} title={vi ? 'Chèn vào hình' : 'Insert'}>
                  <Thumb c={c} />
                  <span>{vi ? t.vi : t.en}</span>
                </button>
              ))}
              {!list.length && <p className="geo-muted">{vi ? 'Chưa có hình mẫu cho lớp này.' : 'No templates for this year yet.'}</p>}
            </div>
          </div>
        ) : (
          <div className="modal-body geo-lib-text">
            <div className="geo-lib-cols">
              <div className="geo-lib-left">
                <textarea
                  value={text}
                  rows={5}
                  autoFocus
                  placeholder={vi ? 'Gõ hoặc dán đề bài, ví dụ: Cho tam giác ABC vuông tại A có AB = 3 cm, AC = 4 cm. Kẻ đường cao AH.' : 'Type or paste the exercise…'}
                  onChange={(e) => setText(e.target.value)}
                  onPaste={(e) => {
                    const file = [...e.clipboardData.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
                    if (!file) return;
                    e.preventDefault();
                    setOcr({ image: URL.createObjectURL(file) });
                  }}
                />
                <button className="geo-chip geo-ocr-btn" onClick={() => setOcr({ image: null })}>
                  {vi ? 'Lấy đề từ ảnh (ảnh chụp, ảnh quét)…' : 'Exercise from a picture (photo, scan)…'}
                </button>
                {!text.trim() && (
                  <div className="geo-lib-examples">
                    <span className="geo-muted">{vi ? 'Thử một đề mẫu:' : 'Try an example:'}</span>
                    {EXAMPLES.map(([g, ex]) => (
                      <button key={ex} className="geo-chip" onClick={() => setText(ex)}>
                        <b>{g}</b> {ex}
                      </button>
                    ))}
                  </div>
                )}
                {error && <p className="geo-ask-error">{error}</p>}
                {result && (
                  <ol className="geo-sents">
                    {result.sentences.map((s, i) => (
                      <li key={i} className={`geo-sent st-${STATUS[s.status][0]}`}>
                        <label className="geo-sent-head" title={STATUS[s.status][vi ? 1 : 2]}>
                          {s.status !== 'skip' && <input type="checkbox" checked={s.status !== 'off'} onChange={() => toggle(i)} />}
                          <i className="geo-dot" aria-hidden />
                          <span>{s.text}</span>
                        </label>
                        {s.done.length > 0 && s.status !== 'off' && <div className="geo-sent-done">✓ {s.done.join(' · ')}</div>}
                        {s.status !== 'off' &&
                          s.clauses.filter((c) => !c.ok).map((c) => (
                            <div key={c.text} className="geo-sent-miss">
                              <span>{vi ? 'Chưa hiểu' : 'Not understood'}: “{c.text}”</span>
                              {c.suggestions.length > 0 && (
                                <span className="geo-sent-sugg">
                                  {vi ? 'Có phải ý bạn là:' : 'Did you mean:'}
                                  {c.suggestions.map((g) => (
                                    <button key={g.text} className="geo-chip" onClick={() => applySuggestion(c.text, g.text)} title={g.text}>
                                      {g.label}
                                    </button>
                                  ))}
                                </span>
                              )}
                            </div>
                          ))}
                        {s.errors.map((e) => (
                          <div key={e} className="geo-sent-err">⚠ {e}</div>
                        ))}
                      </li>
                    ))}
                  </ol>
                )}
                <div className="geo-lib-teach">
                  <label className="geo-check">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    {vi ? 'Ghi nhớ cách viết khi chọn gợi ý' : 'Remember the wording when a suggestion is chosen'}
                  </label>
                  {phrases.length > 0 && (
                    <button className="icon-btn" onClick={() => { setPhrases([]); savePhrases([]); }}>
                      {vi ? `Quên ${phrases.length} cách viết đã dạy` : `Forget ${phrases.length} taught wordings`}
                    </button>
                  )}
                </div>
              </div>
              <div className="geo-lib-right">
                {result ? <Thumb c={result.construction} /> : <span className="geo-thumb geo-thumb-empty">{vi ? 'Hình sẽ hiện ở đây' : 'The figure appears here'}</span>}
                {result && (
                  <>
                    {missed.length > 0 && (
                      <p className="geo-lib-missed">
                        {vi ? `Còn ${missed.length} chỗ chưa vẽ được — sẽ được ghi vào danh sách "Việc còn lại" để bạn vẽ thêm.` : `${missed.length} parts not drawn — they go to the "To do" list.`}
                      </p>
                    )}
                    <button className="btn btn-primary" onClick={() => props.onInsert(result.construction, missed)}>{vi ? 'Đưa vào hình vẽ' : 'Put in the figure'}</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
