import { DEFAULT_FONT_ID } from '../core/equation';
import type { RenderKind } from '../core/ooxml';

export type Lang = 'vi' | 'en';

export interface Settings {
  fontId: string;
  /** 0 = follow the paragraph's font size. */
  sizePt: number;
  lang: Lang;
  /** Editing-area zoom in percent (MathType default view is 200%). */
  zoom: number;
  /** Toolbar rows (View menu). */
  symbolRows: boolean;
  smallBar: boolean;
  tabBar: boolean;
  /** Simplified, kid-friendly palette instead of the MathType toolbar. */
  simple: boolean;
  /** New equations: MathType-style picture (exact look) or native Word equation. */
  kind: RenderKind;
  /** Geometry editor: school year whose tools are shown (2–10, or 'all'). */
  geoGrade?: number | 'all';
}

const KEY = 'mathstudio.settings.v3';

export const DEFAULT_SETTINGS: Settings = {
  fontId: DEFAULT_FONT_ID,
  sizePt: 0,
  lang: 'vi',
  zoom: 200,
  symbolRows: true,
  smallBar: true,
  tabBar: true,
  simple: false,
  kind: 'image',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
