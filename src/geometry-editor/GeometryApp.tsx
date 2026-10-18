import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeAll, insidePolygon, intersect, paramOn, dist, type Value, type Values, type Vec } from '../geometry/engine';
import { dependencies, emptyConstruction, isPointDef, type Construction, type GeoObject, type Id, type Style } from '../geometry/model';
import { autoSpan, distanceToDrawn, drawingBounds, drawnSpan, formatAngle, formatMeasure, labelOf, plainLabel, polygonArea, polygonPerimeter, renderConstruction } from '../geometry/render';
import { snapPoint, type Guide } from '../geometry/snap';
import { copyClosure, freeAncestors, moveObjects, objectsInRect, pasteObjects, positionsOf, stabilizeIntersections, transformObjects, translateFrom, type GroupTransform } from '../geometry/edit';
import {
  ALL_TOOLS, TOOL_GROUPS, TOOL_KEYS, createFromTool, deleteWithDependents, matches, nextId, nextPointName, toolById, type ToolDef, type ToolId,
} from '../geometry/tools';
import { OCR_IMAGE_KEY, type GeometryInit, type GeometryMessage } from '../shared/protocol';
import { OcrPanel } from '../ocr/OcrPanel';
import { clearDraft, DraftBanner, useDraftOffer, useDraftSaver } from '../shared/draft';
import { pageToPlain } from '../ocr/page';
import { loadSettings, saveSettings, type Lang } from '../shared/settings';
import { ToolIcon } from './icons';
import { GRADES, familyOf, isPrimary, stepCount, stepText, toolsForGrade, type Grade } from '../geometry/grades';
import { SMART_TOOLS, angleAtClick, smartPicks } from '../geometry/smart';
import { AskDialog } from './AskDialog';
import { LibraryDialog } from './LibraryDialog';
import { normalize } from '../geometry/fromText';
import { MiniToolbar, StepBar, VariantBar, type MiniAction } from './widgets';
import { handleLocal, instrumentsSvg, snapInstrument, type Instrument, type InstrumentKind } from './instruments';

/* ----------------------------------- texts ---------------------------------- */

const TX = {
  title: { vi: 'Vẽ hình', en: 'Geometry' },
  titleEdit: { vi: 'Sửa hình', en: 'Edit figure' },
  basic: { vi: 'Cơ bản', en: 'Basic' },
  advanced: { vi: 'Nâng cao', en: 'Advanced' },
  vn: { vi: 'SGK Việt Nam', en: 'VN textbook' },
  intl: { vi: 'Quốc tế', en: 'International' },
  grid: { vi: 'Lưới', en: 'Grid' },
  axes: { vi: 'Hệ trục', en: 'Axes' },
  undo: { vi: 'Hoàn tác', en: 'Undo' },
  redo: { vi: 'Làm lại', en: 'Redo' },
  cancel: { vi: 'Hủy', en: 'Cancel' },
  insert: { vi: 'Chèn vào Word', en: 'Insert into Word' },
  update: { vi: 'Cập nhật', en: 'Update' },
  empty: { vi: 'Hình đang trống — hãy vẽ gì đó trước nhé!', en: 'The figure is empty — draw something first!' },
  props: { vi: 'Thuộc tính', en: 'Properties' },
  objects: { vi: 'Đối tượng', en: 'Objects' },
  noSelection: { vi: 'Chọn công cụ “Di chuyển” rồi nhấp vào một đối tượng để chỉnh.', en: 'Use “Move” and click an object to edit it.' },
  label: { vi: 'Tên', en: 'Label' },
  showLabel: { vi: 'Hiện tên', en: 'Show label' },
  color: { vi: 'Màu', en: 'Colour' },
  line: { vi: 'Nét', en: 'Line' },
  solid: { vi: 'Liền', en: 'Solid' },
  dashed: { vi: 'Đứt', en: 'Dashed' },
  dotted: { vi: 'Chấm', en: 'Dotted' },
  thickness: { vi: 'Độ dày', en: 'Thickness' },
  ticks: { vi: 'Gạch bằng nhau', en: 'Equal ticks' },
  arcs: { vi: 'Cung đánh dấu', en: 'Arc marks' },
  showValue: { vi: 'Hiện số đo', en: 'Show measure' },
  fill: { vi: 'Tô màu', en: 'Fill' },
  hide: { vi: 'Ẩn', en: 'Hide' },
  del: { vi: 'Xóa', en: 'Delete' },
  ok: { vi: 'Đồng ý', en: 'OK' },
  size: { vi: 'Kích thước khi chèn', en: 'Insert size' },
  zoomIn: { vi: 'Phóng to', en: 'Zoom in' },
  zoomOut: { vi: 'Thu nhỏ', en: 'Zoom out' },
  fit: { vi: 'Vừa khung', en: 'Fit' },
  angleFormat: { vi: 'Số đo góc', en: 'Angle size' },
  hiddenObjects: { vi: 'Đối tượng ẩn', en: 'Hidden objects' },
  reflex: { vi: 'Lấy góc lớn hơn 180°', en: 'Reflex angle (> 180°)' },
  arcTicks: { vi: 'Gạch trên cung', en: 'Strokes on the arc' },
  angleName: { vi: 'Tên góc', en: 'Angle name' },
  angleText: { vi: 'Chữ trên góc', en: 'Text on the angle' },
  none: { vi: 'Không', en: 'None' },
  measured: { vi: 'Số đo thật', en: 'Measured' },
  custom: { vi: 'Tự ghi', en: 'Custom' },
  customHint: { vi: 'Ví dụ 60° (ghi theo đề bài, không phụ thuộc hình vẽ)', en: 'e.g. 60° (as given, whatever the drawing measures)' },
  extent: { vi: 'Độ dài nét vẽ', en: 'Drawn length' },
  extentAuto: { vi: 'Gọn', en: 'Short' },
  extentFull: { vi: 'Kéo dài hết', en: 'Full' },
  extentHint: { vi: 'Kéo ô vuông xanh ở hai đầu để cắt ngắn hoặc kéo dài.', en: 'Drag the blue squares at the ends to shorten or lengthen it.' },
  tipDot: { vi: 'Vẽ chấm tại điểm', en: 'Draw a dot' },
  pointShape: { vi: 'Kiểu điểm', en: 'Point style' },
  resetLabel: { vi: 'Đặt lại vị trí tên', en: 'Reset label position' },
  selectAll: { vi: 'Chọn hết', en: 'Select all' },
  duplicate: { vi: 'Nhân bản', en: 'Duplicate' },
  selectedN: { vi: 'Đang chọn {n} đối tượng. Nắm vào bất kỳ chỗ nào trong khung để dời cả nhóm; thanh phía trên để xoay, lật, phóng to; mũi tên để dịch nhẹ; Delete để xóa.', en: '{n} objects selected. Grab anywhere inside the box to move them all; the bar above turns, flips and resizes; arrow keys nudge; Delete removes them.' },
  area: { vi: 'Diện tích', en: 'Area' },
  perimeter: { vi: 'Chu vi', en: 'Perimeter' },
  showArea: { vi: 'Hiện diện tích trên hình', en: 'Show the area on the figure' },
  labelTip: { vi: 'Gõ A_1 để được A₁, x^2 để được x²', en: 'Type A_1 for A₁, x^2 for x²' },
  grade: { vi: 'Dành cho', en: 'For' },
  gradeN: { vi: 'Lớp', en: 'Year' },
  allGrades: { vi: 'Tất cả công cụ', en: 'All tools' },
  dashShort: { vi: 'Nét đứt', en: 'Dashed' },
  measureShort: { vi: 'Số đo', en: 'Measure' },
  equalShort: { vi: 'Bằng nhau', en: 'Equal' },
  rename: { vi: 'Đổi tên', en: 'Rename' },
  answerShort: { vi: 'Đáp án', en: 'Answer' },
  isAnswer: { vi: 'Thuộc đáp án (ẩn ở bản đề)', en: 'Part of the answer (hidden in the question)' },
  version: { vi: 'Bản', en: 'Version' },
  question: { vi: 'Đề', en: 'Question' },
  withAnswer: { vi: 'Đáp án', en: 'Answer' },
  versionTip: { vi: 'Bản Đề bỏ các nét đáp án khi chèn vào Word. Mẹo: chèn bản Đề, copy hình, nhấp đúp vào bản copy và chọn Đáp án.', en: 'The question leaves out answer marks. Tip: insert the question, copy the figure, double-click the copy and choose Answer.' },
  caption: { vi: 'Chú thích “Hình n”', en: 'Caption “Figure n”' },
  compass: { vi: 'Nét com-pa', en: 'Compass arcs' },
  compassTip: { vi: 'Khi dựng tam giác biết 3 cạnh, trung trực, tia phân giác: giữ lại các cung com-pa như dựng hình trên giấy.', en: 'Keep the compass arcs of constructions (triangle from 3 sides, bisectors) as on paper.' },
  ruler: { vi: 'Thước kẻ', en: 'Ruler' },
  library: { vi: 'Hình mẫu & đề bài', en: 'Templates & exercises' },
  fromPicture: { vi: 'Từ ảnh', en: 'From picture' },
  fromPictureTip: { vi: 'Dựng lại hình từ ảnh hình vẽ (ảnh chụp, ảnh quét, ảnh trong tài liệu), hoặc đọc đề bài trong ảnh rồi vẽ', en: 'Rebuild a figure from a picture of it, or read an exercise from a picture and draw it' },
  useFigure: { vi: 'Đưa vào hình vẽ', en: 'Add to the drawing' },
  drawExercise: { vi: 'Vẽ hình theo đề này', en: 'Draw this exercise' },
  todo: { vi: 'Việc còn lại', en: 'To do' },
  todoTip: { vi: 'Những phần của đề chưa vẽ tự động được. Bấm vào tên công cụ để vẽ, đánh dấu khi xong.', en: 'Parts of the exercise not drawn automatically. Click the tool to draw them, tick when done.' },
  turnLeft: { vi: 'Xoay trái', en: 'Turn left' },
  turnRight: { vi: 'Xoay phải', en: 'Turn right' },
  flipH: { vi: 'Lật ngang', en: 'Flip ↔' },
  flipV: { vi: 'Lật dọc', en: 'Flip ↕' },
  bigger: { vi: 'Phóng to', en: 'Bigger' },
  smaller: { vi: 'Thu nhỏ', en: 'Smaller' },
  unselect: { vi: 'Bỏ chọn', en: 'Deselect' },
  setSquare: { vi: 'Ê-ke', en: 'Set square' },
  protractor: { vi: 'Thước đo góc', en: 'Protractor' },
  instrumentTip: { vi: 'Kéo để di chuyển, kéo nút ⟳ để xoay. Thả gần một điểm thì dụng cụ bám vào điểm đó.', en: 'Drag to move, drag ⟳ to turn. Dropped near a point, it sticks to it.' },
} satisfies Record<string, Record<Lang, string>>;

const COLORS = ['#111111', '#1d4f91', '#c0392b', '#1e8449', '#d35400', '#7d3c98', '#7f8c8d'];

/* ------------------------------- history state ------------------------------- */

interface History {
  past: Construction[];
  present: Construction;
  future: Construction[];
}

function useHistory(initial: Construction) {
  const [h, setH] = useState<History>({ past: [], present: initial, future: [] });
  const commit = useCallback((next: Construction | ((c: Construction) => Construction)) => {
    setH((s) => {
      const value = typeof next === 'function' ? next(s.present) : next;
      return { past: [...s.past.slice(-100), s.present], present: value, future: [] };
    });
  }, []);
  /** Replace without a history entry (used while dragging). */
  const replace = useCallback((next: (c: Construction) => Construction) => setH((s) => ({ ...s, present: next(s.present) })), []);
  const undo = useCallback(() => setH((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s)), []);
  const redo = useCallback(() => setH((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)), []);
  return { c: h.present, commit, replace, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0, snapshot: () => h.present };
}

/* ------------------------------------ app ------------------------------------ */

