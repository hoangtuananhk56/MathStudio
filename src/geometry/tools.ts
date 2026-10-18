/**
 * Construction tools: what each tool asks the user to pick, and the objects it
 * creates from those picks. UI-independent so it can be unit tested.
 *
 * Shape templates are built from hidden helper objects so they keep their
 * properties when dragged (an isosceles triangle's apex lives on the hidden
 * perpendicular bisector of its base, a rectangle's corner on a hidden
 * perpendicular…), and they come with the usual textbook marks.
 */
import { computeAll, dist, dot, sub, type Value, type Values, type Vec } from './engine';
import { isPointDef, type Construction, type Def, type GeoObject, type Id, type SolidKind, type Style, type Transform } from './model';

export type Pick = 'point' | 'straight' | 'round' | 'curve' | 'object' | 'vector' | 'segment' | 'segmentOrAngle' | 'measurable' | 'ray' | 'fillable' | 'quad';

export type ToolId =
  | 'move' | 'point' | 'pointXY' | 'intersect' | 'midpoint' | 'foot'
  | 'segment' | 'segmentLength' | 'line' | 'ray' | 'oppositeRay' | 'vector'
  | 'perpendicular' | 'parallel' | 'perpBisector' | 'angleBisector' | 'tangent' | 'crossLines' | 'parallelTransversal'
  | 'triangle' | 'triangleIso' | 'triangleRight' | 'triangleRightIso' | 'triangleEq' | 'triangleSSS' | 'triangleSAS' | 'triangleASA'
  | 'altitude' | 'median' | 'bisectorIn' | 'midline' | 'centroid' | 'orthocenter' | 'circumcircle' | 'incircle'
  | 'baseHeight' | 'altitudes3' | 'medians3' | 'bisectors3' | 'diagonals' | 'fraction'
  | 'polygon' | 'polyline' | 'square' | 'rectangle' | 'parallelogram' | 'rhombus' | 'trapezoid' | 'trapezoidIso' | 'trapezoidRight' | 'regularPolygon'
  | 'circle' | 'circleR' | 'circle3' | 'arc' | 'sector' | 'inscribedAngle'
  | 'angle' | 'angleLines' | 'angleFixed' | 'equalMark' | 'measure'
  | 'reflectLine' | 'reflectPoint' | 'rotate' | 'translate' | 'dilate'
  | 'numberLine' | 'cuboid' | 'cube' | 'prism3' | 'pyramid3' | 'pyramid4' | 'cylinder' | 'cone' | 'sphere'
  | 'text' | 'function' | 'delete';

/** A value the tool needs typed in (radius, angle, number of sides…). */
export interface Ask {
  key: 'n' | 'r' | 'deg' | 'k' | 'text' | 'expr' | 'xy' | 'len' | 'sss' | 'sas' | 'asa' | 'frac' | 'numline' | 'box' | 'cube' | 'prism' | 'pyr' | 'round' | 'ball';
  vi: string;
  en: string;
  initial: string;
}

export interface ToolDef {
  id: ToolId;
  vi: string;
  en: string;
  /** Hint shown while the tool is active. */
  hintVi: string;
  hintEn: string;
  /** Picks in order; 'polygon' collects points until the first one is clicked again. */
  picks: Pick[];
  ask?: Ask;
  /** Shown in the simple (young learners) mode. */
  basic?: boolean;
}

export interface ToolGroup {
  id: string;
  vi: string;
  en: string;
  tools: ToolDef[];
}

const T = (id: ToolId, vi: string, en: string, picks: Pick[], hintVi: string, hintEn: string, extra: Partial<ToolDef> = {}): ToolDef => ({
  id, vi, en, picks, hintVi, hintEn, ...extra,
});

