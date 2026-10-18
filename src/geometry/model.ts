/**
 * Geometry construction model (2D dynamic geometry).
 *
 * A construction is an ordered list of objects; each object is defined from
 * objects created before it, so dragging a free point updates everything that
 * depends on it. The JSON of a construction is what gets stored with the figure.
 */

export type Id = string;

export type Transform =
  | { k: 'reflectLine'; line: Id }
  | { k: 'reflectPoint'; center: Id }
  | { k: 'rotate'; center: Id; deg: number }
  | { k: 'translate'; vector: Id }
  | { k: 'dilate'; center: Id; factor: number };

export type Def =
  // points
  | { t: 'point'; x: number; y: number }
  | { t: 'pointOn'; on: Id; param: number }
  | { t: 'midpoint'; a: Id; b: Id }
  | { t: 'intersection'; a: Id; b: Id; index: 0 | 1 }
  | { t: 'polyVertex'; poly: Id; i: number }
  /** Point at distance r from `center`, in direction `deg` (dragging changes only the direction). */
  | { t: 'pointPolar'; center: Id; r: number; deg: number }
  /** Orthogonal projection of a point on a line. */
  | { t: 'foot'; point: Id; line: Id }
  /** Triangle centres. */
  | { t: 'center'; kind: 'centroid' | 'orthocenter' | 'incenter' | 'circumcenter'; a: Id; b: Id; c: Id }
  // straight objects
  | { t: 'segment' | 'line' | 'ray' | 'vector'; a: Id; b: Id }
  | { t: 'perpendicular' | 'parallel'; line: Id; through: Id }
  | { t: 'perpBisector'; a: Id; b: Id }
  | { t: 'angleBisector'; a: Id; b: Id; c: Id }
  | { t: 'tangent'; circle: Id; through: Id; index: 0 | 1 }
  // round objects
  | { t: 'circle'; center: Id; through: Id }
  | { t: 'circleR'; center: Id; r: number }
  | { t: 'circle3'; a: Id; b: Id; c: Id }
  | { t: 'incircle'; a: Id; b: Id; c: Id }
  | { t: 'arc'; center: Id; a: Id; b: Id }
  | { t: 'sector'; center: Id; a: Id; b: Id }
  // shapes & marks
  | { t: 'polygon'; pts: Id[] }
  | { t: 'regularPolygon'; a: Id; b: Id; n: number }
  /** Angle at b between rays b→a and b→c; `reflex` takes the angle larger than 180°. */
  | { t: 'angle'; a: Id; b: Id; c: Id; reflex?: boolean }
  /** Angle between two straight objects at their intersection; s1/s2 pick the ray direction (+1/−1). */
  | { t: 'angleLines'; l1: Id; l2: Id; s1: 1 | -1; s2: 1 | -1 }
  // transformations of another object
  | { t: 'image'; of: Id; tr: Transform }
  /**
   * A shape (polygon or circle) cut into equal parts, some of them coloured — fractions in
   * primary school. Polygons: `n` columns × `rows` rows (quadrilaterals), slices from a
   * vertex (triangles) or from the centre (others); circles: `n` sectors from the top.
   */
  | { t: 'fraction'; of: Id; n: number; rows?: number; filled: number[] }
  /** A number line starting at (x, y): numbers from..to, a tick every `step`, `unit` cm per step, marked numbers. */
  | { t: 'numberLine'; x: number; y: number; from: number; to: number; step: number; unit: number; marks: number[] }
  /** A short compass arc around `center` through `through` (the trace of a ruler-and-compass construction). */
  | { t: 'compassMark'; center: Id; through: Id; span?: number }
  /** A solid drawn in oblique projection (as in textbooks), its front-left-bottom corner at `at`. */
  | { t: 'solid'; kind: SolidKind; at: Id; w: number; d: number; h: number; apexOverA?: boolean }
  /** Vertex i of a solid, so it can be named and used (A, B, C, D, A′…, S). */
  | { t: 'solidVertex'; solid: Id; i: number }
  // annotations
  | { t: 'text'; x: number; y: number; text: string; latex?: boolean }
  | { t: 'function'; expr: string; from?: number; to?: number };

export type DashStyle = 'solid' | 'dashed' | 'dotted';

export type SolidKind = 'cuboid' | 'cube' | 'prism3' | 'pyramid3' | 'pyramid4' | 'cylinder' | 'cone' | 'sphere';

