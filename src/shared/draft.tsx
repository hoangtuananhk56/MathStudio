/**
 * Unsaved work of an editor dialog (the figure being drawn, the equation being typed), kept
 * in localStorage while the dialog is open. If the dialog is lost before its result reaches
 * Word (Word closed it, the add-in's runtime stopped…), the next new figure / equation offers
 * to bring the work back.
 */
import { useEffect, useRef, useState } from 'react';

export interface Draft<T> {
  at: number;
  value: T;
}

const MAX_AGE = 3 * 24 * 3600 * 1000;

export function loadDraft<T>(key: string): Draft<T> | null {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? 'null') as Draft<T> | null;
    return d && typeof d.at === 'number' && Date.now() - d.at < MAX_AGE ? d : null;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* storage full or unavailable: no safety net, nothing else changes */
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* unavailable */
  }
}

/**
 * Keeps the work saved (a second after it last changed) once `active`; nothing is saved
 * while `value` is null (an empty editor).
 */
export function useDraftSaver<T>(key: string, value: T | null, active: boolean): void {
  const timer = useRef<number>();
  useEffect(() => {
    if (!active || value === null) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveDraft(key, value), 1000);
    return () => window.clearTimeout(timer.current);
  }, [key, value, active]);
}

/** The offer to restore, shown above the editor. */
export function DraftBanner(props: { lang: 'vi' | 'en'; at: number; what: [string, string]; onRestore(): void; onDismiss(): void }) {
  const vi = props.lang === 'vi';
  const when = new Date(props.at).toLocaleString(vi ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  return (
    <div className="banner banner-warn draft-banner" role="status">
      <span>
        {vi ? `Có ${props.what[0]} chưa chèn vào Word (lúc ${when}).` : `There is ${props.what[1]} not inserted into Word (${when}).`}
      </span>
      <button className="btn btn-tonal draft-btn" onClick={props.onRestore}>
        {vi ? 'Khôi phục' : 'Restore'}
      </button>
      <button className="btn draft-btn draft-dismiss" onClick={props.onDismiss}>
        {vi ? 'Bỏ qua' : 'Dismiss'}
      </button>
    </div>
  );
}

/** The draft offered when the editor opens, until it is restored, dismissed or new work starts. */
export function useDraftOffer<T>(key: string, offer: boolean): [Draft<T> | null, () => void] {
  const [d, setD] = useState<Draft<T> | null>(() => (offer ? loadDraft<T>(key) : null));
  return [d, () => setD(null)];
}