const P3 = ['point', 'point', 'point'] as Pick[];
const P2 = ['point', 'point'] as Pick[];
const TRI_HINT_VI = 'Chọn đỉnh rồi hai đỉnh còn lại của tam giác (ví dụ A, B, C).';
const TRI_HINT_EN = 'Select the vertex, then the other two vertices (e.g. A, B, C).';

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'basic', vi: 'Cơ bản', en: 'Basic',
    tools: [
      T('move', 'Di chuyển', 'Move', [], 'Kéo điểm, đoạn thẳng, hình để di chuyển. Kéo trên nền trống để khoanh chọn nhiều đối tượng, rồi nắm trong khung để dời cả nhóm (Ctrl+A: chọn hết). Cuộn bằng bánh xe chuột hoặc Space+kéo; Ctrl+bánh xe để phóng to.', 'Drag points, segments or shapes to move them. Drag on empty space to select several, then grab inside the box to move them all (Ctrl+A: all). Scroll with the wheel or Space+drag; Ctrl+wheel zooms.', { basic: true }),
      T('point', 'Điểm', 'Point', ['point'], 'Nhấp để đặt điểm (trên đường, giao điểm hoặc tự do). Giữ Shift để bắt góc 15°.', 'Click to place a point (on an object, at an intersection, or free). Hold Shift for 15° steps.', { basic: true }),
      T('pointXY', 'Điểm theo tọa độ', 'Point by coordinates', [], 'Nhập tọa độ, ví dụ 2; -1.', 'Type the coordinates, e.g. 2; -1.', {
        ask: { key: 'xy', vi: 'Tọa độ (x; y)', en: 'Coordinates (x; y)', initial: '0; 0' },
      }),
      T('intersect', 'Giao điểm', 'Intersection', ['curve', 'curve'], 'Chọn hai đường cần lấy giao điểm.', 'Select two objects to intersect.'),
      T('midpoint', 'Trung điểm', 'Midpoint', P2, 'Chọn hai điểm.', 'Select two points.', { basic: true }),
      T('foot', 'Hình chiếu', 'Projection', ['point', 'straight'], 'Chọn điểm rồi đường thẳng cần chiếu lên.', 'Select a point, then the line to project onto.'),
    ],
  },
  {
    id: 'lines', vi: 'Đường', en: 'Lines',
    tools: [
      T('segment', 'Đoạn thẳng', 'Segment', P2, 'Chọn hai điểm đầu mút. Giữ Shift để bắt góc 15° và độ dài chẵn.', 'Select two end points. Hold Shift for 15° steps and round lengths.', { basic: true }),
      T('segmentLength', 'Đoạn thẳng có độ dài cho trước', 'Segment with given length', ['point'], 'Chọn điểm đầu rồi nhập độ dài.', 'Select the start point, then type the length.', {
        ask: { key: 'len', vi: 'Độ dài (cm)', en: 'Length (cm)', initial: '4' },
        basic: true,
      }),
      T('line', 'Đường thẳng', 'Line', P2, 'Chọn hai điểm.', 'Select two points.', { basic: true }),
      T('ray', 'Tia', 'Ray', P2, 'Chọn gốc O rồi nhấp chỗ ngọn tia (chỗ trống: ngọn ghi chữ thường như Ox; vào điểm A: tia OA).', 'Select the origin O, then where the ray points (empty space: a small letter like Ox; a point A: ray OA).', { basic: true }),
      T('oppositeRay', 'Tia đối', 'Opposite ray', ['ray'], 'Nhấp vào một tia Ox: vẽ tia đối Ox′.', 'Click a ray Ox: draws the opposite ray Ox′.'),
      T('vector', 'Vectơ', 'Vector', P2, 'Chọn điểm đầu rồi điểm cuối.', 'Select the start, then the end.'),
    ],
  },
  {
    id: 'relations', vi: 'Quan hệ', en: 'Constructions',
    tools: [
      T('perpendicular', 'Đường vuông góc', 'Perpendicular', ['straight', 'point'], 'Chọn đường thẳng rồi điểm.', 'Select a line, then a point.', { basic: true }),
      T('parallel', 'Đường song song', 'Parallel', ['straight', 'point'], 'Chọn đường thẳng rồi điểm.', 'Select a line, then a point.', { basic: true }),
      T('perpBisector', 'Đường trung trực', 'Perpendicular bisector', P2, 'Chọn hai điểm.', 'Select two points.'),
      T('angleBisector', 'Tia phân giác', 'Angle bisector', P3, 'Chọn ba điểm, điểm giữa là đỉnh góc (ví dụ x, O, y).', 'Select three points; the middle one is the vertex (e.g. x, O, y).'),
      T('crossLines', 'Hai đường thẳng cắt nhau', 'Two crossing lines', ['point'], 'Nhấp chỗ giao điểm O: vẽ xx′ cắt yy′, đánh số 4 góc (đối đỉnh, kề bù).', 'Click where they cross (O): draws xx′ and yy′ with the four angles numbered.'),
      T('parallelTransversal', 'Hai đường song song và cát tuyến', 'Parallel lines and a transversal', ['point'], 'Nhấp vào giữa chỗ cần vẽ: a ∥ b bị cắt bởi c, đánh số các góc tại A và B.', 'Click where to draw: a ∥ b cut by c, angles at A and B numbered.'),
      T('tangent', 'Tiếp tuyến', 'Tangents', ['point', 'round'], 'Chọn điểm rồi đường tròn.', 'Select a point, then a circle.'),
    ],
  },
  {
    id: 'triangles', vi: 'Tam giác', en: 'Triangles',
    tools: [
      T('triangle', 'Tam giác', 'Triangle', P3, 'Chọn ba đỉnh.', 'Select three vertices.', { basic: true }),
      T('triangleIso', 'Tam giác cân', 'Isosceles triangle', P2, 'Chọn hai đỉnh đáy; kéo đỉnh còn lại để đổi chiều cao.', 'Select the two base vertices; drag the apex to change the height.', { basic: true }),
      T('triangleRight', 'Tam giác vuông', 'Right triangle', P2, 'Chọn đỉnh góc vuông rồi một đỉnh khác.', 'Select the right-angle vertex, then another vertex.', { basic: true }),
      T('triangleRightIso', 'Tam giác vuông cân', 'Right isosceles triangle', P2, 'Chọn đỉnh góc vuông rồi một đỉnh khác.', 'Select the right-angle vertex, then another vertex.'),
      T('triangleEq', 'Tam giác đều', 'Equilateral triangle', P2, 'Chọn hai đỉnh.', 'Select two vertices.', { basic: true }),
      T('triangleSSS', 'Tam giác biết 3 cạnh', 'Triangle from 3 sides', ['point'], 'Chọn vị trí đỉnh A rồi nhập độ dài BC; CA; AB.', 'Select vertex A, then type BC; CA; AB.', {
        ask: { key: 'sss', vi: 'Độ dài các cạnh BC; CA; AB (cm)', en: 'Side lengths BC; CA; AB (cm)', initial: '5; 4; 3' },
      }),
      T('triangleSAS', 'Tam giác biết 2 cạnh và góc xen giữa', 'Triangle from 2 sides and the included angle', ['point'], 'Chọn vị trí đỉnh A rồi nhập AB; góc A; AC.', 'Select vertex A, then type AB; angle A; AC.', {
        ask: { key: 'sas', vi: 'AB (cm); góc A (độ); AC (cm)', en: 'AB (cm); angle A (degrees); AC (cm)', initial: '4; 60; 3' },
      }),
      T('triangleASA', 'Tam giác biết 1 cạnh và 2 góc kề', 'Triangle from a side and 2 angles', ['point'], 'Chọn vị trí đỉnh A rồi nhập AB; góc A; góc B.', 'Select vertex A, then type AB; angle A; angle B.', {
        ask: { key: 'asa', vi: 'AB (cm); góc A (độ); góc B (độ)', en: 'AB (cm); angle A (degrees); angle B (degrees)', initial: '5; 60; 45' },
      }),
      T('baseHeight', 'Đáy và chiều cao', 'Base and height', P3, 'Nhấp vào cạnh làm đáy (tam giác: chiều cao tự kẻ từ đỉnh đối diện).', 'Click the side used as base (triangles: the height comes from the opposite vertex).'),
      T('altitude', 'Đường cao', 'Altitude', P3, TRI_HINT_VI, TRI_HINT_EN, { basic: true }),
      T('median', 'Đường trung tuyến', 'Median', P3, TRI_HINT_VI, TRI_HINT_EN, { basic: true }),
      T('bisectorIn', 'Đường phân giác trong', 'Internal bisector', P3, TRI_HINT_VI, TRI_HINT_EN),
      T('midline', 'Đường trung bình', 'Midline', P3, 'Chọn đỉnh rồi hai đỉnh còn lại; đường trung bình song song với cạnh đối diện.', 'Select the vertex, then the other two; the midline is parallel to the opposite side.'),
      T('altitudes3', 'Ba đường cao và trực tâm', 'The three altitudes', P3, 'Nhấp vào bên trong tam giác.', 'Click inside the triangle.'),
      T('medians3', 'Ba trung tuyến và trọng tâm', 'The three medians', P3, 'Nhấp vào bên trong tam giác.', 'Click inside the triangle.'),
      T('bisectors3', 'Ba phân giác và tâm nội tiếp', 'The three bisectors', P3, 'Nhấp vào bên trong tam giác.', 'Click inside the triangle.'),
      T('centroid', 'Trọng tâm', 'Centroid', P3, 'Chọn ba đỉnh tam giác.', 'Select the three vertices.'),
      T('orthocenter', 'Trực tâm', 'Orthocentre', P3, 'Chọn ba đỉnh tam giác.', 'Select the three vertices.'),
      T('circumcircle', 'Đường tròn ngoại tiếp', 'Circumcircle', P3, 'Chọn ba đỉnh tam giác.', 'Select the three vertices.'),
      T('incircle', 'Đường tròn nội tiếp', 'Incircle', P3, 'Chọn ba đỉnh tam giác.', 'Select the three vertices.'),
    ],
  },
  {
    id: 'quads', vi: 'Tứ giác & đa giác', en: 'Quadrilaterals',
    tools: [
      T('polygon', 'Đa giác', 'Polygon', ['point'], 'Chọn lần lượt các đỉnh; nhấp lại đỉnh đầu, nhấp đúp hoặc bấm Xong để khép kín.', 'Select the vertices; click the first one again, double-click or press Done to close.', { basic: true }),
      T('polyline', 'Đường gấp khúc', 'Broken line', ['point'], 'Chọn lần lượt các điểm; nhấp đúp hoặc bấm Xong để kết thúc.', 'Select the points in turn; double-click or press Done to finish.', { basic: true }),
      T('square', 'Hình vuông', 'Square', P2, 'Chọn hai đỉnh kề nhau.', 'Select two adjacent vertices.', { basic: true }),
      T('rectangle', 'Hình chữ nhật', 'Rectangle', P2, 'Chọn hai đỉnh kề nhau; kéo đỉnh D để đổi chiều rộng.', 'Select two adjacent vertices; drag D to change the width.', { basic: true }),
      T('parallelogram', 'Hình bình hành', 'Parallelogram', P3, 'Chọn ba đỉnh liên tiếp A, B, C.', 'Select three consecutive vertices A, B, C.', { basic: true }),
      T('rhombus', 'Hình thoi', 'Rhombus', P2, 'Chọn hai đỉnh kề nhau; kéo đỉnh D để đổi góc.', 'Select two adjacent vertices; drag D to change the angle.'),
      T('trapezoid', 'Hình thang', 'Trapezoid', P3, 'Chọn hai đỉnh đáy A, B rồi đỉnh C của đáy kia.', 'Select base vertices A, B, then C on the other base.'),
      T('trapezoidIso', 'Hình thang cân', 'Isosceles trapezoid', P3, 'Chọn hai đỉnh đáy A, B rồi đỉnh C của đáy kia.', 'Select base vertices A, B, then C on the other base.'),
      T('trapezoidRight', 'Hình thang vuông', 'Right trapezoid', P2, 'Chọn hai đỉnh đáy A, B (vuông tại A).', 'Select base vertices A, B (right angle at A).'),
      T('diagonals', 'Hai đường chéo', 'Diagonals', ['quad'], 'Nhấp vào bên trong tứ giác: vẽ hai đường chéo, giao điểm O và các ký hiệu.', 'Click inside a quadrilateral: draws the diagonals, their intersection O and the marks.'),
      T('fraction', 'Chia phần và tô màu', 'Split and colour', ['fillable'], 'Nhấp vào bên trong hình (hình chữ nhật, hình vuông, tam giác, hình tròn…), rồi chọn số phần.', 'Click inside a shape, then choose the number of parts.', {
        ask: { key: 'frac', vi: 'Số phần; số phần tô màu; số hàng', en: 'Parts; coloured parts; rows', initial: '4; 1; 1' },
        basic: true,
      }),
      T('regularPolygon', 'Đa giác đều', 'Regular polygon', P2, 'Chọn hai đỉnh kề nhau rồi nhập số cạnh.', 'Select two adjacent vertices, then the number of sides.', {
        ask: { key: 'n', vi: 'Số cạnh', en: 'Number of sides', initial: '6' },
      }),
    ],
  },
  {
    id: 'circles', vi: 'Đường tròn', en: 'Circles',
    tools: [
      T('circle', 'Đường tròn (tâm, điểm)', 'Circle (centre, point)', P2, 'Chọn tâm rồi một điểm trên đường tròn.', 'Select the centre, then a point on the circle.', { basic: true }),
      T('circleR', 'Đường tròn (tâm, bán kính)', 'Circle (centre, radius)', ['point'], 'Chọn tâm rồi nhập bán kính.', 'Select the centre, then type the radius.', {
        ask: { key: 'r', vi: 'Bán kính (cm)', en: 'Radius (cm)', initial: '2' },
      }),
      T('circle3', 'Đường tròn qua 3 điểm', 'Circle through 3 points', P3, 'Chọn ba điểm.', 'Select three points.'),
      T('inscribedAngle', 'Góc ở tâm và góc nội tiếp', 'Central and inscribed angle', ['round'], 'Nhấp vào đường tròn: vẽ góc ở tâm AOB và góc nội tiếp AMB cùng chắn cung AB.', 'Click a circle: draws the central angle AOB and the inscribed angle AMB on the same arc.'),
      T('arc', 'Cung tròn', 'Arc', P3, 'Chọn tâm, điểm đầu, rồi điểm cuối (ngược chiều kim đồng hồ).', 'Select the centre, the start, then the end (counter-clockwise).'),
      T('sector', 'Hình quạt', 'Sector', P3, 'Chọn tâm, điểm đầu, rồi điểm cuối.', 'Select the centre, the start, then the end.'),
    ],
  },
  {
    id: 'measure', vi: 'Góc & ký hiệu', en: 'Angles & marks',
    tools: [
      T('angle', 'Ký hiệu góc', 'Angle mark', P3, 'Chọn ba điểm, điểm giữa là đỉnh góc. Sau đó ghi số đo (ví dụ 60°) hoặc tên góc ở bảng Thuộc tính.', 'Select three points; the middle one is the vertex. Then set its text (e.g. 60°) or name in Properties.', { basic: true }),
      T('angleLines', 'Góc giữa hai đường thẳng', 'Angle between lines', ['straight', 'straight'], 'Nhấp vào hai đường thẳng, ở phía cạnh góc cần đánh dấu.', 'Click two lines on the sides of the angle you want.'),
      T('angleFixed', 'Vẽ góc có số đo cho trước', 'Draw an angle of given size', ['point', 'point'], 'Nhấp chỗ ngọn tia thứ nhất (Ox), rồi đỉnh O, rồi nhập số đo: vẽ tia Oy tạo góc xOy.', 'Click where the first ray points (Ox), then the vertex O, then type the size: draws ray Oy for angle xOy.', {
        ask: { key: 'deg', vi: 'Số đo góc (độ)', en: 'Angle (degrees)', initial: '60' },
        basic: true,
      }),
      T('equalMark', 'Ký hiệu bằng nhau', 'Equal marks', ['segmentOrAngle'], 'Nhấp vào đoạn thẳng (thêm gạch) hoặc góc (thêm cung / gạch trên cung).', 'Click a segment (adds ticks) or an angle (adds arcs / strokes).', { basic: true }),
      T('measure', 'Hiện số đo', 'Show measure', ['measurable'], 'Nhấp vào đoạn thẳng, góc, đa giác hoặc đường tròn để hiện độ dài / số đo / diện tích.', 'Click a segment, angle, polygon or circle to show its length / size / area.'),
    ],
  },
  {
    id: 'solids', vi: 'Hình khối (3D)', en: 'Solids (3D)',
    tools: [
      T('cuboid', 'Hình hộp chữ nhật', 'Cuboid', ['point'], 'Nhấp chỗ đặt đỉnh A (góc trước, bên trái, ở dưới) rồi nhập kích thước.', 'Click where vertex A goes (front, left, bottom), then the sizes.', {
        ask: { key: 'box', vi: 'Dài; rộng; cao (cm)', en: 'Length; width; height (cm)', initial: '4; 3; 2,5' }, basic: true,
      }),
      T('cube', 'Hình lập phương', 'Cube', ['point'], 'Nhấp chỗ đặt đỉnh A rồi nhập độ dài cạnh.', 'Click where vertex A goes, then the edge.', {
        ask: { key: 'cube', vi: 'Cạnh (cm)', en: 'Edge (cm)', initial: '3' }, basic: true,
      }),
      T('prism3', 'Hình lăng trụ đứng tam giác', 'Triangular prism', ['point'], 'Nhấp chỗ đặt hình rồi nhập kích thước.', 'Click where it goes, then the sizes.', {
        ask: { key: 'prism', vi: 'Cạnh đáy; chiều sâu đáy; chiều cao (cm)', en: 'Base; depth; height (cm)', initial: '4; 3; 3,5' },
      }),
      T('pyramid3', 'Hình chóp tam giác', 'Triangular pyramid', ['point'], 'Nhấp chỗ đặt hình rồi nhập kích thước.', 'Click where it goes, then the sizes.', {
        ask: { key: 'pyr', vi: 'Cạnh đáy; chiều sâu đáy; chiều cao (cm)', en: 'Base; depth; height (cm)', initial: '4; 3; 4' },
      }),
      T('pyramid4', 'Hình chóp tứ giác', 'Square pyramid', ['point'], 'Nhấp chỗ đặt đỉnh A của đáy rồi nhập kích thước.', 'Click where base vertex A goes, then the sizes.', {
        ask: { key: 'pyr', vi: 'Đáy dài; đáy rộng; chiều cao (cm)', en: 'Base length; width; height (cm)', initial: '4; 3; 4' },
      }),
      T('cylinder', 'Hình trụ', 'Cylinder', ['point'], 'Nhấp chỗ đặt tâm đáy O rồi nhập bán kính và chiều cao.', 'Click the centre O of the base, then radius and height.', {
        ask: { key: 'round', vi: 'Bán kính; chiều cao (cm)', en: 'Radius; height (cm)', initial: '1,5; 3,5' }, basic: true,
      }),
      T('cone', 'Hình nón', 'Cone', ['point'], 'Nhấp chỗ đặt tâm đáy O rồi nhập bán kính và chiều cao.', 'Click the centre O of the base, then radius and height.', {
        ask: { key: 'round', vi: 'Bán kính; chiều cao (cm)', en: 'Radius; height (cm)', initial: '1,5; 3,5' },
      }),
      T('sphere', 'Hình cầu', 'Sphere', ['point'], 'Nhấp chỗ đặt tâm O rồi nhập bán kính.', 'Click the centre O, then the radius.', {
        ask: { key: 'ball', vi: 'Bán kính (cm)', en: 'Radius (cm)', initial: '2' }, basic: true,
      }),
    ],
  },
  {
    id: 'transform', vi: 'Biến hình', en: 'Transformations',
    tools: [
      T('reflectLine', 'Đối xứng trục', 'Reflect in line', ['object', 'straight'], 'Chọn hình rồi trục đối xứng.', 'Select the object, then the mirror line.'),
      T('reflectPoint', 'Đối xứng tâm', 'Reflect in point', ['object', 'point'], 'Chọn hình rồi tâm đối xứng.', 'Select the object, then the centre.'),
      T('rotate', 'Phép quay', 'Rotate', ['object', 'point'], 'Chọn hình, tâm quay, rồi nhập góc.', 'Select the object and the centre, then type the angle.', {
        ask: { key: 'deg', vi: 'Góc quay (độ, ngược chiều kim đồng hồ)', en: 'Angle (degrees, counter-clockwise)', initial: '90' },
      }),
      T('translate', 'Tịnh tiến', 'Translate', ['object', 'vector'], 'Chọn hình rồi vectơ tịnh tiến.', 'Select the object, then the vector.'),
      T('dilate', 'Vị tự', 'Dilate', ['object', 'point'], 'Chọn hình, tâm vị tự, rồi nhập tỉ số.', 'Select the object and the centre, then type the ratio.', {
        ask: { key: 'k', vi: 'Tỉ số k', en: 'Ratio k', initial: '2' },
      }),
    ],
  },
  {
    id: 'more', vi: 'Khác', en: 'More',
    tools: [
      T('text', 'Chữ', 'Text', ['point'], 'Nhấp vào chỗ cần ghi chữ.', 'Click where the text should go.', {
        ask: { key: 'text', vi: 'Nội dung', en: 'Text', initial: '' },
        basic: true,
      }),
      T('numberLine', 'Trục số', 'Number line', ['point'], 'Nhấp chỗ đặt trục số rồi chọn các số.', 'Click where the number line goes, then the numbers.', {
        ask: { key: 'numline', vi: 'Từ; đến; mỗi vạch; đánh dấu', en: 'From; to; step; marks', initial: '0; 10; 1; ' }, basic: true,
      }),
      T('function', 'Đồ thị hàm số', 'Function graph', [], 'Nhập hàm số, ví dụ x^2 - 2x + 1.', 'Type a function, e.g. x^2 - 2x + 1.', {
        ask: { key: 'expr', vi: 'y =', en: 'y =', initial: 'x^2 - 2x - 1' },
      }),
      T('delete', 'Xóa', 'Delete', ['object'], 'Nhấp vào đối tượng cần xóa (các đối tượng phụ thuộc cũng bị xóa).', 'Click an object to delete it (and what depends on it).', { basic: true }),
    ],
  },
];

