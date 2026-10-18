/**
 * Tools by school year (Vietnamese curriculum, GDPT 2018), shape families with a
 * variant chooser, and the step-by-step instructions shown while a tool is in use.
 */
import { toolById, type Pick, type ToolId } from './tools';
import type { Lang } from '../shared/settings';

export type Grade = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 'all';
export const GRADES: Grade[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 'all'];

/** Tools a year adds to those of the years before it. */
const ADDED: Record<Exclude<Grade, 'all'>, ToolId[]> = {
  // điểm, đoạn thẳng, đường thẳng, ba điểm thẳng hàng, đường gấp khúc, tứ giác
  2: ['move', 'point', 'segment', 'segmentLength', 'line', 'polyline', 'polygon', 'triangle', 'rectangle', 'square', 'fraction', 'numberLine', 'text', 'measure', 'delete'],
  // trung điểm, hình tròn (tâm, bán kính, đường kính), góc vuông, chu vi, diện tích
  3: ['midpoint', 'circle', 'circleR', 'angle', 'equalMark'],
  // góc nhọn / tù / bẹt, đo góc, vuông góc, song song, hình bình hành, hình thoi
  4: ['angleFixed', 'perpendicular', 'parallel', 'parallelogram', 'rhombus'],
  // tam giác (đáy, chiều cao), hình thang, hình quạt
  5: ['baseHeight', 'altitude', 'trapezoid', 'trapezoidRight', 'sector', 'cuboid', 'cube', 'cylinder', 'sphere'],
  // tia, giao điểm, góc, đa giác đều, hình có trục / tâm đối xứng, tọa độ
  6: ['ray', 'oppositeRay', 'intersect', 'triangleEq', 'trapezoidIso', 'regularPolygon', 'reflectLine', 'reflectPoint', 'pointXY'],
  // tia phân giác, trung trực, tam giác cân / vuông, tam giác bằng nhau, các đường đồng quy
  7: ['angleBisector', 'perpBisector', 'angleLines', 'triangleIso', 'triangleRight', 'triangleRightIso', 'triangleSSS', 'triangleSAS', 'triangleASA',
    'median', 'bisectorIn', 'centroid', 'orthocenter', 'circumcircle', 'incircle', 'foot', 'function',
    'crossLines', 'parallelTransversal', 'altitudes3', 'medians3', 'bisectors3', 'prism3'],
  // đường trung bình, tứ giác
  8: ['midline', 'diagonals', 'pyramid3', 'pyramid4'],
  // đường tròn, cung, tiếp tuyến, phép quay của đa giác đều
  9: ['circle3', 'arc', 'tangent', 'inscribedAngle', 'rotate', 'cone'],
  // vectơ, phép biến hình
  10: ['vector', 'translate', 'dilate'],
};

/** All tools available in a year (cumulative), or every tool. */
export function toolsForGrade(g: Grade): Set<ToolId> | null {
  if (g === 'all') return null;
  const out = new Set<ToolId>();
  for (const y of [2, 3, 4, 5, 6, 7, 8, 9, 10] as const) {
    if (y > g) break;
    ADDED[y].forEach((t) => out.add(t));
  }
  return out;
}

/** Primary school (7–10 years old): big buttons, grid on, larger touch targets. */
export const isPrimary = (g: Grade) => g !== 'all' && g <= 5;

/** Shapes chosen from a row of pictures once the family's tool is active. */
export interface Family {
  id: string;
  vi: string;
  en: string;
  members: ToolId[];
}

export const FAMILIES: Family[] = [
  { id: 'tri', vi: 'Tam giác', en: 'Triangle', members: ['triangle', 'triangleIso', 'triangleRight', 'triangleRightIso', 'triangleEq', 'triangleSSS', 'triangleSAS', 'triangleASA'] },
  { id: 'quad', vi: 'Tứ giác', en: 'Quadrilateral', members: ['square', 'rectangle', 'parallelogram', 'rhombus', 'trapezoid', 'trapezoidIso', 'trapezoidRight', 'regularPolygon'] },
  { id: 'solid', vi: 'Hình khối', en: 'Solid', members: ['cuboid', 'cube', 'prism3', 'pyramid3', 'pyramid4', 'cylinder', 'cone', 'sphere'] },
];

