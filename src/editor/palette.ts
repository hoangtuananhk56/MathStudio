/**
 * Template palette. `insert` uses MathLive placeholders: #0 = current selection,
 * #? = an empty slot. `basic` items are shown in the simplified (kids) mode.
 */
export interface PaletteItem {
  insert: string;
  /** Tooltip, Vietnamese / English. */
  vi: string;
  en: string;
  /** Preview LaTeX when it should differ from `insert`. */
  preview?: string;
  basic?: boolean;
}

export interface PaletteCategory {
  id: string;
  vi: string;
  en: string;
  /** Short glyph shown on the category chip. */
  icon: string;
  /** Hue of the category accent color. */
  hue: number;
  basic?: boolean;
  items: PaletteItem[];
}

const sym = (insert: string, vi: string, en: string, basic = false): PaletteItem => ({ insert, vi, en, basic });

export const PALETTE: PaletteCategory[] = [
  {
    id: 'common', vi: 'Thường dùng', en: 'Common', icon: '★', hue: 217, basic: true,
    items: [
      { insert: '\\frac{#0}{#?}', vi: 'Phân số', en: 'Fraction', basic: true },
      { insert: '#0^{#?}', vi: 'Lũy thừa', en: 'Power', basic: true },
      { insert: '#0_{#?}', vi: 'Chỉ số dưới', en: 'Subscript', basic: true },
      { insert: '\\sqrt{#0}', vi: 'Căn bậc hai', en: 'Square root', basic: true },
      { insert: '\\sqrt[#?]{#0}', vi: 'Căn bậc n', en: 'n-th root', basic: true },
      { insert: '\\left(#0\\right)', vi: 'Ngoặc tròn', en: 'Parentheses', basic: true },
      { insert: '\\left|#0\\right|', vi: 'Giá trị tuyệt đối', en: 'Absolute value', basic: true },
      { insert: '#0^{\\circ}', vi: 'Độ', en: 'Degree', basic: true },
      sym('+', 'Cộng', 'Plus', true),
      sym('-', 'Trừ', 'Minus', true),
      sym('\\times', 'Nhân', 'Times', true),
      sym('\\div', 'Chia', 'Divide', true),
      sym('\\cdot', 'Nhân (chấm)', 'Dot', true),
      sym('=', 'Bằng', 'Equals', true),
      sym('\\ne', 'Khác', 'Not equal', true),
      sym('\\pm', 'Cộng trừ', 'Plus-minus', true),
      sym('<', 'Nhỏ hơn', 'Less than', true),
      sym('>', 'Lớn hơn', 'Greater than', true),
      sym('\\le', 'Nhỏ hơn hoặc bằng', 'Less or equal', true),
      sym('\\ge', 'Lớn hơn hoặc bằng', 'Greater or equal', true),
      sym('\\approx', 'Xấp xỉ', 'Approximately', true),
      sym('\\pi', 'Số pi', 'Pi', true),
      sym('\\infty', 'Vô cực', 'Infinity'),
      sym('\\%', 'Phần trăm', 'Percent', true),
    ],
  },
  {
    id: 'fractions', vi: 'Phân số & Căn', en: 'Fractions & Roots', icon: '½', hue: 262, basic: true,
    items: [
      { insert: '\\frac{#0}{#?}', vi: 'Phân số', en: 'Fraction', basic: true },
      { insert: '#?\\frac{#?}{#?}', vi: 'Hỗn số', en: 'Mixed number', basic: true },
      { insert: '#0/#?', vi: 'Phân số gạch chéo', en: 'Slash fraction', basic: true },
      { insert: '\\dfrac{#0}{#?}', vi: 'Phân số cỡ lớn', en: 'Display fraction' },
      { insert: '\\sqrt{#0}', vi: 'Căn bậc hai', en: 'Square root', basic: true },
      { insert: '\\sqrt[3]{#0}', vi: 'Căn bậc ba', en: 'Cube root', basic: true },
      { insert: '\\sqrt[#?]{#0}', vi: 'Căn bậc n', en: 'n-th root', basic: true },
      { insert: '\\binom{#?}{#?}', vi: 'Tổ hợp', en: 'Binomial' },
      { insert: 'C_{#?}^{#?}', vi: 'Tổ hợp (ký hiệu VN)', en: 'Combination' },
      { insert: 'A_{#?}^{#?}', vi: 'Chỉnh hợp', en: 'Arrangement' },
    ],
  },
  {
    id: 'scripts', vi: 'Mũ & Chỉ số', en: 'Scripts', icon: 'x²', hue: 200, basic: true,
    items: [
      { insert: '#0^{2}', vi: 'Bình phương', en: 'Squared', basic: true },
      { insert: '#0^{3}', vi: 'Lập phương', en: 'Cubed', basic: true },
      { insert: '#0^{#?}', vi: 'Lũy thừa', en: 'Power', basic: true },
      { insert: '#0_{#?}', vi: 'Chỉ số dưới', en: 'Subscript', basic: true },
      { insert: '#0_{#?}^{#?}', vi: 'Chỉ số trên và dưới', en: 'Sub & superscript' },
      { insert: '{}_{#?}^{#?}#0', vi: 'Chỉ số bên trái', en: 'Left scripts' },
      { insert: 'e^{#?}', vi: 'Hàm mũ e', en: 'Exponential' },
      { insert: '10^{#?}', vi: 'Lũy thừa 10', en: 'Power of ten', basic: true },
      { insert: "#0'", vi: 'Đạo hàm (phẩy)', en: 'Prime' },
      { insert: "#0''", vi: 'Đạo hàm cấp 2', en: 'Double prime' },
    ],
  },
  {
    id: 'brackets', vi: 'Ngoặc', en: 'Brackets', icon: '( )', hue: 28, basic: true,
    items: [
      { insert: '\\left(#0\\right)', vi: 'Ngoặc tròn', en: 'Parentheses', basic: true },
      { insert: '\\left[#0\\right]', vi: 'Ngoặc vuông', en: 'Square brackets', basic: true },
      { insert: '\\left\\{#0\\right\\}', vi: 'Ngoặc nhọn', en: 'Braces', basic: true },
      { insert: '\\left|#0\\right|', vi: 'Giá trị tuyệt đối', en: 'Absolute value', basic: true },
      { insert: '\\left\\|#0\\right\\|', vi: 'Độ dài / chuẩn', en: 'Norm' },
      { insert: '\\left\\langle#0\\right\\rangle', vi: 'Ngoặc góc', en: 'Angle brackets' },
      { insert: '\\left\\lfloor#0\\right\\rfloor', vi: 'Phần nguyên', en: 'Floor' },
      { insert: '\\left\\lceil#0\\right\\rceil', vi: 'Làm tròn lên', en: 'Ceiling' },
      { insert: '\\left[#?;#?\\right]', vi: 'Đoạn [a; b]', en: 'Closed interval', basic: true },
      { insert: '\\left(#?;#?\\right)', vi: 'Khoảng (a; b)', en: 'Open interval', basic: true },
      { insert: '\\left[#?;#?\\right)', vi: 'Nửa khoảng [a; b)', en: 'Half-open interval' },
      { insert: '\\left(#?;#?\\right]', vi: 'Nửa khoảng (a; b]', en: 'Half-open interval' },
    ],
  },
  {
    id: 'geometry', vi: 'Hình học', en: 'Geometry', icon: '∠', hue: 145, basic: true,
    items: [
      sym('\\angle', 'Góc', 'Angle', true),
      { insert: '\\widehat{#0}', vi: 'Góc (mũ)', en: 'Angle (hat)', preview: '\\widehat{ABC}', basic: true },
      sym('\\triangle', 'Tam giác', 'Triangle', true),
      sym('\\perp', 'Vuông góc', 'Perpendicular', true),
      sym('\\parallel', 'Song song', 'Parallel', true),
      { insert: '\\overrightarrow{#0}', vi: 'Vectơ', en: 'Vector', preview: '\\overrightarrow{AB}', basic: true },
      { insert: '\\vec{#0}', vi: 'Vectơ (ngắn)', en: 'Vector (short)', preview: '\\vec{u}' },
      { insert: '\\overline{#0}', vi: 'Đoạn thẳng / gạch trên', en: 'Overline', preview: '\\overline{AB}' },
      { insert: '\\overset{\\frown}{#0}', vi: 'Cung', en: 'Arc', preview: '\\overset{\\frown}{AB}', basic: true },
      sym('^{\\circ}', 'Độ', 'Degree', true),
      sym('\\sim', 'Đồng dạng', 'Similar'),
      sym('\\cong', 'Bằng nhau (tam giác)', 'Congruent'),
      sym('\\in', 'Thuộc', 'Belongs to', true),
      sym('\\notin', 'Không thuộc', 'Not in'),
      { insert: '\\left(O;R\\right)', vi: 'Đường tròn (O; R)', en: 'Circle (O; R)' },
      { insert: 'S_{\\triangle #?}', vi: 'Diện tích tam giác', en: 'Triangle area' },
    ],
  },
  {
    id: 'greek', vi: 'Chữ Hy Lạp', en: 'Greek', icon: 'α', hue: 330,
    items: [
      ...['alpha', 'beta', 'gamma', 'delta', 'varepsilon', 'theta', 'lambda', 'mu', 'pi', 'rho', 'sigma', 'tau', 'varphi', 'omega']
        .map((g) => sym(`\\${g}`, g, g, true)),
      ...['Delta', 'Gamma', 'Lambda', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega'].map((g) => sym(`\\${g}`, g, g)),
    ],
  },
  {
    id: 'relations', vi: 'So sánh & Mũi tên', en: 'Relations & Arrows', icon: '⇒', hue: 12,
    items: [
      sym('=', 'Bằng', 'Equals', true), sym('\\ne', 'Khác', 'Not equal', true),
      sym('\\le', 'Nhỏ hơn hoặc bằng', 'Less or equal', true), sym('\\ge', 'Lớn hơn hoặc bằng', 'Greater or equal', true),
      sym('\\approx', 'Xấp xỉ', 'Approximately'), sym('\\equiv', 'Đồng nhất', 'Equivalent'),
      sym('\\propto', 'Tỉ lệ với', 'Proportional'), sym('\\ll', 'Rất nhỏ hơn', 'Much less'),
      sym('\\gg', 'Rất lớn hơn', 'Much greater'), sym('\\to', 'Tiến tới', 'Tends to', true),
      sym('\\Rightarrow', 'Suy ra', 'Implies', true), sym('\\Leftrightarrow', 'Tương đương', 'If and only if', true),
      sym('\\leftarrow', 'Mũi tên trái', 'Left arrow'), sym('\\leftrightarrow', 'Mũi tên hai chiều', 'Two-way arrow'),
      sym('\\uparrow', 'Đồng biến', 'Up arrow'), sym('\\downarrow', 'Nghịch biến', 'Down arrow'),
      { insert: '\\xrightarrow{#?}', vi: 'Mũi tên có chữ', en: 'Labelled arrow' },
    ],
  },
  {
    id: 'sets', vi: 'Tập hợp & Logic', en: 'Sets & Logic', icon: '∈', hue: 180,
    items: [
      sym('\\in', 'Thuộc', 'Element of', true), sym('\\notin', 'Không thuộc', 'Not element of', true),
      sym('\\subset', 'Tập con', 'Subset', true), sym('\\subseteq', 'Tập con hoặc bằng', 'Subset or equal'),
      sym('\\supset', 'Chứa', 'Superset'), sym('\\cup', 'Hợp', 'Union', true), sym('\\cap', 'Giao', 'Intersection', true),
      sym('\\setminus', 'Hiệu', 'Set minus'), sym('\\varnothing', 'Tập rỗng', 'Empty set', true),
      sym('\\mathbb{N}', 'Số tự nhiên', 'Naturals', true), sym('\\mathbb{Z}', 'Số nguyên', 'Integers', true),
      sym('\\mathbb{Q}', 'Số hữu tỉ', 'Rationals', true), sym('\\mathbb{R}', 'Số thực', 'Reals', true),
      sym('\\mathbb{C}', 'Số phức', 'Complex numbers'), { insert: '\\left\\{#0\\right\\}', vi: 'Tập hợp', en: 'Set', basic: true },
      { insert: '\\left\\{#?\\mid #?\\right\\}', vi: 'Tập hợp có điều kiện', en: 'Set builder' },
      sym('\\forall', 'Với mọi', 'For all'), sym('\\exists', 'Tồn tại', 'There exists'),
      sym('\\neg', 'Phủ định', 'Not'), sym('\\land', 'Và', 'And'), sym('\\lor', 'Hoặc', 'Or'),
    ],
  },
  {
    id: 'functions', vi: 'Hàm số & Lượng giác', en: 'Functions', icon: 'sin', hue: 45,
    items: [
      { insert: 'f\\left(#?\\right)', vi: 'Hàm số f(x)', en: 'Function f(x)', basic: true },
      { insert: '\\sin #?', vi: 'sin', en: 'sine', basic: true }, { insert: '\\cos #?', vi: 'cos', en: 'cosine', basic: true },
      { insert: '\\tan #?', vi: 'tan', en: 'tangent', basic: true }, { insert: '\\cot #?', vi: 'cot', en: 'cotangent', basic: true },
      { insert: '\\sin^{2}#?', vi: 'sin bình phương', en: 'sine squared' },
      { insert: '\\arcsin #?', vi: 'arcsin', en: 'arcsine' }, { insert: '\\arccos #?', vi: 'arccos', en: 'arccosine' },
      { insert: '\\arctan #?', vi: 'arctan', en: 'arctangent' },
      { insert: '\\log_{#?}#?', vi: 'Logarit cơ số a', en: 'Logarithm base a' },
      { insert: '\\log #?', vi: 'log', en: 'log' }, { insert: '\\ln #?', vi: 'ln', en: 'natural log' },
      { insert: 'e^{#?}', vi: 'Hàm mũ', en: 'Exponential' },
    ],
  },
  {
    id: 'calculus', vi: 'Giải tích', en: 'Calculus', icon: '∫', hue: 290,
    items: [
      { insert: '\\lim_{#?\\to #?}#?', vi: 'Giới hạn', en: 'Limit' },
      { insert: '\\lim_{x\\to +\\infty}#?', vi: 'Giới hạn tại vô cực', en: 'Limit at infinity' },
      { insert: '\\sum_{#?}^{#?}#?', vi: 'Tổng', en: 'Sum' },
      { insert: '\\prod_{#?}^{#?}#?', vi: 'Tích', en: 'Product' },
      { insert: '\\int #?\\,\\mathrm{d}x', vi: 'Nguyên hàm', en: 'Indefinite integral' },
      { insert: '\\int_{#?}^{#?}#?\\,\\mathrm{d}x', vi: 'Tích phân', en: 'Definite integral' },
      { insert: '\\iint_{#?}#?', vi: 'Tích phân kép', en: 'Double integral' },
      { insert: '\\oint_{#?}#?', vi: 'Tích phân đường', en: 'Contour integral' },
      { insert: "f'\\left(#?\\right)", vi: 'Đạo hàm', en: 'Derivative' },
      { insert: '\\frac{\\mathrm{d}#?}{\\mathrm{d}x}', vi: 'Đạo hàm (Leibniz)', en: 'Leibniz derivative' },
      { insert: '\\frac{\\partial #?}{\\partial x}', vi: 'Đạo hàm riêng', en: 'Partial derivative' },
      { insert: '\\left.#0\\right|_{#?}^{#?}', vi: 'Thế cận', en: 'Evaluate at bounds' },
      sym('\\infty', 'Vô cực', 'Infinity'), sym('\\Delta', 'Delta', 'Delta'), sym('\\partial', 'Đạo hàm riêng', 'Partial'),
    ],
  },
  {
    id: 'matrices', vi: 'Hệ & Ma trận', en: 'Systems & Matrices', icon: '{', hue: 240, basic: true,
    items: [
      { insert: '\\begin{cases}#?\\\\#?\\end{cases}', vi: 'Hệ 2 phương trình', en: 'System of 2 equations', basic: true },
      { insert: '\\begin{cases}#?\\\\#?\\\\#?\\end{cases}', vi: 'Hệ 3 phương trình', en: 'System of 3 equations', basic: true },
      { insert: '\\left[\\begin{aligned}&#?\\\\&#?\\end{aligned}\\right.', vi: 'Tuyển (hoặc)', en: 'Either-or', basic: true },
      { insert: '\\begin{aligned}#?&=#?\\\\&=#?\\end{aligned}', vi: 'Biến đổi nhiều dòng', en: 'Aligned steps' },
      { insert: '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', vi: 'Ma trận 2×2', en: '2×2 matrix' },
      { insert: '\\begin{pmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{pmatrix}', vi: 'Ma trận 3×3', en: '3×3 matrix' },
      { insert: '\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}', vi: 'Ma trận ngoặc vuông', en: 'Bracket matrix' },
      { insert: '\\begin{vmatrix}#?&#?\\\\#?&#?\\end{vmatrix}', vi: 'Định thức', en: 'Determinant' },
      { insert: '\\begin{pmatrix}#?\\\\#?\\end{pmatrix}', vi: 'Vectơ cột', en: 'Column vector' },
    ],
  },
  {
    id: 'accents', vi: 'Dấu & Khung', en: 'Accents & Boxes', icon: 'â', hue: 0,
    items: [
      { insert: '\\hat{#0}', vi: 'Mũ', en: 'Hat', preview: '\\hat{a}' },
      { insert: '\\bar{#0}', vi: 'Gạch ngang', en: 'Bar', preview: '\\bar{x}' },
      { insert: '\\tilde{#0}', vi: 'Dấu ngã', en: 'Tilde', preview: '\\tilde{a}' },
      { insert: '\\dot{#0}', vi: 'Chấm', en: 'Dot', preview: '\\dot{x}' },
      { insert: '\\ddot{#0}', vi: 'Hai chấm', en: 'Double dot', preview: '\\ddot{x}' },
      { insert: '\\overbrace{#0}^{#?}', vi: 'Ngoặc trên', en: 'Overbrace' },
      { insert: '\\underbrace{#0}_{#?}', vi: 'Ngoặc dưới', en: 'Underbrace' },
      { insert: '\\boxed{#0}', vi: 'Đóng khung', en: 'Box' },
      { insert: '\\cancel{#0}', vi: 'Gạch chéo', en: 'Cancel' },
      { insert: '\\text{#?}', vi: 'Chữ thường (văn bản)', en: 'Text' },
    ],
  },
];
