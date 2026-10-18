/**
 * Asking for numbers in a child-friendly way: one labelled box per number, buttons with
 * the usual values, a slider for angles, a big on-screen keypad, and a small picture
 * showing which side or angle is being typed.
 */
import { useState } from 'react';
import type { Ask, ToolDef } from '../geometry/tools';
import type { Lang } from '../shared/settings';

interface Field {
  label: [string, string];
  /** free text (a list of numbers) instead of one number */
  text?: boolean;
  unit?: string;
  chips?: number[];
  /** slider range for angles */
  slider?: [number, number];
  /** what to highlight in the triangle picture */
  mark?: 'a' | 'b' | 'c' | 'A' | 'B';
  initial: string;
}

const D = (n: number) => String(n);

/** The boxes for each kind of question. Several boxes are joined with "; " for the tool. */
export function fieldsFor(ask: Ask): Field[] | null {
  const init = ask.initial.split(';').map((s) => s.trim());
  switch (ask.key) {
    case 'len':
      return [{ label: ['Độ dài', 'Length'], unit: 'cm', chips: [2, 3, 4, 5, 6, 8, 10], initial: init[0] }];
    case 'r':
      return [{ label: ['Bán kính', 'Radius'], unit: 'cm', chips: [1, 1.5, 2, 2.5, 3, 4, 5], initial: init[0] }];
    case 'deg':
      return [{ label: ['Số đo góc', 'Angle'], unit: '°', chips: [30, 45, 60, 90, 120, 135, 150, 180], slider: [0, 360], initial: init[0] }];
    case 'n':
      return [{ label: ['Số cạnh', 'Number of sides'], chips: [3, 4, 5, 6, 8, 10, 12], initial: init[0] }];
    case 'k':
      return [{ label: ['Tỉ số k', 'Ratio k'], chips: [-2, -1, 0.5, 2, 3], initial: init[0] }];
    case 'frac':
      return [
        { label: ['Chia thành (phần)', 'Number of parts'], chips: [2, 3, 4, 5, 6, 8, 10], initial: init[0] ?? '4' },
        { label: ['Tô màu (phần)', 'Coloured parts'], chips: [0, 1, 2, 3, 4], initial: init[1] ?? '1' },
        { label: ['Số hàng (hình chữ nhật, hình vuông)', 'Rows (rectangles, squares)'], chips: [1, 2, 3, 4], initial: init[2] ?? '1' },
      ];
    case 'numline':
      return [
        { label: ['Từ số', 'From'], chips: [-10, -5, -3, 0], initial: init[0] ?? '0' },
        { label: ['Đến số', 'To'], chips: [5, 10, 20, 100], initial: init[1] ?? '10' },
        { label: ['Mỗi vạch cách nhau', 'Step'], chips: [1, 2, 5, 10, 0.5], initial: init[2] ?? '1' },
        { label: ['Đánh dấu các số (cách nhau bởi dấu cách)', 'Numbers to mark (space separated)'], text: true, initial: init[3] ?? '' },
      ];
    case 'box':
      return [
        { label: ['Chiều dài', 'Length'], unit: 'cm', chips: [3, 4, 5, 6], initial: init[0] },
        { label: ['Chiều rộng', 'Width'], unit: 'cm', chips: [2, 3, 4], initial: init[1] },
        { label: ['Chiều cao', 'Height'], unit: 'cm', chips: [2, 2.5, 3, 4], initial: init[2] },
      ];
    case 'cube':
      return [{ label: ['Cạnh', 'Edge'], unit: 'cm', chips: [2, 2.5, 3, 4], initial: init[0] }];
    case 'pyrReg':
      return [
        { label: ['Số cạnh đáy', 'Sides of the base'], chips: [3, 4, 5, 6], initial: init[0] },
        { label: ['Cạnh đáy', 'Base side'], unit: 'cm', chips: [3, 4, 5], initial: init[1] },
        { label: ['Chiều cao', 'Height'], unit: 'cm', chips: [3, 4, 5, 6], initial: init[2] },
      ];
    case 'ratio':
      return [{ label: ['Tỉ số AM : AB (ví dụ 1/3; lớn hơn 1: M nằm ngoài AB)', 'Ratio AM : AB (e.g. 1/3; over 1: M beyond B)'], text: true, initial: init[0] }];
    case 'prism':
    case 'pyr':
      return [
        { label: ['Cạnh đáy', 'Base'], unit: 'cm', chips: [3, 4, 5], initial: init[0] },
        { label: ['Chiều sâu đáy', 'Base depth'], unit: 'cm', chips: [2, 3, 4], initial: init[1] },
        { label: ['Chiều cao', 'Height'], unit: 'cm', chips: [3, 3.5, 4, 5], initial: init[2] },
      ];
    case 'round':
      return [
        { label: ['Bán kính đáy', 'Base radius'], unit: 'cm', chips: [1, 1.5, 2, 2.5], initial: init[0] },
        { label: ['Chiều cao', 'Height'], unit: 'cm', chips: [3, 3.5, 4, 5], initial: init[1] },
      ];
    case 'ball':
      return [{ label: ['Bán kính', 'Radius'], unit: 'cm', chips: [1.5, 2, 2.5, 3], initial: init[0] }];
    case 'xy':
      return [
        { label: ['Hoành độ x', 'x'], chips: [-3, -2, -1, 0, 1, 2, 3], initial: init[0] ?? '0' },
        { label: ['Tung độ y', 'y'], chips: [-3, -2, -1, 0, 1, 2, 3], initial: init[1] ?? '0' },
      ];
    case 'sss':
      return [
        { label: ['Cạnh BC', 'Side BC'], unit: 'cm', chips: [3, 4, 5, 6], mark: 'a', initial: init[0] },
        { label: ['Cạnh CA', 'Side CA'], unit: 'cm', chips: [3, 4, 5, 6], mark: 'b', initial: init[1] },
        { label: ['Cạnh AB', 'Side AB'], unit: 'cm', chips: [3, 4, 5, 6], mark: 'c', initial: init[2] },
      ];
    case 'sas':
      return [
        { label: ['Cạnh AB', 'Side AB'], unit: 'cm', chips: [3, 4, 5, 6], mark: 'c', initial: init[0] },
        { label: ['Góc A', 'Angle A'], unit: '°', chips: [30, 45, 60, 90, 120], slider: [1, 179], mark: 'A', initial: init[1] },
        { label: ['Cạnh AC', 'Side AC'], unit: 'cm', chips: [3, 4, 5, 6], mark: 'b', initial: init[2] },
      ];
    case 'asa':
      return [
        { label: ['Cạnh AB', 'Side AB'], unit: 'cm', chips: [3, 4, 5, 6], mark: 'c', initial: init[0] },
        { label: ['Góc A', 'Angle A'], unit: '°', chips: [30, 45, 60, 90], slider: [1, 178], mark: 'A', initial: init[1] },
        { label: ['Góc B', 'Angle B'], unit: '°', chips: [30, 45, 60, 90], slider: [1, 178], mark: 'B', initial: init[2] },
      ];
    default:
      return null; // free text (text, function)
  }
}