export interface Style {
  color?: string;
  /** Stroke width in px at 100% (export scales it). */
  width?: number;
  dash?: DashStyle;
  /** Fill colour for polygons / circles / sectors ("none" by default). */
  fill?: string;
  fillOpacity?: number;
  label?: string;
  showLabel?: boolean;
  /** Label offset from its anchor, in px. */
  labelDx?: number;
  labelDy?: number;
  /** Equal-length tick marks on a segment (0–3). */
  ticks?: number;
  /** Arcs drawn on an angle mark (1–3); a right angle shows a square instead. */
  arcs?: number;
  /** Small strokes across the angle arc (0–3), the textbook way to mark equal angles. */
  arcTicks?: number;
  /** Show the measured value (angle in degrees, segment length). */
  showValue?: boolean;
  hidden?: boolean;
  /**
   * Drawn part of a line or ray. 'auto' (default): just past the points on it, the way
   * lines are drawn in textbooks; 'full': across the whole view; [t0, t1]: from a + t0·d
   * to a + t1·d (cm along the line from its first point), set by dragging its ends.
   */
  extent?: 'auto' | 'full' | [number, number];
  /** Points: false draws no dot — the end of a ray named with a small letter (ray Ox). */
  dot?: boolean;
  /** Points: filled dot (default), hollow circle or a small cross. */
  shape?: 'dot' | 'hollow' | 'cross';
  /** Part of the answer: left out of the "question" version of the figure. */
  answer?: boolean;
}

export interface GeoObject {
  id: Id;
  def: Def;
  style: Style;
}

export type StylePreset = 'vn' | 'intl';
export type AngleFormat = 'int' | 'dms' | 'decimal';

export interface Construction {
  version: 1;
  objects: GeoObject[];
  /** Visible world rectangle in the editor (world units = cm). */
  view: { xmin: number; xmax: number; ymin: number; ymax: number };
  axes: boolean;
  grid: boolean;
  preset: StylePreset;
  /** Size of the inserted figure: centimetres per world unit (default 1). */
  exportScale?: number;
  /** How angle sizes are shown: whole degrees (default), degrees-minutes, or one decimal. */
  angleFormat?: AngleFormat;
  /** 'hide': the question version — objects marked as answer are left out. */
  answers?: 'show' | 'hide';
  /** Insert a caption "Hình n" under a new figure. */
  caption?: boolean;
  /** Constructions leave their compass arcs (ruler-and-compass style). */
  compass?: boolean;
  /** Parts of a typed exercise still to draw by hand (editor checklist). */
  todo?: string[];
}

export function emptyConstruction(): Construction {
  return { version: 1, objects: [], view: { xmin: -8, xmax: 8, ymin: -5, ymax: 5 }, axes: false, grid: false, preset: 'vn' };
}

/** Objects a definition depends on (for deletion cascades). */
export function dependencies(def: Def): Id[] {
  switch (def.t) {
    case 'point':
    case 'text':
    case 'function':
      return [];
    case 'pointOn':
      return [def.on];
    case 'midpoint':
    case 'segment':
    case 'line':
    case 'ray':
    case 'vector':
    case 'perpBisector':
      return [def.a, def.b];
    case 'intersection':
      return [def.a, def.b];
    case 'polyVertex':
      return [def.poly];
    case 'pointPolar':
      return [def.center];
    case 'foot':
      return [def.point, def.line];
    case 'center':
    case 'incircle':
      return [def.a, def.b, def.c];
    case 'angleLines':
      return [def.l1, def.l2];
    case 'perpendicular':
    case 'parallel':
      return [def.line, def.through];
    case 'angleBisector':
    case 'angle':
    case 'circle3':
      return [def.a, def.b, def.c];
    case 'tangent':
      return [def.circle, def.through];
    case 'circle':
      return [def.center, def.through];
    case 'circleR':
      return [def.center];
    case 'arc':
    case 'sector':
      return [def.center, def.a, def.b];
    case 'polygon':
      return [...def.pts];
    case 'regularPolygon':
      return [def.a, def.b];
    case 'fraction':
      return [def.of];
    case 'numberLine':
      return [];
    case 'compassMark':
      return [def.center, def.through];
    case 'solid':
      return [def.at];
    case 'solidVertex':
      return [def.solid];
    case 'image': {
      const tr = def.tr;
      const extra = tr.k === 'reflectLine' ? tr.line : tr.k === 'translate' ? tr.vector : tr.center;
      return [def.of, extra];
    }
  }
}

/** True for definitions whose value is a point. */
export function isPointDef(def: Def): boolean {
  return ['point', 'pointOn', 'midpoint', 'intersection', 'polyVertex', 'pointPolar', 'foot', 'center', 'solidVertex'].includes(def.t);
}
