/** Small on-canvas helpers: step-by-step bar, shape variant chooser, floating mini toolbar. */
import type { ReactNode } from 'react';
import type { Family } from '../geometry/grades';
import type { ToolDef, ToolId } from '../geometry/tools';
import type { Lang } from '../shared/settings';
import { ToolIcon } from './icons';

/** "● ○ ○  Bước 1/3: Nhấp đỉnh thứ nhất" with Done / Cancel. */
export function StepBar(props: {
  lang: Lang;
  tool: ToolDef;
  step: number;
  total: number;
  text: string;
  done?: boolean;
  onDone(): void;
  onCancel(): void;
}) {
  const vi = props.lang === 'vi';
  return (
    <div className="geo-steps" role="status">
      <span className="geo-steps-tool">
        <ToolIcon id={props.tool.id} size={20} />
        {props.tool[props.lang]}
      </span>
      <span className="geo-steps-dots" aria-hidden>
        {Array.from({ length: props.total }, (_, i) => (
          <i key={i} className={i < props.step ? 'done' : i === props.step ? 'now' : ''} />
        ))}
      </span>
      <span className="geo-steps-text">
        {props.total > 1 && <b>{vi ? 'Bước' : 'Step'} {Math.min(props.step + 1, props.total)}/{props.total}: </b>}
        {props.text}
      </span>
      {props.done && (
        <button className="btn btn-primary geo-steps-btn" onClick={props.onDone}>{vi ? 'Xong' : 'Done'}</button>
      )}
      {props.step > 0 && (
        <button className="btn btn-tonal geo-steps-btn" onClick={props.onCancel}>{vi ? 'Làm lại' : 'Restart'}</button>
      )}
    </div>
  );
}

/** A row of pictures to switch between the shapes of a family (triangle kinds, quadrilaterals). */
export function VariantBar(props: { family: Family; tools: ToolDef[]; active: ToolId; lang: Lang; onPick(t: ToolId): void }) {
  return (
    <div className="geo-variants" role="toolbar" aria-label={props.family[props.lang]}>
      {props.tools.map((t) => (
        <button key={t.id} className={`geo-variant ${t.id === props.active ? 'on' : ''}`} onClick={() => props.onPick(t.id)} title={t[props.lang]}>
          <ToolIcon id={t.id} size={26} />
          <span>{shortName(t, props.lang)}</span>
        </button>
      ))}
    </div>
  );
}

/** Short names under the pictures ("Tam giác cân" → "Cân"). */
function shortName(t: ToolDef, lang: Lang): string {
  const name = t[lang];
  if (lang === 'vi') {
    return name
      .replace(/^Tam giác biết /, 'Biết ')
      .replace(/^Tam giác /, '')
      .replace(/^Hình /, '')
      .replace(/^Tam giác$/, 'Thường')
      .replace(/^(.)/, (m) => m.toUpperCase());
  }
  return name.replace(/ triangle$/i, '').replace(/^Triangle$/, 'Any');
}

export interface MiniAction {
  key: string;
  label: string;
  icon: ReactNode;
  on?: boolean;
  danger?: boolean;
  run(): void;
}

/** Big buttons next to the selected object, so nobody has to look for the side panel. */
export function MiniToolbar(props: { x: number; y: number; colors: string[]; color?: string; onColor(c: string): void; actions: MiniAction[] }) {
  return (
    <div className="geo-mini" style={{ left: props.x, top: props.y }} onPointerDown={(e) => e.stopPropagation()}>
      {props.colors.map((col) => (
        <button key={col} className={`geo-mini-color ${props.color === col ? 'on' : ''}`} style={{ background: col }} onClick={() => props.onColor(col)} aria-label={col} />
      ))}
      <span className="geo-mini-sep" />
      {props.actions.map((a) => (
        <button key={a.key} className={`geo-mini-btn ${a.on ? 'on' : ''} ${a.danger ? 'danger' : ''}`} onClick={a.run} title={a.label}>
          {a.icon}
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