/** Triangle ABC with the side or angle being typed drawn in colour. */
function TrianglePicture({ mark }: { mark?: Field['mark'] }) {
  const A = { x: 30, y: 92 };
  const B = { x: 150, y: 92 };
  const C = { x: 70, y: 20 };
  const hi = '#e8710a';
  const side = (p: { x: number; y: number }, q: { x: number; y: number }, on: boolean) => (
    <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={on ? hi : '#333'} strokeWidth={on ? 4 : 1.6} strokeLinecap="round" />
  );
  return (
    <svg viewBox="0 0 180 112" width="180" height="112" aria-hidden className="geo-ask-pic">
      {side(B, C, mark === 'a')}
      {side(C, A, mark === 'b')}
      {side(A, B, mark === 'c')}
      {mark === 'A' && <path d="M52 92A22 22 0 0 0 42 72" stroke={hi} strokeWidth="4" fill="none" />}
      {mark === 'B' && <path d="M128 92A22 22 0 0 1 133 77" stroke={hi} strokeWidth="4" fill="none" />}
      <text x={A.x - 16} y={A.y + 6} className="geo-ask-pic-l">A</text>
      <text x={B.x + 6} y={B.y + 6} className="geo-ask-pic-l">B</text>
      <text x={C.x - 4} y={C.y - 6} className="geo-ask-pic-l">C</text>
    </svg>
  );
}