interface Props {
  init: GeometryInit;
  send: ((msg: GeometryMessage) => void) | null;
}

interface AskState {
  tool: ToolDef;
  picks: Id[];
  clicks?: Vec[];
  fresh?: Id[];
  at?: Vec;
  value: string;
  error?: string | null;
}

/** Where the figure being drawn is kept until it reaches Word (see shared/draft). */
const DRAFT_KEY = 'mathstudio.draft.figure';

export function GeometryApp({ init, send }: Props) {
  const [lang, setLang] = useState<Lang>(loadSettings().lang);
  // School year: which tools are shown; years 2–5 get the big, simple layout.
  const [grade, setGrade] = useState<Grade>(() => {
    const st = loadSettings();
    return (st.geoGrade as Grade | undefined) ?? (st.simple ? 3 : 'all');
  });
  const primary = isPrimary(grade);
  const simple = primary;
  const t = (k: keyof typeof TX) => TX[k][lang];
  const hist = useHistory(init.construction ?? { ...emptyConstruction(), grid: primary });
  const c = hist.c;
  const values = useMemo(() => computeAll(c), [c]);

  // unsaved work survives a lost dialog; a new figure offers to bring it back
  const newFigure = init.mode === 'insert' && !init.construction && !init.exercise && !init.ocr;
  const [draft, dropDraft] = useDraftOffer<Construction>(DRAFT_KEY, newFigure);
  const startC = useRef(c);
  useEffect(() => {
    if (draft && c !== startC.current) dropDraft(); // new work started: that is the answer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);
  useDraftSaver(DRAFT_KEY, c.objects.some((o) => !o.style.hidden) ? c : null, !draft);
  const cancel = () => {
    clearDraft(DRAFT_KEY);
    send?.({ type: 'cancel' });
  };

  const [tool, setTool] = useState<ToolId>('move');
  const [groupTool, setGroupTool] = useState<Record<string, ToolId>>({});
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  /** Where the open tool menu sits on screen (it floats above everything, beside its button). */
  const [popAt, setPopAt] = useState<{ left: number; top: number; maxH: number }>({ left: 0, top: 0, maxH: 400 });
  const [picks, setPicks] = useState<Id[]>([]);
  /** Click positions matching `picks` (the angle-between-lines tool needs the clicked side). */
  const [clicks, setClicks] = useState<Vec[]>([]);
  /** Picked points that were created by clicking empty space (they may become ray ends like the x of Ox). */
  const [fresh, setFresh] = useState<Id[]>([]);
  const [snapInfo, setSnapInfo] = useState<{ guides: Guide[]; measure?: { length: number; deg: number }; sx: number; sy: number } | null>(null);
  const resetPicks = () => {
    setPicks([]);
    setClicks([]);
    setFresh([]);
  };
  const [selected, setSelected] = useState<Id | null>(null);
  /** Further selected objects (Shift+click, rubber band, Ctrl+A), besides `selected`. */
  const [multi, setMulti] = useState<Id[]>([]);
  const [band, setBand] = useState<{ a: Vec; b: Vec } | null>(null);
  const clipboard = useRef<GeoObject[] | null>(null);
  const selIds = useMemo(() => [...new Set([...(selected ? [selected] : []), ...multi])], [selected, multi]);
  const selectOnly = (ids: Id[]) => {
    setSelected(ids[0] ?? null);
    setMulti(ids.slice(1));
  };
  const [hovered, setHovered] = useState<Id | null>(null);
  const [mouse, setMouse] = useState<Vec | null>(null);
  const [ask, setAsk] = useState<AskState | null>(null);
  const [message, setMessage] = useState<string | null>(init.error ?? null);

  /* ---- viewport: centre + pixels per unit, sized to the canvas element ---- */
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [cam, setCam] = useState(() => ({
    cx: (c.view.xmin + c.view.xmax) / 2,
    cy: (c.view.ymin + c.view.ymax) / 2,
    scale: 48,
  }));
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let last = { w: el.clientWidth, h: el.clientHeight };
    setSize(last);
    // When the canvas changes size (the hint bar wrapping, the window resized) keep the
    // top-left corner of the drawing where it is, so the figure doesn't jump under the cursor.
    const ro = new ResizeObserver(() => {
      const next = { w: el.clientWidth, h: el.clientHeight };
      const dw = next.w - last.w;
      const dh = next.h - last.h;
      last = next;
      if (!dw && !dh) return;
      setCam((cm) => ({ ...cm, cx: cm.cx + dw / 2 / cm.scale, cy: cm.cy - dh / 2 / cm.scale }));
      setSize(next);
    });
    ro.observe(el);
    // Ctrl+wheel zooms the figure, not the whole dialog
    const stopZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    el.addEventListener('wheel', stopZoom, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', stopZoom);
    };
  }, []);
  const view = useMemo(
    () => ({
      xmin: cam.cx - size.w / 2 / cam.scale,
      xmax: cam.cx + size.w / 2 / cam.scale,
      ymin: cam.cy - size.h / 2 / cam.scale,
      ymax: cam.cy + size.h / 2 / cam.scale,
    }),
    [cam, size],
  );
  const toWorld = (sx: number, sy: number): Vec => ({ x: view.xmin + sx / cam.scale, y: view.ymax - sy / cam.scale });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const activeTool = toolById(tool);
  const allowed = toolsForGrade(grade);
  const tools = allowed ? ALL_TOOLS.filter((x) => allowed.has(x.id)) : ALL_TOOLS;
  /** Primary-school rail: one button per shape family (the kinds are chosen on the canvas). */
  const railTools = tools.filter((x) => {
    const f = familyOf(x.id);
    return !f || f.members.find((m) => !allowed || allowed.has(m)) === x.id;
  });
  /** Hit radius in px: bigger for small fingers and first mouse users. */
  const TOL = primary ? 16 : 9;
  const [toast, setToast] = useState<string | null>(null);
  /** Ruler, set square, protractor on the canvas (editor only, never inserted). */
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(!!init.exercise);
  /** Exercise text for the library's "type the exercise" tab (typed, selected or read from a picture). */
  const [libraryText, setLibraryText] = useState(init.exercise);
  // "From a picture": with the picture selected in Word, or one pasted here
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
  const dialogOpen = useRef(false);
  dialogOpen.current = !!ocr || libraryOpen;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (dialogOpen.current) return;
      const file = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      setOcr({ image: URL.createObjectURL(file) });
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, []);
  /** Space held: dragging pans the view (as in drawing programs). */
  const spaceDown = useRef(false);
  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA';
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e)) {
        spaceDown.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  const [fitSoon, setFitSoon] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 9000);
    return () => window.clearTimeout(id);
  }, [toast]);

  /* ------------------------------- hit testing ------------------------------- */

  const hitTest = useCallback(
    (p: Vec, accept: (o: GeoObject) => boolean): Id | null => {
      const tol = TOL / cam.scale;
      let best: Id | null = null;
      let bestD = Infinity;
      for (const o of c.objects) {
        const v = values.get(o.id);
        if (!v || o.style.hidden || !accept(o)) continue;
        // Points win over the lines they sit on; lines and rays count only where they are drawn.
        let d = distanceToDrawn(o, v, c, values, view, p);
        if (v.k === 'point') d -= tol * 0.6;
        // a segment on a side of a polygon (equal ticks…) wins over the polygon
        else if (v.k === 'straight') d -= 0.5 / cam.scale;
        // inside a polygon: the polygon, but sides and points nearer still win
        else if (v.k === 'polygon' && insidePolygon(v.pts, p)) d = Math.min(d, tol * 0.55);
        // angle marks: the arc as drawn (in px), or anywhere inside it
        else if (v.k === 'angle') d = angleMarkDistance(v, p, cam.scale);
        if (d < tol && d < bestD) {
          bestD = d;
          best = o.id;
        }
      }
      return best;
    },
    [c, values, cam.scale, view, TOL],
  );

  /**
   * The side of a polygon under the cursor, as a segment: the one already drawn on it, or a
   * new one (so a side can be selected, styled, measured or used by a tool, as in GeoGebra).
   */
  const sideUnder = (p: Vec, con: Construction, vals: Values): { con: Construction; id: Id } | null => {
    const tol = TOL / cam.scale;
    let best: { a: Id; b: Id; d: number } | null = null;
    for (const o of con.objects) {
      const v = vals.get(o.id);
      if (o.style.hidden || o.def.t !== 'polygon' || v?.k !== 'polygon') continue;
      v.pts.forEach((q, i) => {
        const r = v.pts[(i + 1) % v.pts.length];
        const L = dist(q, r);
        if (L < 1e-9) return;
        const t = Math.max(0, Math.min(L, ((p.x - q.x) * (r.x - q.x) + (p.y - q.y) * (r.y - q.y)) / L));
        const d = dist(p, { x: q.x + ((r.x - q.x) * t) / L, y: q.y + ((r.y - q.y) * t) / L });
        const def = o.def as { pts: Id[] };
        if (d <= tol && (!best || d < best.d)) best = { a: def.pts[i], b: def.pts[(i + 1) % def.pts.length], d };
      });
    }
    if (!best) return null;
    const { a, b } = best as { a: Id; b: Id };
    const key = [a, b].sort().join();
    const existing = con.objects.find((o) => !o.style.hidden && o.def.t === 'segment' && [o.def.a, o.def.b].sort().join() === key);
    if (existing) return { con, id: existing.id };
    const id = nextId(con, 's');
    return { con: { ...con, objects: [...con.objects, { id, def: { t: 'segment', a, b }, style: {} }] }, id };
  };

  /** Snaps a free position: alignment guides, grid, and (Shift) 15° / 0.5 cm steps from the last pick. */
  const snapFree = (raw: Vec, shift: boolean, exclude?: Id) => {
    const points: Vec[] = [];
    for (const o of c.objects) {
      const v = values.get(o.id);
      if (v?.k === 'point' && o.id !== exclude && !o.style.hidden) points.push(v.p);
    }
    const last = picks.length ? values.get(picks[picks.length - 1]) : null;
    const anchor = last?.k === 'point' ? last.p : null;
    return snapPoint(raw, { scale: cam.scale, points, anchor, shift, grid: c.grid });
  };

  /** Uses the point under the cursor, or creates one (on an object, at an intersection, or free). */
  const pickOrCreatePoint = (p: Vec, con: Construction, vals: Values, shift = false): { con: Construction; id: Id } => {
    const existing = hitTest(p, (o) => isPointDef(o.def) || o.def.t === 'image' && vals.get(o.id)?.k === 'point');
    if (existing) return { con, id: existing };
    const tol = TOL / cam.scale;
    const near = con.objects.filter((o) => {
      const v = vals.get(o.id);
      return v && !o.style.hidden && matches('curve', v, o.def) && distanceToDrawn(o, v, con, vals, view, p) < tol;
    });
    const id = nextId(con, 'p');
    const label = nextPointName(con);
    let def: GeoObject['def'];
    if (near.length >= 2) {
      // Snap to the nearest intersection of the two closest objects.
      const pts = intersect(vals.get(near[0].id)!, vals.get(near[1].id)!);
      const k = pts.length > 1 && dist(pts[1], p) < dist(pts[0], p) ? 1 : 0;
      def = pts.length ? { t: 'intersection', a: near[0].id, b: near[1].id, index: k as 0 | 1 } : { t: 'point', x: p.x, y: p.y };
    } else if (near.length === 1) {
      def = { t: 'pointOn', on: near[0].id, param: paramOn(vals.get(near[0].id)!, p) };
    } else {
      const q = snapFree(p, shift).p;
      def = { t: 'point', x: q.x, y: q.y };
    }
    return { con: { ...con, objects: [...con.objects, { id, def, style: { label } }] }, id };
  };

  /* -------------------------------- finishing -------------------------------- */

  /** Creates what a tool makes; returns a friendly error message, or null when done. */
  const finish = (
    con: Construction, toolDef: ToolDef, ids: Id[], answer?: string, at?: Vec, clickPts?: Vec[], freshIds?: Id[],
    extra: { reflex?: boolean; fromAsk?: boolean; halves?: boolean } = {},
  ): string | null => {
    if (toolDef.id === 'text') {
      if (!answer?.trim() || !at) return null;
      const id = nextId(con, 't');
      hist.commit({ ...con, objects: [...con.objects, { id, def: { t: 'text', x: at.x, y: at.y, text: answer.trim() }, style: {} }] });
      return null;
    }
    if (toolDef.id === 'delete') {
      hist.commit(deleteWithDependents(con, ids[0], dependencies));
      setSelected(null);
      return null;
    }
    let r: ReturnType<typeof createFromTool>;
    try {
      r = createFromTool(con, toolDef.id, ids, answer, { values: computeAll(con), clicks: clickPts, fresh: freshIds, reflex: extra.reflex, halves: extra.halves, compass: !!con.compass });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!extra.fromAsk) setToast(msg);
      return msg;
    }
    let next: Construction = { ...con, objects: [...con.objects, ...r.objects] };
    if (r.restyle) {
      next = { ...next, objects: next.objects.map((o) => {
        const rs = r.restyle!.find((x) => x.id === o.id);
        return rs ? { ...o, style: { ...o.style, ...rs.style } } : o;
      }) };
    }
    if (toolDef.id === 'function') next = { ...next, axes: true, grid: true };
    hist.commit(next);
    // A new angle mark is selected so its text (60°, α…) can be set straight away.
    if (toolDef.id === 'angle' || toolDef.id === 'angleLines') {
      const mark = r.objects.find((o) => o.def.t === 'angle' || o.def.t === 'angleLines');
      if (mark) setSelected(mark.id);
    }
    return null;
  };

  /** Polygons and broken lines end when the user says so (Done, double-click, Enter). */
  const canFinishOpen = () => (tool === 'polygon' && picks.length >= 3) || (tool === 'polyline' && picks.length >= 2);
  const finishOpen = () => {
    if (!canFinishOpen()) return;
    finish(c, activeTool, picks);
    resetPicks();
  };

  const chooseTool = (id: ToolId) => {
    setTool(id);
    resetPicks();
    setOpenGroup(null);
    setMessage(null);
    const def = toolById(id);
    // Tools that need no clicks (function graph, point by coordinates) ask straight away.
    if (!def.picks.length && def.ask) setAsk({ tool: def, picks: [], value: def.ask.initial });
  };

  /* --------------------------------- pointer --------------------------------- */

  const drag = useRef<{
    kind: 'pan' | 'point' | 'text' | 'end' | 'move' | 'label' | 'band' | 'instr' | 'instrRot';
    instr?: InstrumentKind;
    id?: Id;
    end?: 0 | 1;
    start: Vec;
    cam0: typeof cam;
    moved: boolean;
    /** move: start positions of the free points being translated */
    from?: Map<Id, Vec>;
    /** label: offset at the start, and the start in screen px */
    off0?: Vec;
    s0?: Vec;
    /** fraction: the part clicked, coloured / uncoloured if the pointer does not move */
    toggle?: { id: Id; part: number };
  } | null>(null);

  /** The ends of the selected line or ray, which can be dragged to shorten or lengthen it. */
  const lineEnds = useMemo(() => {
    const o = selected ? c.objects.find((x) => x.id === selected) : null;
    const v = o ? values.get(o.id) : null;
    if (!o || v?.k !== 'straight' || (v.kind !== 'line' && v.kind !== 'ray')) return null;
    const span = drawnSpan(o, v, c, values, view);
    return span ? { id: o.id, span, ray: v.kind === 'ray' } : null;
  }, [selected, c, values, view]);

  const local = (e: React.PointerEvent) => {
    const r = host.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (ask) return;
    if (openGroup) setOpenGroup(null);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { sx, sy } = local(e);
    const p = toWorld(sx, sy);
    setMessage(null);

    // Middle or right button, or Space held: move the view, whatever the tool.
    if (e.button === 1 || e.button === 2 || spaceDown.current) {
      drag.current = { kind: 'pan', start: { x: sx, y: sy }, cam0: cam, moved: false };
      return;
    }
    // The instruments lie on top of the figure, whatever the tool.
    const insEl = (e.target as Element).closest?.('[data-instr]');
    if (insEl) {
      const kind = insEl.getAttribute('data-instr') as InstrumentKind;
      const ins = instruments.find((x) => x.kind === kind)!;
      drag.current = { kind: insEl.hasAttribute('data-rot') ? 'instrRot' : 'instr', instr: kind, start: p, cam0: cam, moved: false, off0: { x: ins.x - p.x, y: ins.y - p.y } };
      return;
    }

    if (tool === 'move') {
      if (lineEnds) {
        const tol = TOL / cam.scale;
        const k = ([1, 0] as const).find((i) => !(lineEnds.ray && i === 0) && dist(lineEnds.span[i], p) < tol);
        if (k !== undefined) {
          drag.current = { kind: 'end', id: lineEnds.id, end: k, start: p, cam0: cam, moved: false };
          return;
        }
      }
      // A point label: drag it to a better place.
      const labelEl = (e.target as Element).closest?.('[data-label-for]');
      if (labelEl && !e.shiftKey) {
        const id = labelEl.getAttribute('data-label-for')!;
        selectOnly([id]);
        drag.current = {
          kind: 'label', id, start: p, cam0: cam, moved: false, s0: { x: sx, y: sy },
          off0: { x: parseFloat(labelEl.getAttribute('data-dx') ?? '0'), y: parseFloat(labelEl.getAttribute('data-dy') ?? '0') },
        };
        return;
      }
      // Several objects selected: grabbing anywhere inside their box moves them all.
      if (selBox && !e.shiftKey && p.x >= selBox.xmin && p.x <= selBox.xmax && p.y >= selBox.ymin && p.y <= selBox.ymax) {
        drag.current = { kind: 'move', start: p, cam0: cam, moved: false, from: positionsOf(c, freeAncestors(c, selIds)) };
        return;
      }
      const hit = hitTest(p, () => true);
      if (e.shiftKey) {
        if (hit) {
          // Shift+click adds to / removes from the selection.
          const has = selIds.includes(hit);
          selectOnly(has ? selIds.filter((x) => x !== hit) : [...selIds, hit]);
        } else drag.current = { kind: 'band', start: p, cam0: cam, moved: false };
        return;
      }
      if (!hit) {
        // empty space: drag a box to select (as in Word / PowerPoint)
        selectOnly([]);
        drag.current = { kind: 'band', start: p, cam0: cam, moved: false };
        return;
      }
      let o = c.objects.find((x) => x.id === hit)!;
      const group = selIds.length > 1 && selIds.includes(hit);
      if (!group && o.def.t === 'polygon') {
        const side = sideUnder(p, c, values);
        if (side) {
          if (side.con !== c) hist.commit(side.con);
          selectOnly([side.id]);
          // dragging a side moves the whole shape (its free points); press inside to do the same
          const free = freeAncestors(side.con, [hit]);
          drag.current = { kind: 'move', start: p, cam0: cam, moved: false, from: positionsOf(side.con, free) };
          return;
        }
        o = c.objects.find((x) => x.id === hit)!;
      }
      if (!group) selectOnly([hit]);
      if (group) {
        // Move the whole selection.
        const free = freeAncestors(c, selIds);
        drag.current = { kind: 'move', start: p, cam0: cam, moved: false, from: positionsOf(c, free) };
      } else if (o.def.t === 'point' || o.def.t === 'pointOn' || o.def.t === 'pointPolar') {
        drag.current = { kind: 'point', id: o.id, start: p, cam0: cam, moved: false };
      } else if (o.def.t === 'text') {
        drag.current = { kind: 'text', id: o.id, start: p, cam0: cam, moved: false };
      } else if (o.def.t !== 'angle' && o.def.t !== 'angleLines') {
        // A segment, line, polygon, circle…: move it by moving the free points it is built from.
        const free = freeAncestors(c, [hit]);
        const fv = values.get(hit);
        const part = fv?.k === 'fraction' ? fv.parts.findIndex((q) => insidePolygon(q, p)) : -1;
        drag.current = {
          kind: 'move', start: p, cam0: cam, moved: false, from: positionsOf(c, free),
          ...(part >= 0 ? { toggle: { id: hit, part } } : {}),
        };
      }
      return;
    }

    toolClick(p, e.shiftKey);
    // remembered so that a press-and-drag can place the next point where it is released
    press.current = { sx, sy };
  };

  const press = useRef<{ sx: number; sy: number } | null>(null);

  /** A click with a drawing tool (or the release of a press-and-drag) at world position p. */
  const toolClick = (p: Vec, shift: boolean) => {
    const def = activeTool;
    const need = def.id === 'polygon' || def.id === 'polyline' ? 'point' : def.picks[picks.length];
    if (!need) return;
    // One click where a child would point: inside an angle, on a segment, on a triangle.
    if (!picks.length && SMART_TOOLS.includes(def.id)) {
      // Only a click right on a point counts as picking it; a little off it is "inside the angle".
      let hitPoint: Id | null = null;
      for (const o of c.objects) {
        const v = values.get(o.id);
        if (v?.k === 'point' && !o.style.hidden && dist(v.p, p) < 7 / cam.scale) hitPoint = o.id;
      }
      const reach = 90 / cam.scale;
      if (def.id === 'angle' && !hitPoint) {
        const a = angleAtClick(c, values, p, reach);
        if (a) {
          finish(c, def, [a.a, a.b, a.c], undefined, undefined, undefined, undefined, { reflex: a.reflex });
          return;
        }
      } else {
        const sp = smartPicks(def.id, c, values, p, hitPoint, { tol: TOL / cam.scale, reach });
        if (sp && sp.length < def.picks.length) {
          // part of the picks found (a side as base): the next steps ask for the rest
          setPicks(sp);
          setClicks(sp.map(() => p));
          return;
        }
        if (sp) {
          if (def.ask) setAsk({ tool: def, picks: sp, clicks: sp.map(() => p), value: def.ask.initial });
          else finish(c, def, sp, undefined, undefined, undefined, undefined, { halves: def.id === 'midpoint' });
          return;
        }
      }
    }
    let con = c;
    let id: Id | null = null;
    if (need === 'point') {
      if (def.id === 'text') {
        setAsk({ tool: def, picks: [], at: p, value: '' });
        return;
      }
      // Closing a polygon by clicking its first vertex.
      if (def.id === 'polygon' && picks.length >= 3) {
        const first = hitTest(p, (o) => o.id === picks[0]);
        if (first) {
          finish(c, def, picks);
          resetPicks();
          return;
        }
      }
      const r = pickOrCreatePoint(p, con, values, shift);
      // Clicking the last point again (the second click of a double-click) ends a polygon / broken line.
      if (r.con === c && r.id === picks[picks.length - 1]) {
        finishOpen();
        return;
      }
      con = r.con;
      id = r.id;
      if (con !== c) {
        hist.commit(con);
        // made by this click in empty space (not on a line or at an intersection)
        if (con.objects[con.objects.length - 1]?.def.t === 'point') setFresh((f) => [...f, r.id]);
      }
    } else {
      id = hitTest(p, (o) => matches(need, values.get(o.id) ?? null, o.def));
      if (!id && ['straight', 'segment', 'segmentOrAngle', 'curve'].includes(need)) {
        // the side of a triangle / quadrilateral is a segment too
        const side = sideUnder(p, con, values);
        if (side) {
          con = side.con;
          id = side.id;
          if (con !== c) hist.commit(con);
        }
      }
      if (!id) {
        setToast(stepText(def.id, picks.length, lang));
        return;
      }
    }
    const nextPicks = [...picks, id];
    const nextClicks = [...clicks, p];
    const createdNow = con !== c && con.objects[con.objects.length - 1]?.def.t === 'point';
    const nextFresh = createdNow ? [...fresh, id] : fresh;
    if (def.id === 'polygon' || def.id === 'polyline' || nextPicks.length < def.picks.length) {
      setPicks(nextPicks);
      setClicks(nextClicks);
      return;
    }
    resetPicks();
    setSnapInfo(null);
    if (def.ask) setAsk({ tool: def, picks: nextPicks, clicks: nextClicks, fresh: nextFresh, value: def.ask.initial });
    else finish(con, def, nextPicks, undefined, undefined, nextClicks, nextFresh);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { sx, sy } = local(e);
    const p = toWorld(sx, sy);
    setMouse(p);
    const d = drag.current;
    if (d) {
      d.moved = true;
      if (d.kind === 'pan') {
        setCam({ ...d.cam0, cx: d.cam0.cx - (sx - d.start.x) / d.cam0.scale, cy: d.cam0.cy + (sy - d.start.y) / d.cam0.scale });
      } else if (d.kind === 'instr' && d.instr && d.off0) {
        setInstruments((xs) => xs.map((x) => (x.kind === d.instr ? { ...x, x: p.x + d.off0!.x, y: p.y + d.off0!.y } : x)));
      } else if (d.kind === 'instrRot' && d.instr) {
        setInstruments((xs) => xs.map((x) => {
          if (x.kind !== d.instr) return x;
          const h = handleLocal(x.kind);
          const deg = ((Math.atan2(p.y - x.y, p.x - x.x) - Math.atan2(h.y, h.x)) * 180) / Math.PI;
          return { ...x, rot: e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg) };
        }));
      } else if (d.kind === 'move' && d.from) {
        let delta = { x: p.x - d.start.x, y: p.y - d.start.y };
        if (c.grid) delta = { x: Math.round(delta.x * 2) / 2, y: Math.round(delta.y * 2) / 2 };
        else if (e.shiftKey) delta = Math.abs(delta.x) > Math.abs(delta.y) ? { x: delta.x, y: 0 } : { x: 0, y: delta.y };
        hist.replace((con) => {
          const next = translateFrom(con, d.from!, delta);
          return stabilizeIntersections(next, computeAll(next), values);
        });
      } else if (d.kind === 'label' && d.id && d.s0 && d.off0) {
        const dx = Math.round(d.off0.x + sx - d.s0.x);
        const dy = Math.round(d.off0.y + sy - d.s0.y);
        hist.replace((con) => ({ ...con, objects: con.objects.map((x) => (x.id === d.id ? { ...x, style: { ...x.style, labelDx: dx, labelDy: dy } } : x)) }));
      } else if (d.kind === 'band') {
        setBand({ a: d.start, b: p });
      } else if (d.kind === 'end' && d.id) {
        const o = c.objects.find((x) => x.id === d.id);
        const v = o ? values.get(o.id) : null;
        if (o && v?.k === 'straight') {
          const cur = o.style.extent;
          const [t0, t1] = Array.isArray(cur) ? cur : cur === 'full' ? autoSpan(o, v, c, values) : autoSpan(o, v, c, values);
          const t = (p.x - v.a.x) * v.d.x + (p.y - v.a.y) * v.d.y;
          const tt = Math.round(t * 100) / 100;
          const ext: [number, number] = d.end === 1 ? [t0, Math.max(t0 + 0.3, tt)] : [Math.min(t1 - 0.3, tt), t1];
          hist.replace((con) => ({ ...con, objects: con.objects.map((x) => (x.id === d.id ? { ...x, style: { ...x.style, extent: ext } } : x)) }));
        }
      } else if (d.id) {
        const sn = snapFree(p, false, d.id);
        setSnapInfo(sn.guides.length ? { guides: sn.guides, sx, sy } : null);
        hist.replace((con) => {
          const next = {
          ...con,
          objects: con.objects.map((o) => {
            if (o.id !== d.id) return o;
            if (o.def.t === 'point') return { ...o, def: { ...o.def, x: sn.p.x, y: sn.p.y } };
            if (o.def.t === 'pointPolar') {
              const centre = values.get(o.def.center);
              if (centre?.k !== 'point') return o;
              const deg = (Math.atan2(p.y - centre.p.y, p.x - centre.p.x) * 180) / Math.PI;
              return { ...o, def: { ...o.def, deg: e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg * 100) / 100 } };
            }
            if (o.def.t === 'text') return { ...o, def: { ...o.def, x: p.x, y: p.y } };
            if (o.def.t === 'pointOn') {
              const host2 = values.get(o.def.on);
              return host2 ? { ...o, def: { ...o.def, param: paramOn(host2, p) } } : o;
            }
            return o;
          }),
          };
          return stabilizeIntersections(next, computeAll(next), values);
        });
      }
      return;
    }
    const need = tool === 'move' ? null : activeTool.id === 'polygon' ? 'point' : activeTool.picks[picks.length];
    const hov = hitTest(p, (o) => (tool === 'move' || tool === 'delete' ? true : need ? matches(need, values.get(o.id) ?? null, o.def) : false));
    setHovered(hov);
    // While a point is about to be placed in free space, show where it will snap to.
    if (need === 'point' && !hov) {
      const sn = snapFree(p, e.shiftKey);
      setMouse(sn.p);
      setSnapInfo(sn.guides.length || sn.measure ? { guides: sn.guides, measure: sn.measure, sx, sy } : null);
    } else setSnapInfo(null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    // Press-and-drag with a drawing tool: the release places the next point.
    const pr = press.current;
    press.current = null;
    if (pr && tool !== 'move' && !ask && picks.length) {
      const { sx, sy } = local(e);
      const need = activeTool.id === 'polygon' || activeTool.id === 'polyline' ? 'point' : activeTool.picks[picks.length];
      if (need === 'point' && Math.hypot(sx - pr.sx, sy - pr.sy) > 10) toolClick(toWorld(sx, sy), e.shiftKey);
    }
    const d = drag.current;
    drag.current = null;
    setSnapInfo(null);
    if (d?.kind === 'instr' || d?.kind === 'instrRot') {
      setInstruments((xs) => xs.map((x) => (x.kind === d.instr ? snapInstrument(x, c, values, 12 / cam.scale) : x)));
      return;
    }
    if (d?.kind === 'band') {
      if (band && d.moved && Math.abs(band.a.x - band.b.x) * cam.scale > 4) selectOnly(objectsInRect(c, values, band.a, band.b));
      setBand(null);
      return;
    }
    // A click (no drag) on a part of a split shape colours it or clears it.
    if (d?.toggle && !d.moved) {
      const tg = d.toggle;
      hist.commit((con) => ({
        ...con,
        objects: con.objects.map((o) => {
          if (o.id !== tg.id || o.def.t !== 'fraction') return o;
          const has = o.def.filled.includes(tg.part);
          return { ...o, def: { ...o.def, filled: has ? o.def.filled.filter((i) => i !== tg.part) : [...o.def.filled, tg.part].sort((x, y) => x - y) } };
        }),
      }));
      return;
    }
    // Record a finished drag as one undo step.
    if (d && d.moved && d.kind !== 'pan') hist.commit((x) => x);
    else if (d && d.kind === 'pan' && !d.moved) selectOnly([]);
  };

  const onWheel = (e: React.WheelEvent) => {
    // like a Word document: the wheel scrolls (Shift: sideways), Ctrl+wheel or a pinch zooms
    if (!e.ctrlKey) {
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? 0 : e.deltaY;
      setCam((cm) => ({ ...cm, cx: cm.cx + dx / cm.scale, cy: cm.cy - dy / cm.scale }));
      return;
    }
    e.preventDefault?.();
    const { left, top } = host.current!.getBoundingClientRect();
    const p = toWorld(e.clientX - left, e.clientY - top);
    const k = Math.exp(-e.deltaY * 0.0015);
    setCam((cm) => {
      const scale = Math.min(400, Math.max(8, cm.scale * k));
      return { scale, cx: p.x - (p.x - cm.cx) * (cm.scale / scale), cy: p.y - (p.y - cm.cy) * (cm.scale / scale) };
    });
  };

  // Opening an existing figure: frame it once the canvas size is known.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || size.w < 50 || !init.construction?.objects.length) return;
    fitted.current = true;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  // after a template or a typed exercise is put in, frame the whole figure
  useEffect(() => {
    if (!fitSoon) return;
    setFitSoon(false);
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSoon, c]);

  /** Puts a template / text figure in the middle of the view, keeping its names when free. */
  const insertFigure = (tc: Construction, todo?: string[]) => {
    const b = drawingBounds(tc, computeAll(tc));
    const centre = b ? { x: (b.xmin + b.xmax) / 2, y: (b.ymin + b.ymax) / 2 } : { x: 0, y: 0 };
    // a new figure goes in the middle; next to what is already drawn otherwise
    const there = c.objects.some((o) => !o.style.hidden) ? drawingBounds(c, values) : null;
    const offset = there && b
      ? { x: there.xmax + 1.5 - b.xmin, y: (there.ymin + there.ymax) / 2 - centre.y }
      : { x: -centre.x, y: -centre.y };
    const r = pasteObjects(c, tc.objects, { x: Math.round(offset.x * 2) / 2, y: Math.round(offset.y * 2) / 2 }, true);
    const left = [...(c.todo ?? []), ...(todo ?? [])];
    hist.commit({ ...r.c, axes: c.axes || tc.axes, grid: c.grid || tc.grid, todo: left.length ? left : undefined });
    setLibraryOpen(false);
    setTool('move');
    selectOnly([]);
    setFitSoon(true);
  };

  const fit = () => {
    const pts: Vec[] = [];
    for (const o of c.objects) {
      const v = values.get(o.id);
      if (v?.k === 'point') pts.push(v.p);
      if (v?.k === 'circle') pts.push({ x: v.c.x - v.r, y: v.c.y - v.r }, { x: v.c.x + v.r, y: v.c.y + v.r });
    }
    if (!pts.length) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const w = Math.max(2, Math.max(...xs) - Math.min(...xs));
    const h = Math.max(2, Math.max(...ys) - Math.min(...ys));
    const scale = Math.min(200, Math.max(10, Math.min(size.w / (w * 1.3), size.h / (h * 1.3))));
    setCam({ cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, scale });
  };

  /* --------------------------------- preview --------------------------------- */

  const preview = useMemo(() => {
    if (!mouse || tool === 'move' || !picks.length) return null;
    const def = activeTool;
    const ghostId = '__mouse';
    const con: Construction = { ...c, objects: [...c.objects, { id: ghostId, def: { t: 'point', x: mouse.x, y: mouse.y }, style: { hidden: true } }] };
    let objs: GeoObject[] = [];
    if (def.id === 'polygon') objs = [{ id: '__poly', def: { t: 'polygon', pts: [...picks, ghostId] }, style: {} }];
    else if (picks.length + 1 === def.picks.length && def.picks[picks.length] === 'point' && !def.ask) {
      objs = createFromTool(con, def.id, [...picks, ghostId]).objects;
    } else if (['segment', 'line', 'ray', 'vector', 'circle'].includes(def.id) && picks.length === 1) {
      objs = createFromTool(con, def.id, [picks[0], ghostId]).objects;
    }
    if (!objs.length) return null;
    const all: Construction = { ...con, objects: [...con.objects, ...objs] };
    return { objs, values: computeAll(all) };
  }, [mouse, tool, picks, c, activeTool]);

  /** Box around several selected objects (grab inside it to move them all). */
  const selBox = useMemo(() => {
    if (selIds.length < 2) return null;
    const b = drawingBounds({ ...c, objects: c.objects.filter((o) => selIds.includes(o.id)) }, values);
    if (!b) return null;
    const pad = 10 / cam.scale;
    return { xmin: b.xmin - pad, xmax: b.xmax + pad, ymin: b.ymin - pad, ymax: b.ymax + pad };
  }, [selIds, c, values, cam.scale]);

  /** Turns, mirrors or resizes the whole selection about the centre of its box. */
  const transformSelection = (tr: GroupTransform) => {
    if (!selBox) return;
    const centre = { x: (selBox.xmin + selBox.xmax) / 2, y: (selBox.ymin + selBox.ymax) / 2 };
    hist.commit((con) => transformObjects(con, selIds, tr, centre));
  };

  /** What the current step can use, shown with a soft glow. */
  const candidates = useMemo(() => {
    if (tool === 'move' || ask) return undefined;
    const def = activeTool;
    const need = def.id === 'polygon' || def.id === 'polyline' ? 'point' : def.picks[picks.length];
    if (!need) return undefined;
    const smart = !picks.length && SMART_TOOLS.includes(def.id);
    const triTool = ['altitude', 'median', 'bisectorIn', 'midline', 'centroid', 'orthocenter', 'circumcircle', 'incircle'].includes(def.id);
    const out = new Set<Id>();
    for (const o of c.objects) {
      const v = values.get(o.id);
      if (!v || o.style.hidden || picks.includes(o.id)) continue;
      if (matches(need, v, o.def)) out.add(o.id);
      if (smart && triTool && o.def.t === 'polygon' && o.def.pts.length === 3) out.add(o.id);
      if (smart && (def.id === 'midpoint' || def.id === 'perpBisector') && (o.def.t === 'segment' || o.def.t === 'polygon')) out.add(o.id);
    }
    return out;
  }, [tool, ask, activeTool, picks, c, values]);

  const svg = useMemo(
    () => {
      const base = renderConstruction(c, values, {
        candidates,
        mode: 'edit',
        view,
        scale: cam.scale,
        selected: new Set([...selIds, ...picks]),
        hovered,
        preview: preview?.objs,
        previewValues: preview?.values,
      }).svg;
      const X = (v: Vec) => ((v.x - view.xmin) * cam.scale).toFixed(1);
      const Y = (v: Vec) => ((view.ymax - v.y) * cam.scale).toFixed(1);
      let extra = '';
      if (snapInfo?.guides.length) {
        const lines = snapInfo.guides.map((g) => `M${X(g.a)} ${Y(g.a)}L${X(g.b)} ${Y(g.b)}`).join('');
        extra += `<path d="${lines}" stroke="#1a73e8" stroke-width="1" stroke-dasharray="4 3" fill="none"/>`;
      }
      if (instruments.length) extra += instrumentsSvg(instruments, (q) => +X(q), (q) => +Y(q), cam.scale);
      if (selBox && tool === 'move') {
        const x0 = +X({ x: selBox.xmin, y: 0 });
        const y0 = +Y({ x: 0, y: selBox.ymax });
        extra += `<rect class="geo-selbox" x="${x0}" y="${y0}" width="${((selBox.xmax - selBox.xmin) * cam.scale).toFixed(1)}" height="${((selBox.ymax - selBox.ymin) * cam.scale).toFixed(1)}" rx="6" fill="#1a73e8" fill-opacity="0.04" stroke="#1a73e8" stroke-width="1.2" stroke-dasharray="6 4"/>`;
      }
      if (band) {
        const x0 = Math.min(+X(band.a), +X(band.b));
        const y0 = Math.min(+Y(band.a), +Y(band.b));
        extra += `<rect x="${x0}" y="${y0}" width="${Math.abs(+X(band.a) - +X(band.b))}" height="${Math.abs(+Y(band.a) - +Y(band.b))}" fill="#1a73e8" fill-opacity="0.08" stroke="#1a73e8" stroke-dasharray="4 3"/>`;
      }
      if (lineEnds && tool === 'move' && multi.length === 0) {
        for (const i of [0, 1] as const) {
          if (lineEnds.ray && i === 0) continue;
          const q = lineEnds.span[i];
          extra += `<rect x="${(+X(q) - 4.5).toFixed(1)}" y="${(+Y(q) - 4.5).toFixed(1)}" width="9" height="9" rx="2" fill="#ffffff" stroke="#1a73e8" stroke-width="1.6"/>`;
        }
      }
      return extra ? base.replace('</svg>', `${extra}</svg>`) : base;
    },
    [c, values, view, cam.scale, selIds, picks, hovered, preview, snapInfo, lineEnds, tool, band, multi, candidates, instruments, selBox],
  );

  /* --------------------------------- actions --------------------------------- */

  const submit = useCallback(() => {
    const con = hist.snapshot();
    if (!con.objects.some((o) => !o.style.hidden)) {
      setMessage(t('empty'));
      return;
    }
    const out: Construction = { ...con, view: { xmin: view.xmin, xmax: view.xmax, ymin: view.ymin, ymax: view.ymax } };
    clearDraft(DRAFT_KEY);
    if (send) send({ type: 'insertGeometry', construction: out });
    else setMessage(`(${lang === 'vi' ? 'chế độ thử' : 'preview'}) ${out.objects.length} objects`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist, view, send, lang]);

  const restyle = (patch: Partial<Style>) => {
    if (!selected) return;
    hist.commit((con) => ({ ...con, objects: con.objects.map((o) => (o.id === selected ? { ...o, style: { ...o.style, ...patch } } : o)) }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (e.key === 'Enter' && !typing && !ask && canFinishOpen()) {
        e.preventDefault();
        finishOpen();
      } else if (e.key === 'Escape' && !ask) {
        if (picks.length) resetPicks();
        else if (tool !== 'move') setTool('move');
        else cancel();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selIds.length && !typing) {
        hist.commit(selIds.reduce((con, id) => deleteWithDependents(con, id, dependencies), hist.snapshot()));
        selectOnly([]);
      } else if (e.key.startsWith('Arrow') && selIds.length && !typing) {
        // Nudge the selection: 0.1 cm, or 1 cm with Shift.
        e.preventDefault();
        const k = e.shiftKey ? 1 : 0.1;
        const delta = { x: e.key === 'ArrowLeft' ? -k : e.key === 'ArrowRight' ? k : 0, y: e.key === 'ArrowDown' ? -k : e.key === 'ArrowUp' ? k : 0 };
        hist.commit((con) => moveObjects(con, selIds, delta));
      } else if (e.ctrlKey && e.key.toLowerCase() === 'a' && !typing) {
        e.preventDefault();
        setTool('move');
        selectOnly(hist.snapshot().objects.filter((o) => !o.style.hidden).map((o) => o.id));
      } else if (e.ctrlKey && e.key.toLowerCase() === 'c' && !typing && selIds.length) {
        clipboard.current = copyClosure(hist.snapshot(), selIds);
      } else if (e.ctrlKey && (e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'd') && !typing) {
        e.preventDefault();
        const clip = e.key.toLowerCase() === 'd' ? (selIds.length ? copyClosure(hist.snapshot(), selIds) : null) : clipboard.current;
        if (clip?.length) {
          const r = pasteObjects(hist.snapshot(), clip, { x: 1, y: -1 });
          hist.commit(r.c);
          setTool('move');
          selectOnly(r.ids);
        }
      } else if (!e.ctrlKey && !e.altKey && !e.metaKey && !typing && !ask && e.key.length === 1) {
        const id = (Object.keys(TOOL_KEYS) as ToolId[]).find((k) => TOOL_KEYS[k] === e.key.toUpperCase());
        if (id) chooseTool(id);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        hist.undo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        hist.redo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, picks, tool, selected, selIds, hist, submit, send]);

  /* ---------------------------- rename in place ---------------------------- */

  const [rename, setRename] = useState<{ id: Id; sx: number; sy: number; value: string } | null>(null);
  const commitRename = () => {
    const r = rename;
    setRename(null);
    if (!r) return;
    hist.commit((con) => ({
      ...con,
      objects: con.objects.map((o) => {
        if (o.id !== r.id) return o;
        if (o.def.t === 'text') return r.value.trim() ? { ...o, def: { ...o.def, text: r.value } } : o;
        const label = r.value.trim() || undefined;
        return { ...o, style: { ...o.style, label, ...(label && !isPointDef(o.def) ? { showLabel: true } : {}) } };
      }),
    }));
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== 'move') return; // with drawing tools the second click ends polygons
    const r = host.current!.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const labelEl = (e.target as Element).closest?.('[data-label-for]');
    const id = labelEl?.getAttribute('data-label-for') ?? hitTest(toWorld(sx, sy), () => true);
    const o = id ? c.objects.find((x) => x.id === id) : null;
    if (!o) return;
    setRename({ id: o.id, sx, sy, value: o.def.t === 'text' ? o.def.text : o.style.label ?? '' });
  };

  const sel = selected ? c.objects.find((o) => o.id === selected) ?? null : null;
  const selValue = sel ? values.get(sel.id) ?? null : null;
  const hint = message ?? (tool === 'move' && selIds.length > 1 ? t('selectedN').replace('{n}', String(selIds.length)) : tool === 'move' ? (lang === 'vi' ? activeTool.hintVi : activeTool.hintEn) : `${activeTool[lang]}: ${lang === 'vi' ? activeTool.hintVi : activeTool.hintEn}`);

  const updateSettings = (patch: Partial<ReturnType<typeof loadSettings>>) => saveSettings({ ...loadSettings(), ...patch });

  /* -------------------------- floating mini toolbar -------------------------- */

  const mini = (() => {
    if (tool !== 'move' || !sel || multi.length || rename || !selValue) return null;
    const X = (q: Vec) => (q.x - view.xmin) * cam.scale;
    const Y = (q: Vec) => (view.ymax - q.y) * cam.scale;
    let top: Vec | null = null;
    const v = selValue;
    if (v.k === 'point' || v.k === 'text') top = v.p;
    else if (v.k === 'angle') top = v.v;
    else if (v.k === 'circle' || v.k === 'arc') top = { x: v.c.x, y: v.c.y + v.r };
    else if (v.k === 'polygon') top = v.pts.reduce((m, q) => (q.y > m.y ? q : m));
    else if (v.k === 'fraction') top = v.parts.flat().reduce((m, q) => (q.y > m.y ? q : m));
    else if (v.k === 'straight') {
      const sp = drawnSpan(sel, v, c, values, view);
      if (sp) top = sp[0].y > sp[1].y ? sp[0] : sp[1];
    }
    if (!top) return null;
    const x = Math.max(8, Math.min(size.w - 360, X(top) - 150));
    const y = Y(top) - 70 < 8 ? Y(top) + 24 : Y(top) - 70;
    const segLike = v.k === 'straight' && (v.kind === 'segment' || v.kind === 'vector');
    const s = sel.style;
    const actions: MiniAction[] = [];
    if (v.k === 'straight' || v.k === 'circle' || v.k === 'arc' || v.k === 'polygon') {
      actions.push({ key: 'dash', label: t('dashShort'), icon: <span className="geo-mini-ico">┄</span>, on: s.dash === 'dashed', run: () => restyle({ dash: s.dash === 'dashed' ? 'solid' : 'dashed' }) });
    }
    if (segLike || v.k === 'angle' || v.k === 'polygon' || v.k === 'circle' || v.k === 'fraction') {
      actions.push({ key: 'val', label: t('measureShort'), icon: <span className="geo-mini-ico">123</span>, on: !!s.showValue, run: () => restyle({ showValue: !s.showValue }) });
    }
    if (segLike || v.k === 'angle') {
      actions.push({
        key: 'eq', label: t('equalShort'), icon: <span className="geo-mini-ico">⫽</span>,
        run: () => {
          const r = createFromTool(c, 'equalMark', [sel.id]).restyle?.[0];
          if (r) restyle(r.style);
        },
      });
    }
    actions.push({ key: 'ans', label: t('answerShort'), icon: <span className="geo-mini-ico">✓</span>, on: !!s.answer, run: () => restyle({ answer: !s.answer || undefined }) });
    actions.push({ key: 'ren', label: t('rename'), icon: <span className="geo-mini-ico">Aa</span>, run: () => setRename({ id: sel.id, sx: X(top!), sy: Y(top!), value: sel.def.t === 'text' ? sel.def.text : s.label ?? '' }) });
    actions.push({
      key: 'del', label: t('del'), icon: <span className="geo-mini-ico">✕</span>, danger: true,
      run: () => {
        hist.commit(deleteWithDependents(c, sel.id, dependencies));
        setSelected(null);
      },
    });
    return { x, y, actions };
  })();

  const groupBar = (() => {
    if (tool !== 'move' || !selBox || rename) return null;
    const X = (q: Vec) => (q.x - view.xmin) * cam.scale;
    const Y = (q: Vec) => (view.ymax - q.y) * cam.scale;
    const top = Y({ x: 0, y: selBox.ymax });
    const x = Math.max(8, Math.min(size.w - 640, X({ x: selBox.xmin, y: 0 })));
    const y = top - 70 < 8 ? Y({ x: 0, y: selBox.ymin }) + 10 : top - 70;
    const ico = (g: string) => <span className="geo-mini-ico">{g}</span>;
    const actions: MiniAction[] = [
      { key: 'l', label: t('turnLeft'), icon: ico('↺'), run: () => transformSelection({ rotate: 15 }) },
      { key: 'r', label: t('turnRight'), icon: ico('↻'), run: () => transformSelection({ rotate: -15 }) },
      { key: 'h', label: t('flipH'), icon: ico('⇋'), run: () => transformSelection({ flip: 'h' }) },
      { key: 'v', label: t('flipV'), icon: ico('⇵'), run: () => transformSelection({ flip: 'v' }) },
      { key: 'b', label: t('bigger'), icon: ico('＋'), run: () => transformSelection({ scale: 1.25 }) },
      { key: 's', label: t('smaller'), icon: ico('－'), run: () => transformSelection({ scale: 0.8 }) },
      {
        key: 'd', label: t('duplicate'), icon: ico('⧉'),
        run: () => {
          const r = pasteObjects(c, copyClosure(c, selIds), { x: 1, y: -1 });
          hist.commit(r.c);
          selectOnly(r.ids);
        },
      },
      { key: 'x', label: t('unselect'), icon: ico('⨯'), run: () => selectOnly([]) },
      {
        key: 'del', label: t('del'), icon: ico('✕'), danger: true,
        run: () => {
          hist.commit(selIds.reduce((con, id) => deleteWithDependents(con, id, dependencies), c));
          selectOnly([]);
        },
      },
    ];
    return { x, y, actions };
  })();
  const restyleAll = (patch: Partial<Style>) =>
    hist.commit((con) => ({ ...con, objects: con.objects.map((o) => (selIds.includes(o.id) ? { ...o, style: { ...o.style, ...patch } } : o)) }));

  const family = tool !== 'move' ? familyOf(tool) : null;
  const familyTools = family ? family.members.filter((m) => !allowed || allowed.has(m)).map(toolById) : [];
  const openTool = tool === 'polygon' || tool === 'polyline';
  const stepNow = openTool ? Math.min(picks.length, stepCount(tool) - 1) : picks.length;

  /* ---------------------------------- render ---------------------------------- */

  return (
    <div className={`geo-app ${simple ? 'geo-simple' : ''}`}>
      <header className="geo-top">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 32 32" width="26" height="26">
              <rect width="32" height="32" rx="9" fill="#1e8449" />
              <path d="M7 24L16 7l9 17z" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
              <circle cx="16" cy="7" r="2.2" fill="#fff" />
            </svg>
          </span>
          <h1>{t(init.mode === 'edit' ? 'titleEdit' : 'title')}</h1>
        </div>
        <div className="geo-top-actions">
          <button className="btn btn-tonal geo-lib-btn" onClick={() => setLibraryOpen(true)}>{t('library')}</button>
          <button className="btn btn-tonal geo-lib-btn" onClick={() => setOcr({ image: null })} title={t('fromPictureTip')}>{t('fromPicture')}</button>
          <label className="geo-check geo-select geo-grade">
            {t('grade')}
            <select
              value={String(grade)}
              onChange={(e) => {
                const g = (e.target.value === 'all' ? 'all' : Number(e.target.value)) as Grade;
                setGrade(g);
                updateSettings({ geoGrade: g, simple: isPrimary(g) });
                const set = toolsForGrade(g);
                if (set && !set.has(tool)) chooseTool('move');
                // a new, empty figure for young children starts on squared paper
                if (isPrimary(g) && !c.objects.length && !c.grid) hist.commit((x) => ({ ...x, grid: true }));
              }}
            >
              {GRADES.map((g) => (
                <option key={String(g)} value={String(g)}>{g === 'all' ? t('allGrades') : `${t('gradeN')} ${g}${g === 10 ? '–12' : ''}`}</option>
              ))}
            </select>
          </label>
          {c.objects.some((o) => o.style.answer) && (
            <div className="segmented" title={t('versionTip')}>
              {(['hide', 'show'] as const).map((m) => (
                <button key={m} className={(c.answers ?? 'show') === m ? 'seg-on' : ''} onClick={() => hist.commit((x) => ({ ...x, answers: m }))}>
                  {t(m === 'hide' ? 'question' : 'withAnswer')}
                </button>
              ))}
            </div>
          )}
          <div className="segmented">
            {(['vn', 'intl'] as const).map((p) => (
              <button key={p} className={c.preset === p ? 'seg-on' : ''} onClick={() => hist.commit((x) => ({ ...x, preset: p }))}>
                {t(p)}
              </button>
            ))}
          </div>
          <label className="geo-check geo-select">
            {t('angleFormat')}
            <select value={c.angleFormat ?? 'int'} onChange={(e) => hist.commit((x) => ({ ...x, angleFormat: e.target.value as Construction['angleFormat'] }))}>
              <option value="int">60°</option>
              <option value="dms">46°51′</option>
              <option value="decimal">{lang === 'vi' ? '46,9°' : '46.9°'}</option>
            </select>
          </label>
          {!primary && (
            <label className="geo-check" title={t('compassTip')}>
              <input type="checkbox" checked={!!c.compass} onChange={(e) => hist.commit((x) => ({ ...x, compass: e.target.checked || undefined }))} />
              {t('compass')}
            </label>
          )}
          <label className="geo-check">
            <input type="checkbox" checked={c.grid} onChange={(e) => hist.commit((x) => ({ ...x, grid: e.target.checked }))} />
            {t('grid')}
          </label>
          <label className="geo-check">
            <input type="checkbox" checked={c.axes} onChange={(e) => hist.commit((x) => ({ ...x, axes: e.target.checked }))} />
            {t('axes')}
          </label>
          <button className="lang-btn" onClick={() => { const l = lang === 'vi' ? 'en' : 'vi'; setLang(l); updateSettings({ lang: l }); }}>
            {lang.toUpperCase()}
          </button>
        </div>
      </header>
      {draft && (
        <DraftBanner
          lang={lang}
          at={draft.at}
          what={['hình vẽ dở', 'an unfinished figure']}
          onRestore={() => {
            hist.commit(draft.value);
            startC.current = draft.value;
            dropDraft();
            setFitSoon(true);
          }}
          onDismiss={() => {
            clearDraft(DRAFT_KEY);
            dropDraft();
          }}
        />
      )}

      <div className="geo-body">
        <nav className="geo-tools" aria-label="Tools">
          {simple
            ? railTools.map((x) => {
                const fam = familyOf(x.id);
                const on = tool === x.id || (!!fam && fam.members.includes(tool));
                return (
                  <button key={x.id} className={`geo-tool big ${on ? 'on' : ''}`} title={TOOL_KEYS[x.id] ? `${x[lang]} (${TOOL_KEYS[x.id]})` : x[lang]} onClick={() => chooseTool(x.id)}>
                    <ToolIcon id={on && fam ? tool : x.id} size={26} />
                    <span>{fam ? fam[lang] : x[lang]}</span>
                  </button>
                );
              })
            : TOOL_GROUPS.map((g0) => ({ ...g0, tools: g0.tools.filter((x) => !allowed || allowed.has(x.id)) })).filter((g) => g.tools.length).map((g) => {
                const remembered = groupTool[g.id];
                const current = toolById(remembered && g.tools.some((x) => x.id === remembered) ? remembered : g.tools[0].id);
                const active = g.tools.some((x) => x.id === tool);
                return (
                  <div key={g.id} className="geo-group">
                    <button
                      className={`geo-tool ${active ? 'on' : ''}`}
                      title={`${g[lang]} — ${current[lang]}`}
                      onClick={(e) => {
                        if (openGroup === g.id) return setOpenGroup(null);
                        if (g.tools.length === 1) return chooseTool(current.id);
                        const r = e.currentTarget.getBoundingClientRect();
                        const top = Math.max(8, Math.min(r.top, window.innerHeight - 260));
                        setPopAt({ left: r.right + 8, top, maxH: window.innerHeight - top - 12 });
                        setOpenGroup(g.id);
                      }}
                    >
                      <ToolIcon id={active ? tool : current.id} />
                      {g.tools.length > 1 && <span className="geo-more" aria-hidden />}
                    </button>
                    {openGroup === g.id && (
                      <div className="geo-pop" role="menu" style={{ position: 'fixed', left: popAt.left, top: popAt.top, maxHeight: popAt.maxH }}>
                        <div className="geo-pop-title">{g[lang]}</div>
                        {g.tools.map((x) => (
                          <button
                            key={x.id}
                            className={`geo-pop-item ${tool === x.id ? 'on' : ''}`}
                            onClick={() => {
                              setGroupTool((s) => ({ ...s, [g.id]: x.id }));
                              chooseTool(x.id);
                            }}
                          >
                            <ToolIcon id={x.id} size={22} />
                            {x[lang]}
                            {TOOL_KEYS[x.id] && <kbd className="geo-key">{TOOL_KEYS[x.id]}</kbd>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
        </nav>

        <div className="geo-stage">
        <main
            className={`geo-canvas tool-${tool}`}
            ref={host}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setMouse(null)}
            onWheel={onWheel}
            onDoubleClick={onDoubleClick}
            onContextMenu={(e) => e.preventDefault()}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div className="geo-overlay-top">
            {tool !== 'move' && !ask && (
              <StepBar
                lang={lang}
                tool={activeTool}
                step={stepNow}
                total={stepCount(tool)}
                text={stepText(tool, stepNow, lang)}
                done={canFinishOpen()}
                onDone={finishOpen}
                onCancel={resetPicks}
              />
            )}
            {family && familyTools.length > 1 && <VariantBar family={family} tools={familyTools} active={tool} lang={lang} onPick={chooseTool} />}
            {toast && (
              <div className="geo-toast" role="alert" onClick={() => setToast(null)}>
                <span aria-hidden>💡</span>
                {toast}
              </div>
            )}
          </div>
          {groupBar && (
            <MiniToolbar x={groupBar.x} y={groupBar.y} colors={COLORS.slice(0, 5)} onColor={(col) => restyleAll({ color: col })} actions={groupBar.actions} />
          )}
          {mini && (
            <MiniToolbar x={mini.x} y={mini.y} colors={COLORS.slice(0, 5)} color={sel?.style.color} onColor={(col) => restyle({ color: col })} actions={mini.actions} />
          )}
          {rename && (
            <input
              className="geo-rename"
              autoFocus
              style={{ left: Math.max(4, rename.sx - 50), top: Math.max(4, rename.sy - 44) }}
              value={rename.value}
              placeholder="A, A_1, d…"
              onChange={(e) => setRename({ ...rename, value: e.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRename(null);
              }}
              onBlur={commitRename}
            />
          )}
        </div>

        {snapInfo?.measure && host.current && (
          <div
            className="geo-measure"
            style={{
              left: host.current.getBoundingClientRect().left + snapInfo.sx + 14,
              top: host.current.getBoundingClientRect().top + snapInfo.sy + 14,
            }}
          >
            {snapInfo.measure.length.toFixed(2).replace('.', lang === 'vi' ? ',' : '.')} cm · {Math.round(snapInfo.measure.deg)}°
          </div>
        )}

        <aside className="geo-side">
          <section className="geo-card">
            <h2>{t('props')}</h2>
            {sel ? (
              <PropsPanel
                areaInfo={
                  selValue?.k === 'polygon' && selValue.pts.length >= 3
                    ? `${t('area')}: ${formatMeasure(polygonArea(selValue.pts), 2, c.preset)} cm² · ${t('perimeter')}: ${formatMeasure(polygonPerimeter(selValue.pts), 2, c.preset)} cm${rectangleWorking(selValue.pts, c.preset, lang)}`
                    : selValue?.k === 'circle'
                      ? `${t('area')}: ${formatMeasure(Math.PI * selValue.r ** 2, 2, c.preset)} cm² · ${t('perimeter')}: ${formatMeasure(2 * Math.PI * selValue.r, 2, c.preset)} cm`
                      : ''
                }
                measured={selValue?.k === 'angle' ? formatAngle(selValue.deg, 'int', c.preset) : ''} o={sel} onDef={(def) => hist.commit((x) => ({ ...x, objects: x.objects.map((y) => (y.id === sel.id ? { ...y, def } : y)) }))} isPoint={selValue?.k === 'point'} kind={selValue?.k ?? null} straightKind={selValue?.k === 'straight' ? selValue.kind : null} t={t} onChange={restyle}
                onDelete={() => { hist.commit(deleteWithDependents(c, sel.id, dependencies)); setSelected(null); }} />
            ) : (
              <p className="geo-muted">{t('noSelection')}</p>
            )}
          </section>
          {c.todo && c.todo.length > 0 && (
            <section className="geo-card geo-todo">
              <h2 title={t('todoTip')}>{t('todo')} ({c.todo.length})</h2>
              <ul>
                {c.todo.map((item, i) => {
                  const tl = toolForTodo(item);
                  return (
                    <li key={`${i}-${item}`}>
                      <label className="geo-check">
                        <input type="checkbox" onChange={() => hist.commit((x) => ({ ...x, todo: (x.todo ?? []).filter((_, j) => j !== i) }))} />
                        <span>{item}</span>
                      </label>
                      <button className="geo-chip" onClick={() => chooseTool(tl)}>
                        <ToolIcon id={tl} size={16} /> {toolById(tl)[lang]}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <section className="geo-card geo-list">
            <h2>{t('objects')}</h2>
            {(() => {
              // Helper objects behind templates (and objects the user hid) go in a collapsed list.
              const item = (o: GeoObject) => (
                <li key={o.id} className={selected === o.id ? 'on' : ''} onClick={() => setSelected(o.id)}>
                  <span className={`geo-kind k-${values.get(o.id)?.k ?? 'none'}`} />
                  <span className="geo-name">{describe(o, c, lang)}</span>
                  {!values.get(o.id) && <span className="geo-undef">∅</span>}
                </li>
              );
              const all = c.objects.filter((o) => o.id !== '__mouse');
              const hiddenObjs = all.filter((o) => o.style.hidden);
              return (
                <>
                  <ul>{all.filter((o) => !o.style.hidden).map(item)}</ul>
                  {hiddenObjs.length > 0 && (
                    <details className="geo-hidden">
                      <summary>{t('hiddenObjects')} ({hiddenObjs.length})</summary>
                      <ul>{hiddenObjs.map(item)}</ul>
                    </details>
                  )}
                </>
              );
            })()}
          </section>
        </aside>
      </div>

      <footer className="geo-status">
        <div className="geo-status-left">
          <button className="icon-btn" disabled={!hist.canUndo} onClick={hist.undo} title="Ctrl+Z">↶ {t('undo')}</button>
          <button className="icon-btn" disabled={!hist.canRedo} onClick={hist.redo} title="Ctrl+Y">↷ {t('redo')}</button>
          <button className="icon-btn" onClick={() => setCam((cm) => ({ ...cm, scale: Math.min(400, cm.scale * 1.25) }))} title={t('zoomIn')}>＋</button>
          <button className="icon-btn" onClick={() => setCam((cm) => ({ ...cm, scale: Math.max(8, cm.scale / 1.25) }))} title={t('zoomOut')}>－</button>
          <button className="icon-btn" onClick={fit}>{t('fit')}</button>
          {(['ruler', 'setSquare', 'protractor'] as const).map((k) => (
            <button
              key={k}
              className={`icon-btn ${instruments.some((x) => x.kind === k) ? 'on' : ''}`}
              title={t('instrumentTip')}
              onClick={() =>
                setInstruments((xs) =>
                  xs.some((x) => x.kind === k)
                    ? xs.filter((x) => x.kind !== k)
                    : [...xs, { kind: k, x: cam.cx - (k === 'ruler' ? 6 : 0), y: cam.cy - (k === 'protractor' ? 1 : 2), rot: 0 }],
                )
              }
            >
              {t(k)}
            </button>
          ))}
          <button className="icon-btn" title="Ctrl+A" onClick={() => { setTool('move'); selectOnly(c.objects.filter((o) => !o.style.hidden).map((o) => o.id)); }}>{t('selectAll')}</button>
          <button className="icon-btn" title="Ctrl+D" disabled={!selIds.length} onClick={() => { const r = pasteObjects(c, copyClosure(c, selIds), { x: 1, y: -1 }); hist.commit(r.c); selectOnly(r.ids); }}>{t('duplicate')}</button>
          <label className="status-field geo-size">
            <span>{t('size')}</span>
            <select value={c.exportScale ?? 1} onChange={(e) => hist.commit((x) => ({ ...x, exportScale: Number(e.target.value) }))}>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                <option key={s} value={s}>{Math.round(s * 100)}%</option>
              ))}
            </select>
          </label>
          {init.mode !== 'edit' && (
            <label className="geo-check">
              <input type="checkbox" checked={!!c.caption} onChange={(e) => hist.commit((x) => ({ ...x, caption: e.target.checked || undefined }))} />
              {t('caption')}
            </label>
          )}
          <span className="hint geo-hint">{hint}</span>
        </div>
        <div className="geo-status-right">
          <button className="btn btn-tonal" onClick={cancel}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={submit} title="Ctrl+S">{t(init.mode === 'edit' ? 'update' : 'insert')}</button>
        </div>
      </footer>

      {libraryOpen && (
        <LibraryDialog
          lang={lang}
          grade={grade}
          initialTab={libraryText ? 'text' : 'tpl'}
          initialText={libraryText}
          onClose={() => setLibraryOpen(false)}
          onInsert={insertFigure}
        />
      )}
      {ocr && (
        <OcrPanel
          lang={lang}
          modes={['figure', 'page']}
          initialImage={ocr.image}
          figureAction={t('useFigure')}
          pageAction={t('drawExercise')}
          onClose={() => setOcr(null)}
          onFigure={(fig) => {
            setOcr(null);
            insertFigure(fig);
          }}
          onPage={(paragraphs) => {
            setOcr(null);
            setLibraryText(pageToPlain(paragraphs));
            setLibraryOpen(true);
          }}
        />
      )}
      {ask && (
        <AskDialog
          tool={ask.tool}
          lang={lang}
          keypad={primary}
          initial={ask.value}
          error={ask.error}
          onCancel={() => setAsk(null)}
          onSubmit={(value) => {
            const a = ask;
            const err = !a.tool.picks.length
              ? finish(c, a.tool, [], value, a.at, undefined, undefined, { fromAsk: true })
              : finish(c, a.tool, a.picks, value, a.at, a.clicks, a.fresh, { fromAsk: true });
            if (err) setAsk({ ...a, value, error: err });
            else setAsk(null);
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------- side panel -------------------------------- */

function PropsPanel(props: {
  areaInfo: string;
  measured: string;
  o: GeoObject;
  onDef(def: GeoObject['def']): void;
  isPoint: boolean;
  kind: string | null;
  straightKind: string | null;
  t: (k: keyof typeof TX) => string;
  onChange(p: Partial<Style>): void;
  onDelete(): void;
}) {
  const { o, t, onChange } = props;
  const s = o.style;
  const lineLike = props.kind === 'straight' || props.kind === 'circle' || props.kind === 'arc' || props.kind === 'polygon' || props.kind === 'function';
  const segment = props.straightKind === 'segment' || props.straightKind === 'vector';
  return (
    <div className="geo-props">
      <label className="geo-field">
        <span>{t('label')}</span>
        <input value={s.label ?? ''} title={t('labelTip')} placeholder={props.isPoint ? 'A, A_1, M\'' : ''} onChange={(e) => onChange({ label: e.target.value || undefined })} />
      </label>
      <label className="geo-check">
        <input type="checkbox" checked={s.showLabel ?? props.isPoint} onChange={(e) => onChange({ showLabel: e.target.checked })} />
        {t('showLabel')}
      </label>
      <div className="geo-field">
        <span>{t('color')}</span>
        <div className="geo-swatches">
          {COLORS.map((col) => (
            <button key={col} className={`geo-swatch ${s.color === col ? 'on' : ''}`} style={{ background: col }} onClick={() => onChange({ color: col })} aria-label={col} />
          ))}
        </div>
      </div>
      {lineLike && (
        <>
          <div className="geo-field">
            <span>{t('line')}</span>
            <div className="segmented">
              {(['solid', 'dashed', 'dotted'] as const).map((d) => (
                <button key={d} className={(s.dash ?? 'solid') === d ? 'seg-on' : ''} onClick={() => onChange({ dash: d })}>{t(d)}</button>
              ))}
            </div>
          </div>
          <div className="geo-field">
            <span>{t('thickness')}</span>
            <div className="segmented">
              {[1, 1.5, 2.2].map((w) => (
                <button key={w} className={(s.width ?? 1.3) === w || (!s.width && w === 1.5) ? 'seg-on' : ''} onClick={() => onChange({ width: w })}>
                  <span style={{ display: 'inline-block', width: 22, height: w + 0.4, background: 'currentColor', verticalAlign: 'middle' }} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {(props.straightKind === 'line' || props.straightKind === 'ray') && (
        <div className="geo-field">
          <span>{t('extent')}</span>
          <div className="segmented">
            <button className={(s.extent ?? 'auto') === 'auto' ? 'seg-on' : ''} onClick={() => onChange({ extent: 'auto' })}>{t('extentAuto')}</button>
            <button className={s.extent === 'full' ? 'seg-on' : ''} onClick={() => onChange({ extent: 'full' })}>{t('extentFull')}</button>
          </div>
          <span className="geo-muted">{t('extentHint')}</span>
        </div>
      )}
      {props.isPoint && (
        <>
          <div className="geo-field">
            <span>{t('pointShape')}</span>
            <div className="segmented">
              {([['dot', '●'], ['hollow', '○'], ['cross', '×'], ['none', '—']] as const).map(([k, g]) => {
                const cur = s.dot === false ? 'none' : s.shape ?? 'dot';
                return (
                  <button key={k} className={cur === k ? 'seg-on' : ''} onClick={() => onChange(k === 'none' ? { dot: false } : { dot: undefined, shape: k === 'dot' ? undefined : k })}>{g}</button>
                );
              })}
            </div>
          </div>
          {(s.labelDx !== undefined || s.labelDy !== undefined) && (
            <button className="icon-btn" onClick={() => onChange({ labelDx: undefined, labelDy: undefined })}>{t('resetLabel')}</button>
          )}
        </>
      )}
      {props.areaInfo && (
        <>
          <p className="geo-muted">{props.areaInfo}</p>
          <label className="geo-check">
            <input type="checkbox" checked={!!s.showValue} onChange={(e) => onChange({ showValue: e.target.checked })} />
            {t('showArea')}
          </label>
        </>
      )}
      {segment && (
        <div className="geo-field">
          <span>{t('ticks')}</span>
          <div className="segmented">
            {[0, 1, 2, 3].map((n) => (
              <button key={n} className={(s.ticks ?? 0) === n ? 'seg-on' : ''} onClick={() => onChange({ ticks: n })}>{n === 0 ? '—' : '|'.repeat(n)}</button>
            ))}
          </div>
        </div>
      )}
      {props.kind === 'angle' && (
        <>
          <div className="geo-field">
            <span>{t('arcs')}</span>
            <div className="segmented">
              {[0, 1, 2, 3].map((n) => (
                <button key={n} className={(s.arcs ?? 1) === n ? 'seg-on' : ''} onClick={() => onChange({ arcs: n })}>{n ? '⌒'.repeat(n) : '—'}</button>
              ))}
            </div>
          </div>
          <div className="geo-field">
            <span>{t('arcTicks')}</span>
            <div className="segmented">
              {[0, 1, 2, 3].map((n) => (
                <button key={n} className={(s.arcTicks ?? 0) === n ? 'seg-on' : ''} onClick={() => onChange({ arcTicks: n })}>{n === 0 ? '—' : '/'.repeat(n)}</button>
              ))}
            </div>
          </div>
          <div className="geo-field">
            <span>{t('angleText')}</span>
            <div className="segmented">
              <button className={!s.showValue && !s.showLabel ? 'seg-on' : ''} onClick={() => onChange({ showValue: false, showLabel: false })}>{t('none')}</button>
              <button className={s.showValue ? 'seg-on' : ''} onClick={() => onChange({ showValue: true, showLabel: false })}>{t('measured')} {props.measured}</button>
              <button className={!s.showValue && s.showLabel ? 'seg-on' : ''} onClick={() => onChange({ showValue: false, showLabel: true, label: s.label || props.measured })}>{t('custom')}</button>
            </div>
            {!s.showValue && s.showLabel && (
              <input className="geo-angle-text" value={s.label ?? ''} placeholder="60°" onChange={(e) => onChange({ label: e.target.value })} title={t('customHint')} />
            )}
            <div className="geo-quick">
              {['30°', '45°', '60°', '90°', '120°', 'α', 'β', 'γ', 'φ'].map((g) => (
                <button key={g} className={`geo-chip ${s.label === g && s.showLabel && !s.showValue ? 'on' : ''}`} onClick={() => onChange({ label: g, showLabel: true, showValue: false })}>{g}</button>
              ))}
            </div>
          </div>
          {o.def.t === 'angle' && (
            <label className="geo-check">
              <input type="checkbox" checked={!!o.def.reflex} onChange={(e) => props.onDef({ ...(o.def as Extract<GeoObject['def'], { t: 'angle' }>), reflex: e.target.checked || undefined })} />
              {t('reflex')}
            </label>
          )}
        </>
      )}
      {segment && (
        <label className="geo-check">
          <input type="checkbox" checked={!!s.showValue} onChange={(e) => onChange({ showValue: e.target.checked })} />
          {t('showValue')}
        </label>
      )}
      {(props.kind === 'polygon' || props.kind === 'circle' || props.kind === 'arc' || props.kind === 'angle') && (
        <label className="geo-check">
          <input
            type="checkbox"
            checked={!!s.fill && s.fill !== 'none'}
            onChange={(e) => onChange(e.target.checked ? { fill: s.color ?? (props.kind === 'angle' ? '#e67e22' : '#1d4f91'), fillOpacity: props.kind === 'angle' ? 0.3 : 0.12 } : { fill: 'none' })}
          />
          {t('fill')}
        </label>
      )}
      <label className="geo-check">
        <input type="checkbox" checked={!!s.answer} onChange={(e) => onChange({ answer: e.target.checked || undefined })} />
        {t('isAnswer')}
      </label>
      <div className="geo-props-actions">
        <button className="icon-btn" onClick={() => onChange({ hidden: !s.hidden })}>{t('hide')}</button>
        <button className="icon-btn geo-danger" onClick={props.onDelete}>{t('del')}</button>
      </div>
    </div>
  );
}

/** "P = (4 + 3) × 2 = 14 cm; S = 4 × 3 = 12 cm²" for rectangles and squares (years 3–5). */
function rectangleWorking(pts: Vec[], preset: Construction['preset'], lang: Lang): string {
  if (pts.length !== 4) return '';
  const side = (i: number) => dist(pts[i], pts[(i + 1) % 4]);
  const square = (i: number) => {
    const a = pts[(i + 3) % 4];
    const b = pts[i];
    const c2 = pts[(i + 1) % 4];
    return Math.abs((a.x - b.x) * (c2.x - b.x) + (a.y - b.y) * (c2.y - b.y)) < 1e-6 * (1 + side(i) * side((i + 3) % 4));
  };
  if (![0, 1, 2, 3].every(square)) return '';
  const n = (x: number) => formatMeasure(x, 2, preset);
  const a = side(0);
  const b = side(1);
  const vi = lang === 'vi';
  if (Math.abs(a - b) < 1e-6) return ` — ${vi ? 'Hình vuông' : 'Square'}: P = ${n(a)} × 4 = ${n(4 * a)} cm; S = ${n(a)} × ${n(a)} = ${n(a * a)} cm²`;
  return ` — ${vi ? 'Hình chữ nhật' : 'Rectangle'}: P = (${n(a)} + ${n(b)}) × 2 = ${n(2 * (a + b))} cm; S = ${n(a)} × ${n(b)} = ${n(a * b)} cm²`;
}

/** Distance (world units) from p to an angle mark as drawn: inside its sector counts as on it. */
function angleMarkDistance(v: Extract<Value, { k: 'angle' }>, p: Vec, scale: number): number {
  const dpx = dist(v.v, p) * scale;
  const r = Math.max(9, Math.min(17, v.side * scale * 0.35));
  const outer = r + 16;
  const span = ((v.a1 - v.a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const at = ((Math.atan2(p.y - v.v.y, p.x - v.v.x) - v.a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  if (at > span + 0.15 || dpx > outer || dpx < 3) return Infinity;
  // a little behind sides and points, so those stay easy to pick
  return 2.5 / scale;
}

/** The tool most likely needed for a part of an exercise not drawn automatically. */
function toolForTodo(text: string): ToolId {
  const t = normalize(text);
  const rules: [RegExp, ToolId][] = [
    [/tiep tuyen/, 'tangent'], [/trung diem/, 'midpoint'], [/vuong goc/, 'perpendicular'], [/song song/, 'parallel'],
    [/phan giac/, 'angleBisector'], [/trung truc/, 'perpBisector'], [/duong cao/, 'altitude'], [/trung tuyen/, 'median'],
    [/doi xung/, 'reflectPoint'], [/duong tron|\(\w\)/, 'circle'], [/giao|cat/, 'intersect'], [/tia/, 'ray'],
    [/duong thang/, 'line'], [/goc/, 'angle'], [/tam giac/, 'triangle'], [/thuoc|tren|lay/, 'point'],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? 'segment';
}

/** Short human description for the object list. */
function describe(o: GeoObject, c: Construction, lang: Lang): string {
  const name = (id: Id) => {
    const x = c.objects.find((y) => y.id === id);
    return x ? plainLabel(labelOf(x)) || x.id : id;
  };
  const vi = lang === 'vi';
  const num = (x: number) => String(Math.round(x * 100) / 100).replace('.', vi ? ',' : '.');
  const d = o.def;
  const own = plainLabel(labelOf(o));
  switch (d.t) {
    case 'point':
      return `${own} (${num(d.x)}; ${num(d.y)})`;
    case 'pointOn':
      return `${own} ∈ ${name(d.on)}`;
    case 'midpoint':
      return `${own}: ${vi ? 'trung điểm' : 'midpoint'} ${name(d.a)}${name(d.b)}`;
    case 'intersection':
      return `${own} = ${name(d.a)} ∩ ${name(d.b)}`;
    case 'polyVertex':
    case 'image':
      return own || o.id;
    case 'numberLine':
      return `${vi ? 'Trục số' : 'Number line'} ${d.from} … ${d.to}`;
    case 'compassMark':
      return vi ? 'Nét com-pa' : 'Compass arc';
    case 'solid': {
      const names: Record<string, [string, string]> = {
        cuboid: ['Hình hộp chữ nhật', 'Cuboid'], cube: ['Hình lập phương', 'Cube'], prism3: ['Lăng trụ tam giác', 'Triangular prism'],
        pyramid3: ['Hình chóp tam giác', 'Triangular pyramid'], pyramid4: ['Hình chóp tứ giác', 'Square pyramid'],
        cylinder: ['Hình trụ', 'Cylinder'], cone: ['Hình nón', 'Cone'], sphere: ['Hình cầu', 'Sphere'],
      };
      return names[d.kind][vi ? 0 : 1];
    }
    case 'solidVertex':
      return own || o.id;
    case 'fraction':
      return `${vi ? 'Chia hình, tô' : 'Split, coloured'} ${d.filled.length}/${d.n * (d.rows ?? 1)}`;
    case 'ray': {
      const tipObj = c.objects.find((y) => y.id === d.b);
      return `${vi ? 'Tia' : 'Ray'} ${name(d.a)}${tipObj ? labelOf(tipObj) || '' : ''}`;
    }
    case 'pointPolar':
      return `${own}: ${name(d.center)}${own} = ${String(d.r).replace('.', vi ? ',' : '.')} cm`;
    case 'foot':
      return `${own}: ${vi ? 'hình chiếu của' : 'projection of'} ${name(d.point)}`;
    case 'center': {
      const kinds = { centroid: vi ? 'trọng tâm' : 'centroid', orthocenter: vi ? 'trực tâm' : 'orthocentre', incenter: vi ? 'tâm nội tiếp' : 'incentre', circumcenter: vi ? 'tâm ngoại tiếp' : 'circumcentre' };
      return `${own}: ${kinds[d.kind]} ${name(d.a)}${name(d.b)}${name(d.c)}`;
    }
    case 'incircle':
      return `${vi ? 'Đường tròn nội tiếp' : 'Incircle'} ${name(d.a)}${name(d.b)}${name(d.c)}`;
    case 'angleLines':
      return `∠(${name(d.l1)}, ${name(d.l2)})`;
    case 'segment':
      return `${vi ? 'Đoạn' : 'Segment'} ${name(d.a)}${name(d.b)}`;
    case 'line':
      return `${vi ? 'Đường thẳng' : 'Line'} ${name(d.a)}${name(d.b)}`;
    case 'ray':
      return `${vi ? 'Tia' : 'Ray'} ${name(d.a)}${name(d.b)}`;
    case 'vector':
      return `${vi ? 'Vectơ' : 'Vector'} ${name(d.a)}${name(d.b)}`;
    case 'perpendicular':
      return `${vi ? 'Vuông góc' : 'Perpendicular'} ${vi ? 'qua' : 'through'} ${name(d.through)}`;
    case 'parallel':
      return `${vi ? 'Song song' : 'Parallel'} ${vi ? 'qua' : 'through'} ${name(d.through)}`;
    case 'perpBisector':
      return `${vi ? 'Trung trực' : 'Bisector'} ${name(d.a)}${name(d.b)}`;
    case 'angleBisector':
      return `${vi ? 'Phân giác' : 'Bisector'} ${name(d.a)}${name(d.b)}${name(d.c)}`;
    case 'tangent':
      return `${vi ? 'Tiếp tuyến' : 'Tangent'} ${vi ? 'từ' : 'from'} ${name(d.through)}`;
    case 'circle':
    case 'circleR':
      return `${vi ? 'Đường tròn' : 'Circle'} (${name(d.center)})`;
    case 'circle3':
      return `${vi ? 'Đường tròn' : 'Circle'} (${name(d.a)}${name(d.b)}${name(d.c)})`;
    case 'arc':
    case 'sector':
      return `${d.t === 'arc' ? (vi ? 'Cung' : 'Arc') : vi ? 'Hình quạt' : 'Sector'} ${name(d.a)}${name(d.b)}`;
    case 'polygon':
      return `${vi ? 'Đa giác' : 'Polygon'} ${d.pts.map(name).join('')}`;
    case 'regularPolygon':
      return `${vi ? 'Đa giác đều' : 'Regular polygon'} (${d.n})`;
    case 'angle':
      return `∠${name(d.a)}${name(d.b)}${name(d.c)}`;
    case 'text':
      return `“${d.text}”`;
    case 'function':
      return `y = ${d.expr}`;
  }
}