export const ALL_TOOLS: ToolDef[] = TOOL_GROUPS.flatMap((g) => g.tools);

/** One-key shortcuts for the most used tools (Esc always returns to Move). */
export const TOOL_KEYS: Partial<Record<ToolId, string>> = {
  move: 'V', point: 'P', segment: 'S', line: 'L', ray: 'R', triangle: 'T', polygon: 'N',
  circle: 'O', angle: 'G', midpoint: 'M', intersect: 'I', perpendicular: 'K', parallel: 'H',
  equalMark: 'E', measure: 'Q', text: 'A', delete: 'D',
};
export const toolById = (id: ToolId) => ALL_TOOLS.find((t) => t.id === id)!;

/* --------------------------------- naming --------------------------------- */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Next unused point name: A…Z, then A1…Z1, A2… */
export function nextPointName(c: Construction, alsoUsed: Set<string> = new Set()): string {
  const used = new Set([...c.objects.map((o) => o.style.label).filter((x): x is string => !!x), ...alsoUsed]);
  for (let round = 0; ; round++) {
    for (const l of LETTERS) {
      const name = round ? `${l}${round}` : l;
      if (!used.has(name)) return name;
    }
  }
}

const RAY_LETTERS = 'xyztmnuvpq';

/** Next unused small letter for the end of a ray: x, y, z, t, m, n… then x1, y1… */
export function nextRayName(c: Construction, alsoUsed: Set<string> = new Set()): string {
  const used = new Set([...c.objects.map((o) => o.style.label).filter((x): x is string => !!x), ...alsoUsed]);
  for (let round = 0; ; round++) {
    for (const l of RAY_LETTERS) {
      const name = round ? `${l}${round}` : l;
      if (!used.has(name)) return name;
    }
  }
}