export function AskDialog(props: {
  tool: ToolDef;
  lang: Lang;
  /** show the big on-screen keypad (primary school, touch screens) */
  keypad: boolean;
  initial?: string;
  error?: string | null;
  onCancel(): void;
  onSubmit(value: string): void;
}) {
  const { tool, lang } = props;
  const ask = tool.ask!;
  const fields = fieldsFor(ask);
  const k = lang === 'vi' ? 0 : 1;
  const [vals, setVals] = useState<string[]>(() => (fields ? fields.map((f) => f.initial ?? '') : [props.initial ?? ask.initial]));
  const [focus, setFocus] = useState(0);
  const set = (i: number, v: string) => setVals((xs) => xs.map((x, j) => (j === i ? v : x)));
  const decimal = lang === 'vi' ? ',' : '.';
  const press = (key: string) => {
    const cur = vals[focus] ?? '';
    if (key === '⌫') set(focus, cur.slice(0, -1));
    else if (key === '±') set(focus, cur.startsWith('-') ? cur.slice(1) : `-${cur}`);
    else if (key === decimal) set(focus, cur.includes(',') || cur.includes('.') ? cur : `${cur || '0'}${decimal}`);
    else set(focus, cur + key);
  };
  const submit = () => props.onSubmit(fields ? vals.map((v) => v.trim()).join('; ') : vals[0]);
  const showPicture = fields?.some((f) => f.mark);

  return (
    <div className="modal-backdrop" onMouseDown={props.onCancel}>
      <form
        className="modal geo-ask"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="modal-head"><h2>{tool[lang]}</h2></div>
        <div className="modal-body">
          {showPicture && <TrianglePicture mark={fields![focus]?.mark} />}
          {fields ? (
            fields.map((f, i) => (
              <div key={i} className={`geo-ask-field ${focus === i ? 'on' : ''}`}>
                <label>
                  <span>{f.label[k]}</span>
                  <span className="geo-ask-input">
                    <input
                      autoFocus={i === 0}
                      className={f.text ? 'wide' : ''}
                      inputMode={f.text ? 'text' : 'decimal'}
                      value={vals[i]}
                      onFocus={() => setFocus(i)}
                      onChange={(e) => set(i, e.target.value)}
                    />
                    {f.unit && <em>{f.unit}</em>}
                  </span>
                </label>
                {f.slider && (
                  <input
                    type="range"
                    min={f.slider[0]}
                    max={f.slider[1]}
                    value={Number((vals[i] || '0').replace(',', '.')) || 0}
                    onFocus={() => setFocus(i)}
                    onChange={(e) => set(i, e.target.value)}
                  />
                )}
                {f.chips && (
                  <div className="geo-quick">
                    {f.chips.map((n) => (
                      <button
                        type="button"
                        key={n}
                        className={`geo-chip ${vals[i] === D(n).replace('.', decimal) ? 'on' : ''}`}
                        onClick={() => {
                          setFocus(i);
                          set(i, D(n).replace('.', decimal));
                        }}
                      >
                        {D(n).replace('.', decimal)}{f.unit === '°' ? '°' : f.unit ? ` ${f.unit}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <label className="geo-ask-field on">
              <span>{ask[lang]}</span>
              <input autoFocus value={vals[0]} onChange={(e) => set(0, e.target.value)} />
            </label>
          )}
          {props.keypad && fields && (
            <div className="geo-keypad" role="group" aria-label="keypad">
              {['7', '8', '9', '4', '5', '6', '1', '2', '3', '±', '0', decimal].map((key) => (
                <button type="button" key={key} onClick={() => press(key)}>{key}</button>
              ))}
              <button type="button" className="wide" onClick={() => press('⌫')}>⌫</button>
            </div>
          )}
          {props.error && <p className="geo-ask-error">{props.error}</p>}
          <div className="geo-ask-actions">
            <button type="button" className="btn btn-tonal" onClick={props.onCancel}>{lang === 'vi' ? 'Hủy' : 'Cancel'}</button>
            <button type="submit" className="btn btn-primary">{lang === 'vi' ? 'Vẽ' : 'Draw'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