export const familyOf = (t: ToolId): Family | null => FAMILIES.find((f) => f.members.includes(t)) ?? null;

/* ----------------------------- step-by-step help ----------------------------- */

type Txt = [vi: string, en: string];

/** Instructions for each pick of the tools children use most. */
const STEPS: Partial<Record<ToolId, Txt[]>> = {
  point: [['Nhấp vào chỗ muốn đặt điểm', 'Click where the point goes']],
  segment: [['Nhấp điểm đầu (hoặc nhấn giữ rồi kéo)', 'Click the first end (or press and drag)'], ['Nhấp điểm cuối', 'Click the other end']],
  segmentLength: [['Nhấp điểm đầu của đoạn thẳng', 'Click the start of the segment']],
  line: [['Nhấp điểm thứ nhất (hoặc nhấn giữ rồi kéo)', 'Click a first point (or press and drag)'], ['Nhấp điểm thứ hai', 'Click a second point']],
  ray: [['Nhấp gốc của tia (O)', 'Click the origin O'], ['Nhấp chỗ tia đi qua', 'Click where the ray goes']],
  vector: [['Nhấp điểm đầu', 'Click the start'], ['Nhấp điểm cuối (đầu mũi tên)', 'Click the end (arrow head)']],
  polygon: [['Nhấp đỉnh thứ nhất', 'Click the first vertex'], ['Nhấp đỉnh tiếp theo', 'Click the next vertex'], ['Nhấp đỉnh tiếp theo — nhấp đúp hoặc bấm Xong để khép kín', 'Next vertex — double-click or press Done to close']],
  polyline: [['Nhấp điểm đầu', 'Click the first point'], ['Nhấp điểm tiếp theo — nhấp đúp hoặc bấm Xong để kết thúc', 'Next point — double-click or press Done to finish']],
  triangle: [['Nhấp đỉnh thứ nhất', 'Click the first vertex'], ['Nhấp đỉnh thứ hai', 'Click the second vertex'], ['Nhấp đỉnh thứ ba', 'Click the third vertex']],
  triangleIso: [['Nhấp đỉnh thứ nhất của cạnh đáy', 'Click one end of the base'], ['Nhấp đỉnh còn lại của cạnh đáy', 'Click the other end of the base']],
  triangleRight: [['Nhấp đỉnh góc vuông', 'Click the right-angle vertex'], ['Nhấp một đỉnh khác', 'Click another vertex']],
  triangleRightIso: [['Nhấp đỉnh góc vuông', 'Click the right-angle vertex'], ['Nhấp một đỉnh khác', 'Click another vertex']],
  triangleEq: [['Nhấp đỉnh thứ nhất (hoặc nhấn giữ rồi kéo một cạnh)', 'Click the first vertex (or drag one side)'], ['Nhấp đỉnh thứ hai', 'Click the second vertex']],
  square: [['Nhấp một đỉnh (hoặc nhấn giữ rồi kéo một cạnh)', 'Click a vertex (or drag one side)'], ['Nhấp đỉnh kề bên', 'Click the next vertex']],
  rectangle: [['Nhấp một đỉnh (hoặc nhấn giữ rồi kéo một cạnh)', 'Click a vertex (or drag one side)'], ['Nhấp đỉnh kề bên', 'Click the next vertex']],
  rhombus: [['Nhấp một đỉnh', 'Click a vertex'], ['Nhấp đỉnh kề bên', 'Click the next vertex']],
  parallelogram: [['Nhấp đỉnh A', 'Click vertex A'], ['Nhấp đỉnh B', 'Click vertex B'], ['Nhấp đỉnh C', 'Click vertex C']],
  trapezoid: [['Nhấp đỉnh A của đáy lớn', 'Click vertex A of the long base'], ['Nhấp đỉnh B của đáy lớn', 'Click vertex B of the long base'], ['Nhấp đỉnh C của đáy nhỏ', 'Click vertex C on the short base']],
  circle: [['Nhấp vào tâm (hoặc nhấn giữ ở tâm rồi kéo)', 'Click the centre (or press there and drag)'], ['Nhấp điểm nằm trên đường tròn', 'Click a point on the circle']],
  circleR: [['Nhấp vào tâm', 'Click the centre']],
  midpoint: [['Nhấp vào đoạn thẳng (hoặc chọn hai điểm)', 'Click the segment (or two points)'], ['Nhấp điểm thứ hai', 'Click the second point']],
  angle: [['Nhấp vào bên trong góc, gần đỉnh (hoặc chọn 3 điểm)', 'Click inside the angle near its vertex (or 3 points)'], ['Nhấp vào đỉnh góc', 'Click the vertex'], ['Nhấp điểm trên cạnh thứ hai', 'Click a point on the other side']],
  angleBisector: [['Nhấp vào bên trong góc, gần đỉnh', 'Click inside the angle near its vertex'], ['Nhấp vào đỉnh góc', 'Click the vertex'], ['Nhấp điểm trên cạnh thứ hai', 'Click a point on the other side']],
  angleFixed: [['Nhấp chỗ cạnh thứ nhất đi qua (Ox)', 'Click where the first side goes (Ox)'], ['Nhấp vào đỉnh O', 'Click the vertex O']],
  perpendicular: [['Nhấp vào đường thẳng', 'Click the line'], ['Nhấp điểm mà đường vuông góc đi qua', 'Click the point it goes through']],
  parallel: [['Nhấp vào đường thẳng', 'Click the line'], ['Nhấp điểm mà đường song song đi qua', 'Click the point it goes through']],
  altitude: [['Nhấp vào đỉnh của tam giác cần kẻ đường cao', 'Click the vertex the altitude starts from']],
  median: [['Nhấp vào đỉnh của tam giác cần kẻ trung tuyến', 'Click the vertex the median starts from']],
  bisectorIn: [['Nhấp vào đỉnh của tam giác cần kẻ phân giác', 'Click the vertex the bisector starts from']],
  midline: [['Nhấp vào đỉnh đối diện với cạnh song song', 'Click the vertex opposite the parallel side']],
  centroid: [['Nhấp vào bên trong tam giác', 'Click inside the triangle']],
  orthocenter: [['Nhấp vào bên trong tam giác', 'Click inside the triangle']],
  circumcircle: [['Nhấp vào bên trong tam giác', 'Click inside the triangle']],
  incircle: [['Nhấp vào bên trong tam giác', 'Click inside the triangle']],
  equalMark: [['Nhấp vào cạnh hoặc góc cần đánh dấu', 'Click the side or angle to mark']],
  measure: [['Nhấp vào đoạn thẳng, góc, đa giác hoặc hình tròn', 'Click a segment, angle, polygon or circle']],
  delete: [['Nhấp vào thứ cần xóa', 'Click what to delete']],
  fraction: [['Nhấp vào bên trong hình cần chia (hình chữ nhật, hình vuông, tam giác, hình tròn)', 'Click inside the shape to split (rectangle, square, triangle, circle)']],
  baseHeight: [['Nhấp vào cạnh làm đáy', 'Click the side used as the base'], ['Nhấp đầu kia của cạnh đáy', 'Click the other end of the base'], ['Nhấp đỉnh mà chiều cao đi qua', 'Click the vertex the height comes from']],
  altitudes3: [['Nhấp vào bên trong tam giác', 'Click inside the triangle']],
  medians3: [['Nhấp vào bên trong tam giác', 'Click inside the triangle']],
  bisectors3: [['Nhấp vào bên trong tam giác', 'Click inside the triangle']],
  diagonals: [['Nhấp vào bên trong tứ giác', 'Click inside the quadrilateral']],
  oppositeRay: [['Nhấp vào tia Ox cần vẽ tia đối', 'Click the ray Ox']],
  crossLines: [['Nhấp vào chỗ hai đường thẳng cắt nhau (O)', 'Click where the lines cross (O)']],
  parallelTransversal: [['Nhấp vào giữa chỗ cần vẽ hình', 'Click where the figure goes']],
  inscribedAngle: [['Nhấp vào đường tròn', 'Click the circle']],
  numberLine: [['Nhấp vào chỗ đặt trục số (số đầu tiên)', 'Click where the number line starts']],
  cuboid: [['Nhấp chỗ đặt đỉnh A (góc trước, bên trái, ở dưới)', 'Click where vertex A goes (front, left, bottom)']],
  cube: [['Nhấp chỗ đặt đỉnh A (góc trước, bên trái, ở dưới)', 'Click where vertex A goes (front, left, bottom)']],
  prism3: [['Nhấp vào chỗ đặt hình', 'Click where the solid goes']],
  pyramid3: [['Nhấp vào chỗ đặt hình', 'Click where the solid goes']],
  pyramid4: [['Nhấp chỗ đặt đỉnh A của đáy', 'Click where base vertex A goes']],
  cylinder: [['Nhấp chỗ đặt tâm O của đáy', 'Click the centre O of the base']],
  cone: [['Nhấp chỗ đặt tâm O của đáy', 'Click the centre O of the base']],
  sphere: [['Nhấp chỗ đặt tâm O', 'Click the centre O']],
  text: [['Nhấp vào chỗ cần ghi chữ', 'Click where the text goes']],
};