/** Next unused id with the given prefix (p1, l2, …). */
export function nextId(c: Construction, prefix: string, taken: Set<string> = new Set()): string {
  const ids = new Set([...c.objects.map((o) => o.id), ...taken]);
  for (let i = 1; ; i++) if (!ids.has(`${prefix}${i}`)) return `${prefix}${i}`;
}

export function primed(label: string | undefined): string | undefined {
  return label ? `${label}'` : undefined;
}

/* ------------------------------ value matching ------------------------------ */

/** Whether a computed value can satisfy a pick. */
export function matches(pick: Pick, v: Value | null, def: Def): boolean {
  if (!v) return false;
  switch (pick) {
    case 'point':
      return v.k === 'point';
    case 'straight':
      return v.k === 'straight';
    case 'vector':
      return v.k === 'straight' && v.kind === 'vector';
    case 'segment':
      return v.k === 'straight' && (v.kind === 'segment' || v.kind === 'vector');
    case 'segmentOrAngle':
      return (v.k === 'straight' && v.kind !== 'line') || v.k === 'angle';
    case 'ray':
      return v.k === 'straight' && v.kind === 'ray';
    case 'fillable':
      return v.k === 'polygon' || v.k === 'circle';
    case 'quad':
      return v.k === 'polygon' && v.pts.length === 4 && def.t === 'polygon';
    case 'measurable':
      return (v.k === 'straight' && (v.kind === 'segment' || v.kind === 'vector')) || v.k === 'angle' || v.k === 'polygon' || v.k === 'circle';
    case 'round':
      return v.k === 'circle' || v.k === 'arc';
    case 'curve':
      return v.k === 'straight' || v.k === 'circle' || v.k === 'arc' || v.k === 'polygon';
    case 'object':
      return v.k !== 'text' && v.k !== 'function' && def.t !== 'angle' && def.t !== 'angleLines';
  }
}

/* --------------------------------- creation -------------------------------- */

export interface CreateResult {
  objects: GeoObject[];
  /** Style changes to existing objects (equal marks, measures). */
  restyle?: { id: Id; style: Partial<Style> }[];
}

export interface CreateContext {
  /** Current values (needed by tools that measure, e.g. the default size of a template). */
  values?: Values;
  /** Click positions matching the picks (the angle between lines uses them to pick the sides). */
  clicks?: Vec[];
  /** Picked points that were created by those clicks (in empty space), not chosen from the figure. */
  fresh?: Id[];
  /** Angle mark: take the angle larger than 180° (the click was in that part). */
  reflex?: boolean;
  /** Midpoint of a side that was clicked: mark the two halves equal, as textbooks do. */
  halves?: boolean;
  /** Draw the compass arcs of ruler-and-compass constructions. */
  compass?: boolean;
}

/** Parses "3; 4; 5" or "3 4 5" / "3, 4, 5" into numbers ("2,5; 3": with semicolons a comma is a decimal mark). */
export function parseNumbers(s: string | undefined): number[] {
  const text = (s ?? '').trim();
  const parts = text.includes(';') ? text.split(';') : text.split(/[\s,]+/);
  return parts.map((x) => parseFloat(x.trim().replace(',', '.'))).filter((x) => Number.isFinite(x));
}

/**
 * Builds the objects for a completed tool. `picked` are object ids in pick order
 * (points already exist — the UI creates them on click). `answer` is the typed value.
 * Throws an Error with a user-facing message when the input is impossible.
 */
