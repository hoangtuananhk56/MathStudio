/**
 * Exercises as teachers write them (years 6–12), with what the figure must contain.
 * The year 6 ones come from a real worksheet ("Phiếu BSNC Toán 6 Tuần 7 8 9").
 */
export interface Expect {
  /** points that must be named in the figure */
  points?: string[];
  /** segments drawn (as a segment or a polygon side) */
  segments?: string[];
  /** right angles [A, V, B]: AV ⊥ VB */
  right?: [string, string, string][];
  /** midpoints [M, A, B] */
  mid?: [string, string, string][];
  /** P lies on line AB */
  on?: [string, string, string][];
  /** AB ∥ CD */
  parallel?: [string, string][];
  /** lengths in cm (figures in cm are not rescaled) */
  len?: Record<string, number>;
  /** ratio of two lengths (figures in metres are drawn to scale) */
  ratio?: [string, string, number][];
  /** lines drawn as solids (3D) */
  solid?: boolean;
  /** coordinates */
  at?: Record<string, [number, number]>;
}

export interface Exercise {
  grade: number;
  text: string;
  expect: Expect;
}

export const EXERCISES: Exercise[] = [
  /* ------------------------------------------------ lớp 6 (phiếu BSNC + SGK) */
  { grade: 6, text: 'Cho hình bình hành ABCD có AB = 2 cm.', expect: { points: ['A', 'B', 'C', 'D'], len: { AB: 2 }, parallel: [['AB', 'DC'], ['AD', 'BC']] } },
  { grade: 6, text: 'Cho hình bình hành có cạnh đáy là bằng 15 cm và cạnh bên bằng 7 cm và có chiều cao là 5 cm.', expect: { points: ['A', 'B', 'C', 'D'], ratio: [['AB', 'AD', 15 / 7]] } },
  { grade: 6, text: 'Một hình bình hành có cạnh đáy là 71 cm. Người ta thu hẹp hình bình hành đó bằng cách giảm các cạnh đáy của hình bình hành đi 19 cm.', expect: { points: ['A', 'B', 'C', 'D'] } },
  { grade: 6, text: 'Hình chữ nhật ABCD có AB = 35m, BC = 25m.', expect: { points: ['A', 'B', 'C', 'D'], ratio: [['AB', 'BC', 35 / 25]], right: [['B', 'A', 'D']] } },
  { grade: 6, text: 'Phần kính ở giữa có dạng hình chữ nhật có chiều rộng 24 cm, chiều dài 58 cm.', expect: { points: ['A', 'B', 'C', 'D'], ratio: [['AB', 'BC', 58 / 24]] } },
  { grade: 6, text: 'Cho hình thang cân ABCD có AB = 5cm, BC = 4cm, CD = 10cm.', expect: { points: ['A', 'B', 'C', 'D'], len: { AB: 5, BC: 4, CD: 10, AD: 4 }, parallel: [['AB', 'CD']] } },
  { grade: 6, text: 'Một hình thoi có cạnh dài 7 cm.', expect: { points: ['A', 'B', 'C', 'D'], len: { AB: 7, BC: 7, CD: 7, DA: 7 } } },
  { grade: 6, text: 'Cho hình thoi MAND có diện tích 150 cm^2, đường chéo MN dài 20 cm.', expect: { points: ['M', 'A', 'N', 'D'], ratio: [['MN', 'AD', 20 / 15]] } },
  { grade: 6, text: 'Một mảnh vườn hình thang cân có đáy nhỏ là 12m, đáy lớn là 18m và có diện tích là 225 m^2.', expect: { points: ['A', 'B', 'C', 'D'], ratio: [['AB', 'CD', 18 / 12]] } },
  { grade: 6, text: 'Một mảnh đất hình chữ nhật có chiều dài 15 m, chiều rộng 8m.', expect: { points: ['A', 'B', 'C', 'D'], ratio: [['AB', 'BC', 15 / 8]] } },
  { grade: 6, text: 'Cho lục giác đều ABCDEG, ba đường chéo chính cắt nhau tại O.', expect: { points: ['A', 'B', 'C', 'D', 'E', 'G', 'O'], segments: ['AD', 'BE', 'CG'] } },
  { grade: 6, text: 'Người ta dự định lắp kính cho một cửa sổ hình thoi có độ dài hai đường chéo là 8dm và 12dm.', expect: { points: ['A', 'B', 'C', 'D'], ratio: [['AC', 'BD', 8 / 12]] } },
  { grade: 6, text: 'Nhà Hà có mảnh sân hình chữ nhật có chiều dài 12m và chiều rộng 9m.', expect: { ratio: [['AB', 'BC', 12 / 9]] } },
  { grade: 6, text: 'Nhà bạn Bách có mảnh đất hình chữ nhật có chiều dài 8m, chiều rộng 5m.', expect: { ratio: [['AB', 'BC', 8 / 5]] } },
  { grade: 6, text: 'Một nền nhà hình chữ nhật có chiều dài 20m, chiều rộng bằng 1/4 chiều dài.', expect: { ratio: [['AB', 'BC', 4]] } },
  { grade: 6, text: 'Một mảnh vườn có dạng hình vuông với chiều dài cạnh bằng 10 m.', expect: { points: ['A', 'B', 'C', 'D'], ratio: [['AB', 'BC', 1]], right: [['B', 'A', 'D']] } },
  { grade: 6, text: 'Một sân bóng đá mini hình chữ nhật với chiều dài là 25m và chiều rộng là 15m.', expect: { ratio: [['AB', 'BC', 25 / 15]] } },
  { grade: 6, text: 'Một hình vuông có diện tích 64 cm2.', expect: { len: { AB: 8 } } },
  { grade: 6, text: 'Một hình thoi có diện tích 16 dm2, độ dài một đường chéo là 8 dm.', expect: { ratio: [['AC', 'BD', 2]] } },
  { grade: 6, text: 'Vẽ đoạn thẳng AB = 6 cm. Lấy điểm M thuộc đoạn thẳng AB sao cho AM = 2 cm. Gọi I là trung điểm của MB.', expect: { len: { AB: 6, AM: 2 }, mid: [['I', 'M', 'B']] } },
  { grade: 6, text: 'Trên tia Ox lấy hai điểm A, B sao cho OA = 2 cm, OB = 5 cm.', expect: { points: ['O', 'A', 'B'], len: { OA: 2, OB: 5 } } },
  { grade: 6, text: 'Cho ba điểm A, B, C không thẳng hàng. Vẽ đường thẳng AB, tia AC và đoạn thẳng BC.', expect: { points: ['A', 'B', 'C'], segments: ['BC'] } },
  { grade: 6, text: 'Cho ba điểm A, B, C thẳng hàng, điểm B nằm giữa A và C.', expect: { on: [['B', 'A', 'C']] } },
  { grade: 6, text: 'Vẽ hai tia đối nhau Ox, Oy. Trên tia Ox lấy điểm A, trên tia Oy lấy điểm B.', expect: { points: ['O', 'A', 'B'], on: [['O', 'A', 'B']] } },
  { grade: 6, text: 'Vẽ góc xOy = 50°. Vẽ tia Oz nằm giữa hai tia Ox, Oy sao cho góc xOz = 20°.', expect: { points: ['O', 'x', 'y', 'z'] } },
  { grade: 6, text: 'Cho điểm A nằm ngoài đường thẳng d. Vẽ đường thẳng đi qua A và vuông góc với d.', expect: { points: ['A'] } },
  { grade: 6, text: 'Cho tam giác đều ABC có cạnh 3 cm.', expect: { len: { AB: 3, BC: 3, CA: 3 } } },
  /* ------------------------------------------------------------- lớp 7 */
  { grade: 7, text: 'Cho tam giác ABC vuông tại A có AB = 3 cm, AC = 4 cm. Kẻ đường cao AH. Gọi M là trung điểm của BC. N là trung điểm của AC. Nối B với N.', expect: { len: { BC: 5 }, right: [['B', 'A', 'C'], ['A', 'H', 'C']], mid: [['M', 'B', 'C'], ['N', 'A', 'C']], segments: ['BN', 'AH'] } },
  { grade: 7, text: 'Cho tam giác ABC cân tại A. Gọi M là trung điểm của BC. Chứng minh AM ⊥ BC.', expect: { mid: [['M', 'B', 'C']] } },
  { grade: 7, text: 'Cho ∆ABC có AB = AC, M là trung điểm BC. Trên tia đối của tia MA lấy điểm D sao cho MD = MA. Chứng minh ∆ABM = ∆DCM.', expect: { mid: [['M', 'B', 'C'], ['M', 'A', 'D']] } },
  { grade: 7, text: 'Cho tam giác ABC, M là trung điểm của BC. Trên tia đối của tia MA lấy điểm E sao cho ME = MA. a) Chứng minh ∆AMB = ∆EMC. b) Chứng minh AC // BE.', expect: { mid: [['M', 'A', 'E']] } },
  { grade: 7, text: 'Cho tam giác ABC vuông tại A, đường phân giác BD (D ∈ AC). Kẻ DE ⊥ BC (E ∈ BC).', expect: { points: ['D', 'E'], on: [['D', 'A', 'C'], ['E', 'B', 'C']], right: [['D', 'E', 'C']] } },
  { grade: 7, text: 'Cho tam giác ABC cân tại A, kẻ AH vuông góc với BC tại H. Kẻ HE ⊥ AB, HF ⊥ AC.', expect: { right: [['A', 'H', 'C'], ['H', 'E', 'A'], ['H', 'F', 'A']], mid: [['H', 'B', 'C']] } },
  { grade: 7, text: 'Cho ∆ABC có AB < AC. Tia phân giác của góc A cắt BC tại D. Trên cạnh AC lấy điểm E sao cho AE = AB.', expect: { points: ['D', 'E'], on: [['D', 'B', 'C'], ['E', 'A', 'C']] } },
  { grade: 7, text: 'Cho tam giác ABC, các đường trung tuyến BM và CN cắt nhau tại G.', expect: { mid: [['M', 'A', 'C'], ['N', 'A', 'B']], points: ['G'] } },
  { grade: 7, text: 'Cho tam giác ABC nhọn, hai đường cao BD và CE cắt nhau tại H. Chứng minh AH ⊥ BC.', expect: { right: [['B', 'D', 'A'], ['C', 'E', 'A']], points: ['H'] } },
  { grade: 7, text: 'Cho tam giác ABC có góc B = 60°, góc C = 40°. Kẻ đường phân giác AD.', expect: { points: ['D'], on: [['D', 'B', 'C']] } },
  { grade: 7, text: 'Cho góc xOy, Ot là tia phân giác của góc xOy.', expect: { points: ['O'] } },
  { grade: 7, text: 'Cho tam giác ABC. Đường trung trực của BC cắt AC tại K. Nối B với K.', expect: { points: ['K'], segments: ['BK'], on: [['K', 'A', 'C']] } },
  { grade: 7, text: 'Cho tam giác ABC vuông tại A, có góc B = 60°, BC = 6 cm.', expect: { len: { BC: 6, AB: 3 }, right: [['B', 'A', 'C']] } },
  { grade: 7, text: 'Cho tam giác ABC có AB = 6 cm, AC = 8 cm, BC = 10 cm.', expect: { len: { AB: 6, AC: 8, BC: 10 }, right: [['B', 'A', 'C']] } },
  { grade: 7, text: 'Cho tam giác ABC, gọi M, N lần lượt là trung điểm của AB, AC. Lấy điểm E sao cho N là trung điểm của ME.', expect: { mid: [['M', 'A', 'B'], ['N', 'A', 'C'], ['N', 'M', 'E']] } },
  { grade: 7, text: 'Cho tam giác ABC vuông tại A. Kẻ AH ⊥ BC (H ∈ BC). Trên tia đối của tia HA lấy điểm D sao cho HD = HA.', expect: { right: [['A', 'H', 'B']], mid: [['H', 'A', 'D']] } },
  { grade: 7, text: 'Cho tam giác ABC có ba góc nhọn, AB < AC. Vẽ AH vuông góc với BC tại H. Trên tia HC lấy điểm D sao cho HD = HB.', expect: { mid: [['H', 'B', 'D']], right: [['A', 'H', 'C']] } },
  { grade: 7, text: 'Cho hai đường thẳng xx\' và yy\' cắt nhau tại O.', expect: { points: ['O'] } },
  { grade: 7, text: 'Cho đường thẳng a song song với đường thẳng b.', expect: {} },
  /* ------------------------------------------------------------- lớp 8 */
  { grade: 8, text: 'Cho tam giác ABC. Gọi M, N lần lượt là trung điểm của AB, AC. Chứng minh MN // BC.', expect: { mid: [['M', 'A', 'B'], ['N', 'A', 'C']] } },
  { grade: 8, text: 'Cho hình bình hành ABCD. Gọi O là giao điểm của hai đường chéo AC và BD.', expect: { points: ['O'], mid: [['O', 'A', 'C'], ['O', 'B', 'D']] } },
  { grade: 8, text: 'Cho hình chữ nhật ABCD có AB = 8 cm, BC = 6 cm. Kẻ AH vuông góc với BD tại H.', expect: { len: { AB: 8, BC: 6 }, right: [['A', 'H', 'B']] } },
  { grade: 8, text: 'Cho tam giác ABC có AB = 6 cm, AC = 9 cm. Trên cạnh AB lấy điểm D sao cho AD = 2 cm. Qua D kẻ đường thẳng song song với BC cắt AC tại E.', expect: { len: { AB: 6, AD: 2, AE: 3 }, parallel: [['DE', 'BC']] } },
  { grade: 8, text: 'Cho hình thang ABCD (AB // CD). Gọi E, F lần lượt là trung điểm của AD, BC.', expect: { mid: [['E', 'A', 'D'], ['F', 'B', 'C']] } },
  { grade: 8, text: 'Cho tam giác ABC vuông tại A, đường trung tuyến AM. Gọi D là điểm đối xứng với A qua M.', expect: { mid: [['M', 'B', 'C'], ['M', 'A', 'D']] } },
  { grade: 8, text: 'Cho hình vuông ABCD cạnh 4 cm. Gọi E là trung điểm của BC. Nối A với E, D với E.', expect: { len: { AB: 4 }, mid: [['E', 'B', 'C']], segments: ['AE', 'DE'] } },
  { grade: 8, text: 'Cho tứ giác ABCD. Gọi M, N, P, Q lần lượt là trung điểm của AB, BC, CD, DA.', expect: { mid: [['M', 'A', 'B'], ['N', 'B', 'C'], ['P', 'C', 'D'], ['Q', 'D', 'A']] } },
  { grade: 8, text: 'Cho tam giác ABC vuông tại A, AB = 6 cm, AC = 8 cm, đường cao AH. Từ H kẻ HD ⊥ AB (D ∈ AB), HE ⊥ AC (E ∈ AC).', expect: { len: { BC: 10 }, right: [['A', 'H', 'B'], ['H', 'D', 'A'], ['H', 'E', 'A']] } },
  { grade: 8, text: 'Cho tam giác ABC, điểm M thuộc cạnh BC sao cho BM = 2MC. Từ M kẻ MK // AB (K ∈ AC).', expect: { ratio: [['BM', 'MC', 2]], parallel: [['MK', 'AB']], on: [['K', 'A', 'C']] } },
  { grade: 8, text: 'Cho hình chóp tứ giác đều S.ABCD.', expect: { solid: true, points: ['S', 'A', 'B', 'C', 'D'] } },
  { grade: 8, text: 'Cho hình chóp tam giác đều S.ABC.', expect: { solid: true, points: ['S', 'A', 'B', 'C'] } },
  /* ------------------------------------------------------------- lớp 9 */
  { grade: 9, text: 'Cho đường tròn (O; 3 cm) và điểm M nằm ngoài đường tròn. Từ M kẻ hai tiếp tuyến MA, MB với đường tròn (A, B là các tiếp điểm).', expect: { len: { OA: 3, OB: 3 }, right: [['O', 'A', 'M'], ['O', 'B', 'M']] } },
  { grade: 9, text: 'Cho đường tròn (O) đường kính AB. Lấy điểm C thuộc đường tròn. Tiếp tuyến tại A cắt BC tại D.', expect: { mid: [['O', 'A', 'B']], points: ['C', 'D'], right: [['B', 'A', 'D']] } },
  { grade: 9, text: 'Cho tam giác ABC nhọn nội tiếp đường tròn (O). Các đường cao AD, BE, CF cắt nhau tại H.', expect: { points: ['O', 'D', 'E', 'F', 'H'], right: [['A', 'D', 'B'], ['B', 'E', 'C'], ['C', 'F', 'A']] } },
  { grade: 9, text: 'Cho tam giác ABC vuông tại A. Đường tròn đường kính AC cắt BC tại D.', expect: { points: ['D'], right: [['A', 'D', 'C']] } },
  { grade: 9, text: 'Cho tam giác ABC có ba góc nhọn. Đường tròn đường kính BC cắt AB, AC lần lượt tại E, F.', expect: { points: ['E', 'F'], right: [['B', 'E', 'C'], ['B', 'F', 'C']] } },
  { grade: 9, text: 'Cho đường tròn (O; R), dây AB. Vẽ OH vuông góc với AB tại H.', expect: { right: [['O', 'H', 'A']], mid: [['H', 'A', 'B']] } },
  { grade: 9, text: 'Cho nửa đường tròn (O) đường kính AB. Lấy điểm M thuộc nửa đường tròn. Kẻ MH ⊥ AB tại H.', expect: { right: [['M', 'H', 'A'], ['A', 'M', 'B']] } },
  { grade: 9, text: 'Cho tam giác ABC vuông tại A có AB = 9 cm, AC = 12 cm. Vẽ đường tròn tâm B bán kính BA.', expect: { ratio: [['BC', 'AB', 15 / 9]] } },
  { grade: 9, text: 'Cho đường tròn (O; 5 cm). Lấy điểm A thuộc đường tròn. Kẻ tiếp tuyến tại A.', expect: { len: { OA: 5 } } },
  { grade: 9, text: 'Cho đường tròn (O) và điểm A nằm ngoài đường tròn. Kẻ các tiếp tuyến AB, AC với đường tròn (B, C là các tiếp điểm). Gọi H là giao điểm của OA và BC.', expect: { right: [['O', 'B', 'A'], ['O', 'C', 'A']], points: ['H'] } },
  { grade: 9, text: 'Cho tứ giác ABCD nội tiếp đường tròn (O).', expect: { points: ['A', 'B', 'C', 'D', 'O'] } },
  { grade: 9, text: 'Cho đường tròn (O) đường kính AB. Lấy C thuộc đường tròn. AC cắt (O) tại C, tia BC cắt tiếp tuyến tại A ở D.', expect: { points: ['C'] } },
  { grade: 9, text: 'Một hình trụ có bán kính đáy 3 cm và chiều cao 8 cm.', expect: { solid: true } },
  { grade: 9, text: 'Một hình nón có bán kính đáy 4 cm và chiều cao 6 cm.', expect: { solid: true } },
  { grade: 9, text: 'Một quả bóng hình cầu có bán kính 10 cm.', expect: { solid: true } },
  /* ------------------------------------------------------------ lớp 10–12 */
  { grade: 10, text: 'Trong mặt phẳng tọa độ Oxy, cho ba điểm A(1; 2), B(4; 3), C(2; -1).', expect: { at: { A: [1, 2], B: [4, 3], C: [2, -1] } } },
  { grade: 10, text: 'Trong mặt phẳng Oxy cho A(-1; 1), B(3; 4). Vẽ đoạn thẳng AB.', expect: { at: { A: [-1, 1], B: [3, 4] }, segments: ['AB'] } },
  { grade: 10, text: 'Vẽ đồ thị hàm số y = 2x - 1.', expect: {} },
  { grade: 10, text: 'Vẽ parabol y = x^2 - 4x + 3.', expect: {} },
  { grade: 11, text: 'Cho hình chóp S.ABCD có đáy ABCD là hình vuông, SA ⊥ (ABCD). Gọi M là trung điểm của SC.', expect: { solid: true, mid: [['M', 'S', 'C']] } },
  { grade: 11, text: 'Cho hình chóp S.ABC có đáy là tam giác ABC. Gọi M, N lần lượt là trung điểm của SA, SB.', expect: { solid: true, mid: [['M', 'S', 'A'], ['N', 'S', 'B']] } },
  { grade: 11, text: "Cho hình hộp chữ nhật ABCD.A'B'C'D' có AB = 4 cm, AD = 3 cm, AA' = 5 cm.", expect: { solid: true, points: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] } },
  { grade: 11, text: "Cho hình lập phương ABCD.A'B'C'D' cạnh 4 cm. Nối A với C'.", expect: { solid: true, segments: ["AC'"] } },
  { grade: 12, text: "Cho lăng trụ đứng ABC.A'B'C' có đáy là tam giác ABC.", expect: { solid: true, points: ['A', 'B', 'C', "A'", "B'", "C'"] } },
  /* ---------------------------------------------- wording variants (any year) */
  { grade: 7, text: 'Cho tam giác ABC. Nối A và M với M là trung điểm của BC.', expect: { mid: [['M', 'B', 'C']], segments: ['AM'] } },
  { grade: 7, text: 'Cho △ABC vuông tại A. Vẽ đoạn thẳng nối B và trung điểm M của AC.', expect: { mid: [['M', 'A', 'C']], segments: ['BM'] } },
  { grade: 7, text: 'Cho tam giac ABC can tai A, duong cao AH.', expect: { mid: [['H', 'B', 'C']] } },
  { grade: 7, text: 'Cho tam giác ABC. Kẻ BD vuông góc với AC tại D, CE vuông góc với AB tại E. BD cắt CE tại H.', expect: { right: [['B', 'D', 'A'], ['C', 'E', 'A']], points: ['H'] } },
  { grade: 7, text: 'Cho tam giác ABC vuông tại A, M là trung điểm của BC. Nối A, M.', expect: { segments: ['AM'] } },
  { grade: 8, text: 'Cho hình vuông ABCD. Nối các điểm A, C và B, D.', expect: { segments: ['AC', 'BD'] } },
  { grade: 8, text: 'Cho hình chữ nhật ABCD. Vẽ các đoạn thẳng AC, BD cắt nhau tại O.', expect: { segments: ['AC', 'BD'], points: ['O'] } },
  { grade: 8, text: 'Cho tam giác ABC. Lấy D trên cạnh AB, E trên cạnh AC. Nối DE.', expect: { on: [['D', 'A', 'B'], ['E', 'A', 'C']], segments: ['DE'] } },
  { grade: 9, text: 'Cho đường tròn (O; R) và dây CD. Kẻ OI ⊥ CD (I ∈ CD).', expect: { right: [['O', 'I', 'C']] } },
];