const PICK_TEXT: Record<Pick, Txt> = {
  point: ['Nhấp chọn một điểm (hoặc chỗ trống để tạo điểm mới)', 'Click a point (or empty space for a new one)'],
  straight: ['Nhấp vào một đường thẳng / đoạn thẳng', 'Click a line or segment'],
  round: ['Nhấp vào một đường tròn', 'Click a circle'],
  curve: ['Nhấp vào một đường', 'Click a line or circle'],
  object: ['Nhấp vào hình cần biến đổi', 'Click the shape to transform'],
  vector: ['Nhấp vào một vectơ', 'Click a vector'],
  segment: ['Nhấp vào một đoạn thẳng', 'Click a segment'],
  segmentOrAngle: ['Nhấp vào cạnh hoặc góc', 'Click a side or an angle'],
  measurable: ['Nhấp vào đoạn thẳng, góc, đa giác hoặc hình tròn', 'Click a segment, angle, polygon or circle'],
  ray: ['Nhấp vào một tia', 'Click a ray'],
  fillable: ['Nhấp vào bên trong hình cần chia', 'Click inside the shape to split'],
  quad: ['Nhấp vào bên trong tứ giác', 'Click inside the quadrilateral'],
};

/** Number of steps shown for a tool (polygons: open-ended, shown as 3). */
export function stepCount(t: ToolId): number {
  const def = toolById(t);
  if (t === 'polygon') return 3;
  if (t === 'polyline') return 2;
  return Math.max(1, def.picks.length);
}

/** The instruction for step `i` (0-based) of a tool. */
export function stepText(t: ToolId, i: number, lang: Lang): string {
  const k = lang === 'vi' ? 0 : 1;
  const steps = STEPS[t];
  if (steps?.length) return steps[Math.min(i, steps.length - 1)][k];
  const def = toolById(t);
  const pick = def.picks[Math.min(i, def.picks.length - 1)];
  return pick ? PICK_TEXT[pick][k] : lang === 'vi' ? def.hintVi : def.hintEn;
}