export function createFromTool(c: Construction, tool: ToolId, picked: Id[], answer?: string, ctx: CreateContext = {}): CreateResult {
  const taken = new Set<string>();
  const names = new Set<string>();
  const newId = (prefix: string) => {
    const v = nextId(c, prefix, taken);
    taken.add(v);
    return v;
  };
  const name = () => {
    const n = nextPointName(c, names);
    names.add(n);
    return n;
  };
  const objs: GeoObject[] = [];
  const add = (prefix: string, def: Def, style: Style = {}): Id => {
    const id = newId(prefix);
    objs.push({ id, def, style });
    return id;
  };
  const helper = (prefix: string, def: Def) => add(prefix, def, { hidden: true });
  const point = (def: Def, style: Style = {}) => add('p', def, { label: name(), ...style });
  const byId = new Map(c.objects.map((o) => [o.id, o]));
  const num = (fallback: number) => {
    const n = parseFloat((answer ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  };
  /** Distance between two existing points (for default template sizes). */
  const len = (p: Id, q: Id) => {
    const a = ctx.values?.get(p);
    const b = ctx.values?.get(q);
    return a?.k === 'point' && b?.k === 'point' ? Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) : 3;
  };
  const rightMark = (a: Id, v: Id, b: Id) => add('ang', { t: 'angle', a, b: v, c: b });
  /** Small-letter names for the ends of rays (Ox, Oy…). */
  const lower = (prefer?: string) => {
    const n = prefer && !names.has(prefer) && !(prefer in labelsOf(c)) ? prefer : nextRayName(c, names);
    names.add(n);
    return n;
  };
  const restyle: { id: Id; style: Partial<Style> }[] = [];
  const isFresh = (id: Id) => !!ctx.fresh?.includes(id);
  /** A vertex just placed for a new angle or ray is called O, as in xOy, when O is free. */
  const asOrigin = (id: Id) => {
    if (isFresh(id) && !('O' in labelsOf(c)) && !names.has('O')) {
      names.add('O');
      restyle.push({ id, style: { label: 'O' } });
    }
  };
  /** Turns a picked point into the end of a ray: no dot, a small letter. */
  const asTip = (id: Id) => restyle.push({ id, style: { label: lower(), dot: false } });
  const seg = (a: Id, b: Id, style: Style = {}) => add('s', { t: 'segment', a, b }, style);
  const result = (): CreateResult => (restyle.length ? { objects: objs, restyle } : { objects: objs });
  /** A short compass arc around `center` through `through` (thin, like pencil traces). */
  const compassArc = (center: Id, through: Id, span = 26) => add('cm', { t: 'compassMark', center, through, span }, { width: 0.9 });
  const pos = (id: Id): Vec | null => {
    const v = ctx.values?.get(id);
    return v?.k === 'point' ? v.p : null;
  };
  const [a, b, d] = picked;

  switch (tool) {
    /* ---------------- points ---------------- */
    case 'pointXY': {
      const [x, y] = parseNumbers(answer);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Cần nhập đủ hai số: hoành độ x và tung độ y (ví dụ x = 2, y = -1).');
      point({ t: 'point', x, y });
      return result();
    }
    case 'intersect':
      point({ t: 'intersection', a, b, index: 0 });
      if (twoSolutions(byId, a, b)) point({ t: 'intersection', a, b, index: 1 });
      return result();
    case 'midpoint': {
      const M = point({ t: 'midpoint', a, b });
      if (ctx.halves) {
        seg(a, M, { ticks: 1 });
        seg(M, b, { ticks: 1 });
      }
      return result();
    }
    case 'foot':
      point({ t: 'foot', point: a, line: b });
      return result();

    /* ---------------- lines ---------------- */
    case 'segment':
    case 'line':
    case 'vector':
      add(tool === 'segment' ? 's' : tool === 'vector' ? 'v' : 'l', { t: tool, a, b });
      return result();
    case 'oppositeRay': {
      const ray = byId.get(a);
      if (ray?.def.t !== 'ray') throw new Error('Hãy nhấp vào một tia (ví dụ tia Ox).');
      const tipObj = byId.get(ray.def.b);
      const tipLabel = tipObj?.style.label;
      const dotless = tipObj?.style.dot === false;
      const T2 = add('p', { t: 'image', of: ray.def.b, tr: { k: 'reflectPoint', center: ray.def.a } },
        dotless ? { label: tipLabel ? `${tipLabel}'` : lower(), dot: false } : { label: tipLabel ? `${tipLabel}'` : name() });
      add('l', { t: 'ray', a: ray.def.a, b: T2 });
      return result();
    }
    case 'ray':
      add('l', { t: 'ray', a, b });
      if (isFresh(b)) {
        asOrigin(a);
        asTip(b);
      }
      return result();
    case 'segmentLength': {
      const l = num(4);
      if (!(l > 0)) throw new Error('Độ dài phải lớn hơn 0 cm. Thử 4 cm nhé!');
      const q = point({ t: 'pointPolar', center: a, r: l, deg: 0 });
      seg(a, q);
      return result();
    }
    case 'perpendicular': {
      const l = add('l', { t: 'perpendicular', line: a, through: b });
      add('ang', { t: 'angleLines', l1: a, l2: l, s1: 1, s2: 1 }); // the square where they meet
      return result();
    }
    case 'parallel':
      add('l', { t: 'parallel', line: a, through: b });
      return result();
    case 'perpBisector': {
      const l = add('l', { t: 'perpBisector', a, b });
      const M = add('p', { t: 'midpoint', a, b }, { hidden: true });
      seg(a, M, { ticks: 1 });
      seg(M, b, { ticks: 1 });
      const ab = helper('l', { t: 'line', a, b });
      add('ang', { t: 'angleLines', l1: ab, l2: l, s1: 1, s2: 1 });
      if (ctx.compass) {
        // two circles of the same radius around A and B cross on the bisector
        const r = len(a, b) * 0.72;
        const c1 = helper('c', { t: 'circleR', center: a, r });
        const c2 = helper('c', { t: 'circleR', center: b, r });
        for (const index of [0, 1] as const) {
          const X = add('p', { t: 'intersection', a: c1, b: c2, index }, { hidden: true });
          compassArc(a, X);
          compassArc(b, X);
        }
      }
      return result();
    }
    case 'angleBisector': {
      // Ray Ot from the vertex, with the two equal halves marked.
      const bis = helper('l', { t: 'angleBisector', a, b, c: d });
      const tip = add('p', { t: 'pointOn', on: bis, param: Math.min(len(a, b), len(b, d)) * 0.9 }, { label: lower('t'), dot: false });
      add('l', { t: 'ray', a: b, b: tip });
      add('ang', { t: 'angle', a, b, c: tip }, { arcTicks: 1 });
      add('ang', { t: 'angle', a: tip, b, c: d }, { arcTicks: 1 });
      if (ctx.compass) {
        // an arc around the vertex cuts the sides at E and F; equal arcs from E and F meet on the bisector
        const r = Math.min(len(a, b), len(b, d)) * 0.45;
        const E = add('p', { t: 'image', of: a, tr: { k: 'dilate', center: b, factor: r / len(a, b) } }, { hidden: true });
        const F = add('p', { t: 'image', of: d, tr: { k: 'dilate', center: b, factor: r / len(b, d) } }, { hidden: true });
        compassArc(b, E, 18);
        compassArc(b, F, 18);
        const ce = helper('c', { t: 'circleR', center: E, r: r * 0.9 });
        const cf = helper('c', { t: 'circleR', center: F, r: r * 0.9 });
        // of the two crossings, the one away from the vertex
        const pv = pos(b);
        const farness = (k: 0 | 1) => {
          const v = computeAll({ ...c, objects: [...c.objects, ...objs, { id: '__x', def: { t: 'intersection', a: ce, b: cf, index: k }, style: {} }] }).get('__x');
          return v?.k === 'point' && pv ? dist(v.p, pv) : -1;
        };
        const T2 = add('p', { t: 'intersection', a: ce, b: cf, index: farness(1) > farness(0) ? 1 : 0 }, { hidden: true });
        compassArc(E, T2);
        compassArc(F, T2);
      }
      return result();
    }
    case 'tangent': {
      // a: the point, b: the circle. A point on the circle has one tangent, a point outside two.
      const circ = ctx.values?.get(b);
      const P = ctx.values?.get(a);
      const onCircle = circ && P && P.k === 'point' && (circ.k === 'circle' || circ.k === 'arc') && Math.abs(dist(P.p, circ.c) - circ.r) < 1e-6;
      const centreDef = byId.get(b)?.def;
      const centre = centreDef && (centreDef.t === 'circle' || centreDef.t === 'circleR' || centreDef.t === 'arc') ? centreDef.center : null;
      for (const index of onCircle ? [0] : [0, 1]) {
        const l = add('l', { t: 'tangent', through: a, circle: b, index: index as 0 | 1 });
        if (!centre) continue;
        // the contact point, the radius to it and the right angle there
        const T1 = onCircle ? a : point({ t: 'foot', point: centre, line: l });
        seg(centre, T1, { dash: 'dashed' });
        const other = onCircle ? add('p', { t: 'pointOn', on: l, param: 1 }, { hidden: true }) : a;
        rightMark(centre, T1, other);
      }
      return result();
    }
    case 'crossLines': {
      // xx' and yy' crossing at O, the four angles numbered (vertical and adjacent angles)
      asOrigin(a);
      const x = add('p', { t: 'pointPolar', center: a, r: 3, deg: 15 }, { label: lower('x'), dot: false });
      const y = add('p', { t: 'pointPolar', center: a, r: 3, deg: 115 }, { label: lower('y'), dot: false });
      const lx = objs.find((o) => o.id === x)!.style.label!;
      const ly = objs.find((o) => o.id === y)!.style.label!;
      const x2 = add('p', { t: 'image', of: x, tr: { k: 'reflectPoint', center: a } }, { label: `${lx}'`, dot: false });
      const y2 = add('p', { t: 'image', of: y, tr: { k: 'reflectPoint', center: a } }, { label: `${ly}'`, dot: false });
      add('l', { t: 'line', a: x2, b: x });
      add('l', { t: 'line', a: y2, b: y });
      [[x, y], [y, x2], [x2, y2], [y2, x]].forEach(([p1, p2], i) => add('ang', { t: 'angle', a: p1, b: a, c: p2 }, { label: String(i + 1), showLabel: true, arcs: 0 }));
      return result();
    }
    case 'parallelTransversal': {
      // a ∥ b cut by c at A and B; the angles at A and B numbered 1–4 (corresponding, alternate…)
      const at = ctx.values?.get(a);
      const o = at?.k === 'point' ? at.p : { x: 0, y: 0 };
      // the ends of the lines: draggable, but without a dot or a name
      const free = (dx: number, dy: number) => add('p', { t: 'point', x: Math.round((o.x + dx) * 100) / 100, y: Math.round((o.y + dy) * 100) / 100 }, { dot: false, showLabel: false });
      // the clicked point only placed the figure
      if (isFresh(a)) restyle.push({ id: a, style: { hidden: true } });
      const a1 = free(-3.5, 1.2);
      const a2 = free(3.5, 1.2);
      const la = add('l', { t: 'line', a: a1, b: a2 }, { label: 'a', showLabel: true });
      const b1 = free(-3.5, -1.2);
      const lb = add('l', { t: 'parallel', line: la, through: b1 }, { label: 'b', showLabel: true });
      const b2 = add('p', { t: 'pointOn', on: lb, param: 7 }, { hidden: true });
      const c1 = free(1.3, 3);
      const c2 = free(-1.3, -3);
      const lc = add('l', { t: 'line', a: c2, b: c1 }, { label: 'c', showLabel: true });
      const A = point({ t: 'intersection', a: la, b: lc, index: 0 }, { label: 'A' in labelsOf(c) || names.has('A') ? undefined : 'A' });
      const B = point({ t: 'intersection', a: lb, b: lc, index: 0 }, { label: 'B' in labelsOf(c) || names.has('B') ? undefined : 'B' });
      fixLabels(objs, c);
      const number = (v: Id, right: Id, up: Id, left: Id, down: Id) =>
        [[right, up], [up, left], [left, down], [down, right]].forEach(([p1, p2], i) => add('ang', { t: 'angle', a: p1, b: v, c: p2 }, { label: String(i + 1), showLabel: true, arcs: 0 }));
      number(A, a2, c1, a1, B);
      number(B, b2, A, b1, c2);
      return result();
    }

    /* ---------------- triangles ---------------- */
    case 'triangle':
      add('poly', { t: 'polygon', pts: [a, b, d] });
      return result();
    case 'triangleIso': {
      // Base a–b; apex on the hidden perpendicular bisector (keeps the triangle isosceles).
      const bis = helper('l', { t: 'perpBisector', a, b });
      const apex = point({ t: 'pointOn', on: bis, param: len(a, b) * 0.9 });
      add('poly', { t: 'polygon', pts: [a, b, apex] });
      seg(apex, a, { ticks: 1 });
      seg(apex, b, { ticks: 1 });
      return result();
    }
    case 'triangleRight': {
      const ab = helper('l', { t: 'line', a, b });
      const perp = helper('l', { t: 'perpendicular', line: ab, through: a });
      const c3 = point({ t: 'pointOn', on: perp, param: len(a, b) * 0.75 });
      add('poly', { t: 'polygon', pts: [a, b, c3] });
      rightMark(b, a, c3);
      return result();
    }
    case 'triangleRightIso': {
      const c3 = point({ t: 'image', of: b, tr: { k: 'rotate', center: a, deg: 90 } });
      add('poly', { t: 'polygon', pts: [a, b, c3] });
      rightMark(b, a, c3);
      seg(a, b, { ticks: 1 });
      seg(a, c3, { ticks: 1 });
      return result();
    }
    case 'triangleEq': {
      const poly = add('poly', { t: 'regularPolygon', a, b, n: 3 });
      point({ t: 'polyVertex', poly, i: 2 });
      return result();
    }
    case 'triangleSSS': {
      const [la, lb, lc] = parseNumbers(answer);
      if (![la, lb, lc].every((x) => x > 0)) throw new Error('Cần nhập đủ ba cạnh, mỗi cạnh lớn hơn 0 cm (ví dụ 5, 4, 3).');
      if (la + lb <= lc || la + lc <= lb || lb + lc <= la) {
        const sides = [la, lb, lc].sort((x, y) => y - x);
        const f = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');
        throw new Error(
          `Ba cạnh này không ghép được thành tam giác: cạnh dài nhất (${f(sides[0])} cm) phải ngắn hơn tổng hai cạnh kia (${f(sides[1] + sides[2])} cm) — bất đẳng thức tam giác. Hãy cho cạnh dài nhất nhỏ hơn ${f(sides[1] + sides[2])} cm.`,
        );
      }
      const B = point({ t: 'pointPolar', center: a, r: lc, deg: 0 });
      const ca = helper('c', { t: 'circleR', center: a, r: lb });
      const cb = helper('c', { t: 'circleR', center: B, r: la });
      const C = point({ t: 'intersection', a: ca, b: cb, index: 0 });
      add('poly', { t: 'polygon', pts: [a, B, C] });
      if (ctx.compass) {
        compassArc(a, C);
        compassArc(B, C);
      }
      return result();
    }
    case 'triangleSAS': {
      const [ab, deg, ac] = parseNumbers(answer);
      if (!(ab > 0 && ac > 0)) throw new Error('Cần nhập hai cạnh (lớn hơn 0 cm) và góc xen giữa (ví dụ AB = 4, góc A = 60°, AC = 3).');
      if (!(deg > 0 && deg < 180)) throw new Error('Góc của tam giác phải lớn hơn 0° và nhỏ hơn 180°. Thử 60° nhé!');
      const B = point({ t: 'pointPolar', center: a, r: ab, deg: 0 });
      // C: B turned about A by the angle, then scaled to AC (dragging B turns the whole triangle).
      const turned = add('p', { t: 'image', of: B, tr: { k: 'rotate', center: a, deg } }, { hidden: true });
      const C = point({ t: 'image', of: turned, tr: { k: 'dilate', center: a, factor: ac / ab } });
      add('poly', { t: 'polygon', pts: [a, B, C] });
      add('ang', { t: 'angle', a: B, b: a, c: C }, { showValue: true });
      return result();
    }
    case 'triangleASA': {
      const [ab, degA, degB] = parseNumbers(answer);
      if (!(ab > 0)) throw new Error('Cần nhập cạnh AB (lớn hơn 0 cm) và hai góc kề (ví dụ AB = 5, góc A = 60°, góc B = 45°).');
      if (!(degA > 0 && degB > 0) || degA + degB >= 180) throw new Error(`Tổng ba góc của tam giác là 180°, nên góc A + góc B phải nhỏ hơn 180° (đang là ${Math.round((degA + degB) * 100) / 100}°). Hãy giảm một góc.`);
      const B = point({ t: 'pointPolar', center: a, r: ab, deg: 0 });
      const ra = add('p', { t: 'image', of: B, tr: { k: 'rotate', center: a, deg: degA } }, { hidden: true });
      const rb = add('p', { t: 'image', of: a, tr: { k: 'rotate', center: B, deg: -degB } }, { hidden: true });
      const la = helper('l', { t: 'line', a, b: ra });
      const lb = helper('l', { t: 'line', a: B, b: rb });
      const C = point({ t: 'intersection', a: la, b: lb, index: 0 });
      add('poly', { t: 'polygon', pts: [a, B, C] });
      add('ang', { t: 'angle', a: B, b: a, c: C }, { showValue: true });
      add('ang', { t: 'angle', a, b: B, c: C }, { showValue: true });
      return result();
    }
    case 'baseHeight': {
      // a, b: the base; d: the vertex the height comes from
      const ab = helper('l', { t: 'line', a, b });
      const H = point({ t: 'foot', point: d, line: ab }, { label: 'H' in labelsOf(c) || names.has('H') ? undefined : 'H' });
      fixLabels(objs, c);
      seg(d, H, { dash: 'dashed' });
      // when the foot is outside the base (obtuse triangle) the base is extended, dashed
      const A = ctx.values?.get(a);
      const Bv = ctx.values?.get(b);
      const D = ctx.values?.get(d);
      let far = b;
      if (A?.k === 'point' && Bv?.k === 'point' && D?.k === 'point') {
        const L = dist(A.p, Bv.p);
        const u = { x: (Bv.p.x - A.p.x) / L, y: (Bv.p.y - A.p.y) / L };
        const t = (D.p.x - A.p.x) * u.x + (D.p.y - A.p.y) * u.y;
        if (t < -1e-6) seg(a, H, { dash: 'dashed' });
        if (t > L + 1e-6) seg(b, H, { dash: 'dashed' });
        far = Math.abs(t) > Math.abs(L - t) ? a : b;
      }
      rightMark(d, H, far);
      return result();
    }
    case 'altitudes3':
    case 'medians3':
    case 'bisectors3': {
      // the three lines from each vertex, then the point where they meet
      const one: ToolId = tool === 'altitudes3' ? 'altitude' : tool === 'medians3' ? 'median' : 'bisectorIn';
      let cc = c;
      const made: GeoObject[] = [];
      for (const [v, p1, p2] of [[a, b, d], [b, d, a], [d, a, b]]) {
        const r = createFromTool(cc, one, [v, p1, p2], undefined, { values: computeAll(cc) });
        made.push(...r.objects);
        cc = { ...cc, objects: [...cc.objects, ...r.objects] };
      }
      const kind = tool === 'altitudes3' ? 'orthocenter' : tool === 'medians3' ? 'centroid' : 'incenter';
      const want = tool === 'altitudes3' ? 'H' : tool === 'medians3' ? 'G' : 'I';
      const used = new Set(cc.objects.map((o) => o.style.label));
      made.push({ id: nextId(cc, 'p'), def: { t: 'center', kind, a, b, c: d }, style: { label: used.has(want) ? nextPointName(cc) : want } });
      return { objects: made };
    }
    case 'altitude': {
      const bc = helper('l', { t: 'line', a: b, b: d });
      const H = point({ t: 'foot', point: a, line: bc });
      seg(a, H);
      rightMark(a, H, d);
      return result();
    }
    case 'median': {
      const M = point({ t: 'midpoint', a: b, b: d });
      seg(a, M);
      seg(b, M, { ticks: 1 });
      seg(M, d, { ticks: 1 });
      return result();
    }
    case 'bisectorIn': {
      const bis = helper('l', { t: 'angleBisector', a: b, b: a, c: d });
      const bc = helper('l', { t: 'line', a: b, b: d });
      const D = point({ t: 'intersection', a: bis, b: bc, index: 0 });
      seg(a, D);
      add('ang', { t: 'angle', a: b, b: a, c: D }, { arcTicks: 1 });
      add('ang', { t: 'angle', a: D, b: a, c: d }, { arcTicks: 1 });
      return result();
    }
    case 'midline': {
      const M = point({ t: 'midpoint', a, b });
      const N = point({ t: 'midpoint', a, b: d });
      seg(M, N);
      return result();
    }
    case 'centroid':
      point({ t: 'center', kind: 'centroid', a, b, c: d }, { label: 'G' in labelsOf(c) ? undefined : 'G' });
      fixLabels(objs, c);
      return result();
    case 'orthocenter':
      point({ t: 'center', kind: 'orthocenter', a, b, c: d }, { label: 'H' in labelsOf(c) ? undefined : 'H' });
      fixLabels(objs, c);
      return result();
    case 'circumcircle':
      point({ t: 'center', kind: 'circumcenter', a, b, c: d }, { label: 'O' in labelsOf(c) ? undefined : 'O' });
      fixLabels(objs, c);
      add('c', { t: 'circle3', a, b, c: d });
      return result();
    case 'incircle':
      point({ t: 'center', kind: 'incenter', a, b, c: d }, { label: 'I' in labelsOf(c) ? undefined : 'I' });
      fixLabels(objs, c);
      add('c', { t: 'incircle', a, b, c: d });
      return result();

    /* ---------------- quadrilaterals ---------------- */
    case 'polygon':
      add('poly', { t: 'polygon', pts: picked });
      return result();
    case 'polyline':
      for (let i = 0; i + 1 < picked.length; i++) seg(picked[i], picked[i + 1]);
      return result();
    case 'square':
    case 'regularPolygon': {
      const n = tool === 'square' ? 4 : Math.max(3, Math.min(20, Math.round(num(6))));
      const poly = add('poly', { t: 'regularPolygon', a, b, n });
      for (let i = 2; i < n; i++) point({ t: 'polyVertex', poly, i });
      return result();
    }
    case 'rectangle': {
      const ab = helper('l', { t: 'line', a, b });
      const perp = helper('l', { t: 'perpendicular', line: ab, through: a });
      const v = helper('v', { t: 'vector', a, b });
      const C = point({ t: 'pointOn', on: perp, param: 0 }); // placeholder, fixed below
      const D = point({ t: 'pointOn', on: perp, param: len(a, b) * 0.6 });
      // C = D + AB (a translated copy keeps the opposite sides parallel and equal)
      objs.find((o) => o.id === C)!.def = { t: 'image', of: D, tr: { k: 'translate', vector: v } };
      moveAfter(objs, C, D);
      add('poly', { t: 'polygon', pts: [a, b, C, D] });
      rightMark(b, a, D);
      return result();
    }
    case 'diagonals': {
      const poly = byId.get(a)?.def;
      if (poly?.t !== 'polygon' || poly.pts.length !== 4) throw new Error('Hãy nhấp vào bên trong một tứ giác.');
      const [A, B, C, D] = poly.pts;
      const l1 = helper('l', { t: 'line', a: A, b: C });
      const l2 = helper('l', { t: 'line', a: B, b: D });
      const O = point({ t: 'intersection', a: l1, b: l2, index: 0 }, { label: 'O' in labelsOf(c) || names.has('O') ? undefined : 'O' });
      fixLabels(objs, c);
      // marks from the current shape: halves equal (parallelogram), all four equal (rectangle), right angle (rhombus)
      const P = [A, B, C, D].map((id) => ctx.values?.get(id));
      let t1 = 0;
      let t2 = 0;
      let right = false;
      if (P.every((q) => q?.k === 'point')) {
        const [pa, pb, pc, pd] = P.map((q) => (q as Extract<Value, { k: 'point' }>).p);
        const mid1 = { x: (pa.x + pc.x) / 2, y: (pa.y + pc.y) / 2 };
        const mid2 = { x: (pb.x + pd.x) / 2, y: (pb.y + pd.y) / 2 };
        const scale = Math.max(dist(pa, pc), dist(pb, pd));
        const bisect = dist(mid1, mid2) < 1e-6 * (1 + scale);
        const equal = Math.abs(dist(pa, pc) - dist(pb, pd)) < 1e-6 * (1 + scale);
        right = Math.abs(dot(sub(pc, pa), sub(pd, pb))) < 1e-6 * (1 + scale * scale);
        if (bisect) {
          t1 = 1;
          t2 = equal ? 1 : 2;
        }
      }
      seg(A, O, { ticks: t1 });
      seg(O, C, { ticks: t1 });
      seg(B, O, { ticks: t2 });
      seg(O, D, { ticks: t2 });
      if (right) rightMark(A, O, B);
      return result();
    }
    case 'fraction': {
      const [n, m, rows] = parseNumbers(answer);
      const parts = Math.round(n ?? 4);
      const r = Math.max(1, Math.round(rows ?? 1));
      const shape = ctx.values?.get(a);
      if (!(parts >= 1 && parts <= 60)) throw new Error('Số phần phải từ 1 đến 60. Thử 4 phần nhé!');
      const isQuad = shape?.k === 'polygon' && shape.pts.length === 4;
      const total = parts * (isQuad ? r : 1);
      const filled = Math.max(0, Math.min(total, Math.round(m ?? 0)));
      add('frac', { t: 'fraction', of: a, n: parts, ...(isQuad && r > 1 ? { rows: r } : {}), filled: Array.from({ length: filled }, (_, i) => i) });
      return result();
    }
    case 'parallelogram': {
      // a, b, d are A, B, C; D = A + (C − B)
      const v = helper('v', { t: 'vector', a: b, b: d });
      const D = point({ t: 'image', of: a, tr: { k: 'translate', vector: v } });
      add('poly', { t: 'polygon', pts: [a, b, d, D] });
      return result();
    }
    case 'rhombus': {
      const circ = helper('c', { t: 'circle', center: a, through: b });
      const v = helper('v', { t: 'vector', a, b });
      const base = angleBetween(ctx.values, a, b);
      const C = point({ t: 'point', x: 0, y: 0 }); // placeholder, fixed below
      const D = point({ t: 'pointOn', on: circ, param: base + Math.PI / 3 });
      objs.find((o) => o.id === C)!.def = { t: 'image', of: D, tr: { k: 'translate', vector: v } };
      moveAfter(objs, C, D);
      add('poly', { t: 'polygon', pts: [a, b, C, D] });
      for (const [p, q] of [[a, b], [b, C], [C, D], [D, a]] as const) seg(p, q, { ticks: 1 });
      return result();
    }
    case 'trapezoid': {
      const ab = helper('l', { t: 'line', a, b });
      const par = helper('l', { t: 'parallel', line: ab, through: d });
      const D = point({ t: 'pointOn', on: par, param: -len(a, b) * 0.6 });
      add('poly', { t: 'polygon', pts: [a, b, d, D] });
      return result();
    }
    case 'trapezoidIso': {
      const bis = helper('l', { t: 'perpBisector', a, b });
      const D = point({ t: 'image', of: d, tr: { k: 'reflectLine', line: bis } });
      add('poly', { t: 'polygon', pts: [a, b, d, D] });
      seg(a, D, { ticks: 1 });
      seg(b, d, { ticks: 1 });
      return result();
    }
    case 'trapezoidRight': {
      const ab = helper('l', { t: 'line', a, b });
      const perp = helper('l', { t: 'perpendicular', line: ab, through: a });
      const C = point({ t: 'point', x: 0, y: 0 }); // placeholder, fixed below
      const D = point({ t: 'pointOn', on: perp, param: len(a, b) * 0.6 });
      const par = helper('l', { t: 'parallel', line: ab, through: D });
      objs.find((o) => o.id === C)!.def = { t: 'pointOn', on: par, param: len(a, b) * 0.6 };
      moveAfter(objs, C, par);
      add('poly', { t: 'polygon', pts: [a, b, C, D] });
      rightMark(b, a, D);
      rightMark(a, D, C);
      return result();
    }

    /* ---------------- circles ---------------- */
    case 'circle':
      add('c', { t: 'circle', center: a, through: b });
      return result();
    case 'circleR':
      add('c', { t: 'circleR', center: a, r: Math.max(0.05, num(2)) });
      return result();
    case 'circle3':
      add('c', { t: 'circle3', a, b, c: d });
      return result();
    case 'arc':
    case 'sector':
      add('c', { t: tool, center: a, a: b, b: d });
      return result();
    case 'inscribedAngle': {
      // the centre O (made if the circle has none), A, B and M on the circle
      const cd = byId.get(a)?.def;
      let O: Id;
      if (cd && (cd.t === 'circle' || cd.t === 'circleR')) O = cd.center;
      else if (cd && (cd.t === 'circle3' || cd.t === 'incircle')) {
        O = point({ t: 'center', kind: cd.t === 'circle3' ? 'circumcenter' : 'incenter', a: cd.a, b: cd.b, c: cd.c }, { label: 'O' in labelsOf(c) || names.has('O') ? undefined : 'O' });
        fixLabels(objs, c);
      } else throw new Error('Hãy nhấp vào một đường tròn.');
      const A = point({ t: 'pointOn', on: a, param: -0.45 });
      const B = point({ t: 'pointOn', on: a, param: Math.PI + 0.45 });
      const M = point({ t: 'pointOn', on: a, param: Math.PI / 2 + 0.35 }, { label: 'M' in labelsOf(c) || names.has('M') ? undefined : 'M' });
      fixLabels(objs, c);
      seg(O, A);
      seg(O, B);
      seg(M, A);
      seg(M, B);
      add('ang', { t: 'angle', a: A, b: O, c: B }, { showValue: true });
      add('ang', { t: 'angle', a: A, b: M, c: B }, { showValue: true });
      return result();
    }

    /* ---------------- angles & marks ---------------- */
    case 'angle':
      add('ang', { t: 'angle', a, b, c: d, ...(ctx.reflex ? { reflex: true } : {}) });
      return result();
    case 'angleLines': {
      const l1 = ctx.values?.get(a);
      const l2 = ctx.values?.get(b);
      const [k1, k2] = ctx.clicks ?? [];
      let s1: 1 | -1 = 1;
      let s2: 1 | -1 = 1;
      if (l1?.k === 'straight' && l2?.k === 'straight' && k1 && k2) {
        // The side of each line the user clicked on, seen from the intersection.
        const x = intersectionOf(l1, l2);
        if (x) {
          s1 = dot(sub(k1, x), l1.d) >= 0 ? 1 : -1;
          s2 = dot(sub(k2, x), l2.d) >= 0 ? 1 : -1;
        }
      }
      add('ang', { t: 'angleLines', l1: a, l2: b, s1, s2 });
      return result();
    }
    case 'angleFixed': {
      // a: point on the first side, b: vertex
      const deg = num(60);
      if (!(deg > 0 && deg < 360)) throw new Error('Số đo góc phải lớn hơn 0° và nhỏ hơn 360°. Thử 60° nhé!');
      asOrigin(b);
      if (isFresh(a)) asTip(a);
      const A2 = add('p', { t: 'image', of: a, tr: { k: 'rotate', center: b, deg } }, { label: lower(), dot: false });
      add('l', { t: 'ray', a: b, b: a });
      add('l', { t: 'ray', a: b, b: A2 });
      add('ang', { t: 'angle', a, b, c: A2, reflex: deg > 180 ? true : undefined }, { showValue: true });
      return result();
    }
    case 'equalMark': {
      const o = byId.get(a)!;
      if (o.def.t === 'angle' || o.def.t === 'angleLines') {
        // Cycle: 1 arc → 2 arcs → 3 arcs → 1 arc with a stroke → 1 arc with 2 strokes → back
        const arcs = o.style.arcs ?? 1;
        const ticks = o.style.arcTicks ?? 0;
        const order: [number, number][] = [[1, 0], [2, 0], [3, 0], [1, 1], [1, 2], [1, 3]];
        const i = order.findIndex(([x, y]) => x === arcs && y === ticks);
        const [na, nt] = order[(i + 1) % order.length];
        return { objects: [], restyle: [{ id: a, style: { arcs: na, arcTicks: nt } }] };
      }
      return { objects: [], restyle: [{ id: a, style: { ticks: ((o.style.ticks ?? 0) + 1) % 4 } }] };
    }
    case 'measure':
      return { objects: [], restyle: [{ id: a, style: { showValue: !byId.get(a)!.style.showValue } }] };

    /* ---------------- transformations ---------------- */
    case 'reflectLine':
    case 'reflectPoint':
    case 'rotate':
    case 'translate':
    case 'dilate': {
      const tr: Transform =
        tool === 'reflectLine' ? { k: 'reflectLine', line: b }
        : tool === 'reflectPoint' ? { k: 'reflectPoint', center: b }
        : tool === 'rotate' ? { k: 'rotate', center: b, deg: num(90) }
        : tool === 'translate' ? { k: 'translate', vector: b }
        : { k: 'dilate', center: b, factor: num(2) };
      for (const o of imageOf(byId, a, tr, (prefix, def, style) => {
        const id = newId(prefix);
        return { id, def, style: style ?? {} };
      })) objs.push(o);
      return result();
    }
    case 'numberLine': {
      const parts = (answer ?? '').split(';').map((x) => x.trim());
      const num = (x: string | undefined, fallback: number) => {
        const v = parseFloat((x ?? '').replace(',', '.').replace('−', '-'));
        return Number.isFinite(v) ? v : fallback;
      };
      const from = num(parts[0], 0);
      const to = num(parts[1], 10);
      const step = Math.abs(num(parts[2], 1)) || 1;
      if (!(to > from)) throw new Error('Số cuối phải lớn hơn số đầu (ví dụ từ 0 đến 10).');
      const n = Math.round((to - from) / step);
      if (n > 40) throw new Error('Trục số này có ' + n + ' vạch, nhiều quá. Hãy tăng khoảng cách mỗi vạch (ví dụ 5 hoặc 10).');
      const marks = (parts[3] ?? '').split(/[\s,]+/).map((x) => parseFloat(x.replace('−', '-'))).filter((x) => Number.isFinite(x) && x >= from && x <= to);
      const at = pos(a) ?? { x: 0, y: 0 };
      const unit = Math.min(1.5, 14 / Math.max(1, n));
      add('nl', { t: 'numberLine', x: at.x, y: at.y, from, to, step, unit: Math.round(unit * 100) / 100, marks });
      if (isFresh(a)) restyle.push({ id: a, style: { hidden: true } });
      return result();
    }
    case 'cuboid':
    case 'cube':
    case 'prism3':
    case 'pyramid3':
    case 'pyramid4':
    case 'cylinder':
    case 'cone':
    case 'sphere': {
      const nums = parseNumbers(answer);
      const kind = tool as SolidKind;
      let w: number;
      let dd: number;
      let h: number;
      if (kind === 'cube') w = dd = h = nums[0];
      else if (kind === 'cylinder' || kind === 'cone') {
        w = nums[0] * 2;
        dd = 0;
        h = nums[1];
      } else if (kind === 'sphere') {
        w = nums[0] * 2;
        dd = 0;
        h = nums[0] * 2;
      } else [w, dd, h] = nums;
      if (![w, h].every((x) => x > 0) || !(dd >= 0)) throw new Error('Các kích thước phải là số lớn hơn 0 (ví dụ 4; 3; 2,5).');
      const sid = add('sol', { t: 'solid', kind, at: a, w, d: dd, h });
      // vertex names as in textbooks: ABCD.A'B'C'D', S.ABCD, S.ABC, ABC.A'B'C', O / O', O / S
      const anchorLabel = byId.get(a)?.style.label;
      const own = (pref?: string) => {
        // the point just clicked already carries a name; it does not count as taken
        const taken = pref !== undefined && pref in labelsOf(c) && !(isFresh(a) && anchorLabel === pref);
        if (pref && !taken && !names.has(pref)) {
          names.add(pref);
          return pref;
        }
        return name();
      };
      const v = (i: number, label: string) => add('p', { t: 'solidVertex', solid: sid, i }, { label });
      if (kind === 'cuboid' || kind === 'cube' || kind === 'pyramid4') {
        // the anchor is vertex A
        const A = isFresh(a) || !anchorLabel ? own('A') : anchorLabel;
        if (isFresh(a) || !anchorLabel) restyle.push({ id: a, style: { label: A } });
        const B = own('B');
        const C = own('C');
        const D = own('D');
        v(1, B);
        v(2, C);
        v(3, D);
        if (kind === 'pyramid4') v(4, own('S'));
        else [A, B, C, D].forEach((l, i) => v(4 + i, l + "'"));
      } else if (kind === 'prism3' || kind === 'pyramid3') {
        // the anchor only places the solid
        if (isFresh(a)) restyle.push({ id: a, style: { hidden: true } });
        const A = own('A');
        const B = own('B');
        const C = own('C');
        v(0, A);
        v(1, B);
        v(2, C);
        if (kind === 'prism3') [A, B, C].forEach((l, i) => v(3 + i, l + "'"));
        else v(3, own('S'));
      } else {
        // round solids: the anchor is the centre O
        const O = isFresh(a) || !anchorLabel ? own('O') : anchorLabel;
        if (isFresh(a) || !anchorLabel) restyle.push({ id: a, style: { label: O } });
        if (kind === 'cylinder') v(1, O + "'");
        if (kind === 'cone') v(1, own('S'));
      }
      return result();
    }
    case 'function':
      add('f', { t: 'function', expr: answer ?? 'x' }, { label: `y = ${answer ?? 'x'}`, showLabel: false });
      return result();
    default:
      return result();
  }
}

/* --------------------------------- helpers --------------------------------- */

function labelsOf(c: Construction): Record<string, true> {
  const out: Record<string, true> = {};
  for (const o of c.objects) if (o.style.label) out[o.style.label] = true;
  return out;
}

/** Points created with label `undefined` (preferred name taken) get the next free name. */
function fixLabels(objs: GeoObject[], c: Construction): void {
  for (const o of objs) if (isPointDef(o.def) && !o.style.label) o.style.label = nextPointName(c, new Set(objs.map((x) => x.style.label).filter((x): x is string => !!x)));
}

/** Moves object `id` to just after `after` (definitions must only reference earlier objects). */
function moveAfter(objs: GeoObject[], id: Id, after: Id): void {
  const i = objs.findIndex((o) => o.id === id);
  const [o] = objs.splice(i, 1);
  objs.splice(objs.findIndex((x) => x.id === after) + 1, 0, o);
}

function angleBetween(values: Values | undefined, a: Id, b: Id): number {
  const p = values?.get(a);
  const q = values?.get(b);
  return p?.k === 'point' && q?.k === 'point' ? Math.atan2(q.p.y - p.p.y, q.p.x - p.p.x) : 0;
}

function intersectionOf(l1: Extract<Value, { k: 'straight' }>, l2: Extract<Value, { k: 'straight' }>): Vec | null {
  const den = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
  if (Math.abs(den) < 1e-12) return null;
  const w = sub(l2.a, l1.a);
  const t = (w.x * l2.d.y - w.y * l2.d.x) / den;
  return { x: l1.a.x + l1.d.x * t, y: l1.a.y + l1.d.y * t };
}

function twoSolutions(byId: Map<Id, GeoObject>, a: Id, b: Id): boolean {
  const round = (id: Id) => ['circle', 'circleR', 'circle3', 'incircle', 'arc', 'sector'].includes(byId.get(id)?.def.t ?? '');
  return round(a) || round(b);
}

/**
 * The image of an object under a transformation. Points get primed names; for
 * segments and polygons the images of their vertices are created too, so A'B'C'
 * can be labelled and reused.
 */
function imageOf(
  byId: Map<Id, GeoObject>,
  of: Id,
  tr: Transform,
  obj: (prefix: string, def: Def, style?: Style) => GeoObject,
): GeoObject[] {
  const src = byId.get(of);
  if (!src) return [];
  if (isPointDef(src.def)) return [obj('p', { t: 'image', of, tr }, { label: primed(src.style.label) })];
  const def = src.def;
  const vertexIds: Id[] | null =
    def.t === 'polygon' ? def.pts : def.t === 'segment' || def.t === 'vector' || def.t === 'ray' || def.t === 'line' ? [def.a, def.b] : null;
  if (vertexIds) {
    const pts = vertexIds.map((v) => obj('p', { t: 'image', of: v, tr }, { label: primed(byId.get(v)?.style.label) }));
    const shape =
      def.t === 'polygon'
        ? obj('poly', { t: 'polygon', pts: pts.map((p) => p.id) }, { ...src.style, label: undefined })
        : obj(def.t === 'segment' ? 's' : 'l', { t: def.t as 'segment' | 'vector' | 'ray' | 'line', a: pts[0].id, b: pts[1].id }, { ...src.style, label: undefined });
    return [...pts, shape];
  }
  return [obj('img', { t: 'image', of, tr }, { ...src.style, label: undefined })];
}

/** Removes an object and everything that (transitively) depends on it. */
export function deleteWithDependents(c: Construction, id: Id, dependencies: (def: Def) => Id[]): Construction {
  const gone = new Set([id]);
  for (const o of c.objects) if (dependencies(o.def).some((d) => gone.has(d))) gone.add(o.id);
  return { ...c, objects: c.objects.filter((o) => !gone.has(o.id)) };
}
