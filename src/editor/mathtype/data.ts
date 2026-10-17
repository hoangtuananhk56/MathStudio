/**
 * Toolbar content modelled on MathType's layout:
 *   row 1 – symbol palettes, row 2 – template palettes, small bar, tabbed bar.
 * `insert` uses MathLive placeholders: #0 = current selection, #? = empty slot.
 */
export interface ToolItem {
  insert: string;
  vi: string;
  en: string;
  /** Preview LaTeX when it should differ from `insert`. */
  preview?: string;
}

export interface ToolPalette {
  id: string;
  vi: string;
  en: string;
  /** Button face (LaTeX, rendered small). */
  face: string;
  items: ToolItem[];
  /** Grid columns in the drop-down. */
  cols?: number;
}

const s = (insert: string, vi: string, en = vi): ToolItem => ({ insert, vi, en });
const t = (insert: string, vi: string, en = vi, preview?: string): ToolItem => ({ insert, vi, en, preview });

/* ------------------------------ row 1: symbols ------------------------------ */

export const SYMBOL_PALETTES: ToolPalette[] = [
  {
    id: 'relations', vi: 'Quan hệ', en: 'Relational symbols', face: '\\le\\ne\\approx', cols: 8,
    items: [
      s('<', 'Nhỏ hơn', 'Less than'), s('>', 'Lớn hơn', 'Greater than'), s('\\le', 'Nhỏ hơn hoặc bằng', 'Less or equal'),
      s('\\ge', 'Lớn hơn hoặc bằng', 'Greater or equal'), s('\\ll', 'Rất nhỏ hơn', 'Much less'), s('\\gg', 'Rất lớn hơn', 'Much greater'),
      s('\\prec', 'Đứng trước', 'Precedes'), s('\\succ', 'Đứng sau', 'Succeeds'), s('=', 'Bằng', 'Equals'),
      s('\\ne', 'Khác', 'Not equal'), s('\\equiv', 'Đồng nhất', 'Identical'), s('\\approx', 'Xấp xỉ', 'Approximately'),
      s('\\cong', 'Bằng nhau', 'Congruent'), s('\\simeq', 'Tương đương tiệm cận', 'Asymptotically equal'), s('\\sim', 'Đồng dạng', 'Similar'),
      s('\\propto', 'Tỉ lệ', 'Proportional'), s('\\doteq', 'Xấp xỉ bằng', 'Approaches'), s('\\perp', 'Vuông góc', 'Perpendicular'),
      s('\\parallel', 'Song song', 'Parallel'), s('\\mid', 'Chia hết', 'Divides'), s('\\nmid', 'Không chia hết', 'Does not divide'),
      s('\\not\\equiv', 'Không đồng nhất', 'Not identical'), s('\\lesssim', 'Nhỏ hơn hoặc xấp xỉ', 'Less or similar'),
      s('\\gtrsim', 'Lớn hơn hoặc xấp xỉ', 'Greater or similar'),
    ],
  },
  {
    id: 'spaces', vi: 'Khoảng trắng & dấu chấm', en: 'Spaces & ellipses', face: '\\cdots\\,\\therefore', cols: 6,
    items: [
      t('\\,', 'Khoảng hẹp', 'Thin space', '|\\,|'), t('\\:', 'Khoảng vừa', 'Medium space', '|\\:|'),
      t('\\;', 'Khoảng rộng', 'Thick space', '|\\;|'), t('\\quad', 'Khoảng 1em', 'Em space', '|\\quad|'),
      t('\\qquad', 'Khoảng 2em', 'Two em space', '|\\qquad|'), s('\\ldots', 'Dấu ba chấm', 'Ellipsis'),
      s('\\cdots', 'Ba chấm giữa', 'Midline ellipsis'), s('\\vdots', 'Ba chấm dọc', 'Vertical ellipsis'),
      s('\\ddots', 'Ba chấm chéo', 'Diagonal ellipsis'), s('\\therefore', 'Do đó', 'Therefore'),
      s('\\because', 'Vì', 'Because'),
    ],
  },
  {
    id: 'embellishments', vi: 'Dấu trang trí', en: 'Embellishments', face: '\\dot{a}\\,\\vec{a}', cols: 6,
    items: [
      t('\\dot{#0}', 'Dấu chấm', 'Dot', '\\dot{x}'), t('\\ddot{#0}', 'Hai chấm', 'Double dot', '\\ddot{x}'),
      t('\\dddot{#0}', 'Ba chấm', 'Triple dot', '\\dddot{x}'), t("#0'", 'Phẩy', 'Prime', "x'"),
      t("#0''", 'Hai phẩy', 'Double prime', "x''"), t('\\hat{#0}', 'Mũ', 'Hat', '\\hat{x}'),
      t('\\check{#0}', 'Mũ ngược', 'Check', '\\check{x}'), t('\\tilde{#0}', 'Dấu ngã', 'Tilde', '\\tilde{x}'),
      t('\\bar{#0}', 'Gạch trên', 'Bar', '\\bar{x}'), t('\\vec{#0}', 'Vectơ', 'Vector', '\\vec{x}'),
      t('\\overrightarrow{#0}', 'Mũi tên phải trên', 'Right arrow over', '\\overrightarrow{AB}'),
      t('\\overleftarrow{#0}', 'Mũi tên trái trên', 'Left arrow over', '\\overleftarrow{AB}'),
      t('\\overleftrightarrow{#0}', 'Mũi tên hai chiều trên', 'Two-way arrow over', '\\overleftrightarrow{AB}'),
      t('\\acute{#0}', 'Dấu sắc', 'Acute', '\\acute{x}'), t('\\grave{#0}', 'Dấu huyền', 'Grave', '\\grave{x}'),
      t('\\breve{#0}', 'Dấu trăng', 'Breve', '\\breve{x}'), t('\\cancel{#0}', 'Gạch chéo', 'Strike-through', '\\cancel{x}'),
      t('\\widehat{#0}', 'Mũ rộng (góc)', 'Wide hat (angle)', '\\widehat{ABC}'),
    ],
  },
  {
    id: 'operators', vi: 'Phép toán', en: 'Operator symbols', face: '\\pm\\bullet\\otimes', cols: 8,
    items: [
      s('+', 'Cộng', 'Plus'), s('-', 'Trừ', 'Minus'), s('\\pm', 'Cộng trừ', 'Plus-minus'), s('\\mp', 'Trừ cộng', 'Minus-plus'),
      s('\\times', 'Nhân', 'Times'), s('\\div', 'Chia', 'Divide'), s('\\cdot', 'Chấm nhân', 'Dot'), s('\\ast', 'Dấu sao', 'Asterisk'),
      s('\\star', 'Ngôi sao', 'Star'), s('\\circ', 'Hợp (vòng)', 'Composition'), s('\\bullet', 'Chấm tròn', 'Bullet'),
      s('\\oplus', 'Cộng vòng', 'Circled plus'), s('\\ominus', 'Trừ vòng', 'Circled minus'), s('\\otimes', 'Nhân vòng', 'Circled times'),
      s('\\oslash', 'Chia vòng', 'Circled slash'), s('\\odot', 'Chấm vòng', 'Circled dot'), s('\\wedge', 'Và', 'Wedge'),
      s('\\vee', 'Hoặc', 'Vee'), s('\\cap', 'Giao', 'Intersection'), s('\\cup', 'Hợp', 'Union'),
      s('\\setminus', 'Hiệu tập hợp', 'Set minus'), s('/', 'Gạch chéo', 'Slash'),
    ],
  },
  {
    id: 'arrows', vi: 'Mũi tên', en: 'Arrow symbols', face: '\\to\\Leftrightarrow\\downarrow', cols: 8,
    items: [
      s('\\to', 'Mũi tên phải', 'Right arrow'), s('\\leftarrow', 'Mũi tên trái', 'Left arrow'),
      s('\\leftrightarrow', 'Hai chiều', 'Left-right arrow'), s('\\uparrow', 'Lên', 'Up arrow'),
      s('\\downarrow', 'Xuống', 'Down arrow'), s('\\updownarrow', 'Lên xuống', 'Up-down arrow'),
      s('\\Rightarrow', 'Suy ra', 'Implies'), s('\\Leftarrow', 'Được suy ra từ', 'Implied by'),
      s('\\Leftrightarrow', 'Tương đương', 'If and only if'), s('\\Uparrow', 'Lên (đôi)', 'Double up'),
      s('\\Downarrow', 'Xuống (đôi)', 'Double down'), s('\\mapsto', 'Ánh xạ', 'Maps to'),
      s('\\longrightarrow', 'Mũi tên dài', 'Long right arrow'), s('\\longleftarrow', 'Mũi tên dài trái', 'Long left arrow'),
      s('\\Longrightarrow', 'Suy ra (dài)', 'Long implies'), s('\\Longleftrightarrow', 'Tương đương (dài)', 'Long iff'),
      s('\\rightleftharpoons', 'Thuận nghịch', 'Equilibrium'), s('\\nearrow', 'Chéo lên', 'North-east'),
      s('\\searrow', 'Chéo xuống', 'South-east'), s('\\hookrightarrow', 'Nhúng', 'Hook arrow'),
    ],
  },
  {
    id: 'logic', vi: 'Logic', en: 'Logical symbols', face: '\\therefore\\forall\\exists', cols: 7,
    items: [
      s('\\therefore', 'Do đó', 'Therefore'), s('\\because', 'Vì', 'Because'), s('\\forall', 'Với mọi', 'For all'),
      s('\\exists', 'Tồn tại', 'There exists'), s('\\nexists', 'Không tồn tại', 'Does not exist'),
      s('\\neg', 'Phủ định', 'Not'), s('\\land', 'Và', 'And'), s('\\lor', 'Hoặc', 'Or'), s('\\top', 'Đúng', 'True'),
      s('\\bot', 'Sai', 'False'), s('\\vdash', 'Suy diễn', 'Proves'), s('\\models', 'Thỏa', 'Models'),
      s('\\Rightarrow', 'Kéo theo', 'Implies'), s('\\Leftrightarrow', 'Tương đương', 'Equivalent'),
    ],
  },
  {
    id: 'sets', vi: 'Tập hợp', en: 'Set theory symbols', face: '\\notin\\cap\\subset', cols: 8,
    items: [
      s('\\in', 'Thuộc', 'Element of'), s('\\notin', 'Không thuộc', 'Not element of'), s('\\ni', 'Chứa phần tử', 'Contains'),
      s('\\cap', 'Giao', 'Intersection'), s('\\cup', 'Hợp', 'Union'), s('\\subset', 'Tập con', 'Subset'),
      s('\\supset', 'Chứa', 'Superset'), s('\\subseteq', 'Tập con hoặc bằng', 'Subset or equal'),
      s('\\supseteq', 'Chứa hoặc bằng', 'Superset or equal'), s('\\not\\subset', 'Không là tập con', 'Not subset'),
      s('\\varnothing', 'Tập rỗng', 'Empty set'), s('\\setminus', 'Hiệu', 'Set minus'),
      s('\\mathbb{N}', 'Số tự nhiên', 'Naturals'), s('\\mathbb{N}^{*}', 'Số tự nhiên khác 0', 'Positive naturals'),
      s('\\mathbb{Z}', 'Số nguyên', 'Integers'), s('\\mathbb{Q}', 'Số hữu tỉ', 'Rationals'), s('\\mathbb{R}', 'Số thực', 'Reals'),
      s('\\mathbb{C}', 'Số phức', 'Complex'), s('\\aleph', 'Aleph', 'Aleph'),
    ],
  },
  {
    id: 'misc', vi: 'Ký hiệu khác', en: 'Miscellaneous symbols', face: '\\partial\\infty\\ell', cols: 8,
    items: [
      s('\\partial', 'Đạo hàm riêng', 'Partial'), s('\\infty', 'Vô cực', 'Infinity'), s('\\ell', 'Chữ l', 'Script l'),
      s('\\hbar', 'h gạch', 'h-bar'), s('\\nabla', 'Nabla', 'Nabla'), s('\\Re', 'Phần thực', 'Real part'),
      s('\\Im', 'Phần ảo', 'Imaginary part'), s('\\wp', 'Weierstrass', 'Weierstrass p'), s('\\angle', 'Góc', 'Angle'),
      s('\\measuredangle', 'Góc đo', 'Measured angle'), s('\\triangle', 'Tam giác', 'Triangle'), s('\\square', 'Hình vuông', 'Square'),
      s('^{\\circ}', 'Độ', 'Degree'), s('\\prime', 'Phẩy', 'Prime'), s('\\%', 'Phần trăm', 'Percent'),
      s('\\dagger', 'Chữ thập', 'Dagger'), s('\\backslash', 'Gạch ngược', 'Backslash'), s('\\pi', 'Pi', 'Pi'),
      s('\\mathrm{e}', 'Số e', 'Euler e'), s('\\mathrm{i}', 'Đơn vị ảo', 'Imaginary unit'),
    ],
  },
  {
    id: 'greek', vi: 'Chữ Hy Lạp thường', en: 'Lowercase Greek', face: '\\lambda\\omega\\theta', cols: 8,
    items: [
      'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa',
      'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi',
      'chi', 'psi', 'omega',
    ].map((g) => s(`\\${g}`, g)),
  },
  {
    id: 'Greek', vi: 'Chữ Hy Lạp hoa', en: 'Uppercase Greek', face: '\\Lambda\\Omega\\Delta', cols: 6,
    items: ['Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega'].map((g) =>
      s(`\\${g}`, g),
    ),
  },
];

/* ----------------------------- row 2: templates ----------------------------- */

export const TEMPLATE_PALETTES: ToolPalette[] = [
  {
    id: 'fences', vi: 'Ngoặc', en: 'Fence templates', face: '(\\square)[\\square]', cols: 5,
    items: [
      t('\\left(#0\\right)', 'Ngoặc tròn', 'Parentheses'), t('\\left[#0\\right]', 'Ngoặc vuông', 'Brackets'),
      t('\\left\\{#0\\right\\}', 'Ngoặc nhọn', 'Braces'), t('\\left\\langle#0\\right\\rangle', 'Ngoặc góc', 'Angle brackets'),
      t('\\left|#0\\right|', 'Trị tuyệt đối', 'Absolute value'), t('\\left\\|#0\\right\\|', 'Chuẩn', 'Norm'),
      t('\\left\\lfloor#0\\right\\rfloor', 'Phần nguyên', 'Floor'), t('\\left\\lceil#0\\right\\rceil', 'Trần', 'Ceiling'),
      t('\\left[#0\\right)', 'Nửa khoảng [ )', 'Half-open [ )'), t('\\left(#0\\right]', 'Nửa khoảng ( ]', 'Half-open ( ]'),
      t('\\left]#0\\right[', 'Khoảng ] [', 'Open interval ] ['), t('\\left(#0\\right.', 'Chỉ ngoặc trái', 'Left paren only'),
      t('\\left.#0\\right)', 'Chỉ ngoặc phải', 'Right paren only'), t('\\left\\{#0\\right.', 'Chỉ ngoặc nhọn trái', 'Left brace only'),
      t('\\left[#0\\right.', 'Chỉ ngoặc vuông trái', 'Left bracket only'), t('\\left.#0\\right|', 'Thanh dọc phải', 'Right bar only'),
    ],
  },
  {
    id: 'fractions', vi: 'Phân số & căn', en: 'Fraction & radical templates', face: '\\frac{\\square}{\\square}\\sqrt{\\square}', cols: 4,
    items: [
      t('\\frac{#0}{#?}', 'Phân số', 'Full-size fraction'), t('\\dfrac{#0}{#?}', 'Phân số cỡ lớn', 'Display fraction'),
      t('\\tfrac{#0}{#?}', 'Phân số cỡ nhỏ', 'Reduced fraction'), t('#0/#?', 'Phân số gạch chéo', 'Slash fraction'),
      t('#?\\frac{#?}{#?}', 'Hỗn số', 'Mixed number'), t('\\sqrt{#0}', 'Căn bậc hai', 'Square root'),
      t('\\sqrt[#?]{#0}', 'Căn bậc n', 'Nth root'), t('\\sqrt[3]{#0}', 'Căn bậc ba', 'Cube root'),
    ],
  },
  {
    id: 'scripts', vi: 'Chỉ số trên & dưới', en: 'Subscript & superscript templates', face: '\\square^{\\square}\\square_{\\square}', cols: 4,
    items: [
      t('#@^{#?}', 'Chỉ số trên', 'Superscript'), t('#@_{#?}', 'Chỉ số dưới', 'Subscript'),
      t('#@_{#?}^{#?}', 'Trên và dưới', 'Sub & superscript'), t('{}^{#?}_{#?}#0', 'Chỉ số trái', 'Left scripts'),
      t('{}^{#?}#0', 'Chỉ số trên trái', 'Left superscript'), t('{}_{#?}#0', 'Chỉ số dưới trái', 'Left subscript'),
      t('\\overset{#?}{#0}', 'Chữ phía trên', 'Over script'), t('\\underset{#?}{#0}', 'Chữ phía dưới', 'Under script'),
    ],
  },
  {
    id: 'sums', vi: 'Tổng', en: 'Summation templates', face: '\\sum\\square', cols: 4,
    items: [
      t('\\sum #?', 'Tổng', 'Sum'), t('\\sum_{#?}#?', 'Tổng có chỉ số dưới', 'Sum, lower limit'),
      t('\\sum_{#?}^{#?}#?', 'Tổng có cận', 'Sum, both limits'), t('\\sum\\limits_{#?}^{#?}#?', 'Tổng cận trên/dưới', 'Sum, limits above/below'),
      t('\\sum\\nolimits_{#?}^{#?}#?', 'Tổng cận bên phải', 'Sum, side limits'), t('\\sum_{i=1}^{n}#?', 'Tổng i=1..n', 'Sum i=1..n'),
    ],
  },
  {
    id: 'integrals', vi: 'Tích phân', en: 'Integral templates', face: '\\int\\square\\oint', cols: 4,
    items: [
      t('\\int #?\\,\\mathrm{d}x', 'Nguyên hàm', 'Indefinite integral'),
      t('\\int_{#?}^{#?}#?\\,\\mathrm{d}x', 'Tích phân xác định', 'Definite integral'),
      t('\\int\\limits_{#?}^{#?}#?', 'Tích phân cận trên/dưới', 'Integral, limits above/below'),
      t('\\iint_{#?}#?', 'Tích phân kép', 'Double integral'), t('\\iiint_{#?}#?', 'Tích phân bội ba', 'Triple integral'),
      t('\\oint_{#?}#?', 'Tích phân đường', 'Contour integral'), t('\\int #?', 'Dấu tích phân', 'Integral sign'),
      t('\\left.#0\\right|_{#?}^{#?}', 'Thế cận', 'Evaluation bar'),
    ],
  },
  {
    id: 'bars', vi: 'Gạch & mũi tên trên/dưới', en: 'Underbar & overbar templates', face: '\\overline{\\square}\\underline{\\square}', cols: 4,
    items: [
      t('\\overline{#0}', 'Gạch trên', 'Overbar'), t('\\underline{#0}', 'Gạch dưới', 'Underbar'),
      t('\\overline{\\overline{#0}}', 'Gạch trên đôi', 'Double overbar'), t('\\overrightarrow{#0}', 'Vectơ', 'Right arrow over'),
      t('\\overleftarrow{#0}', 'Mũi tên trái trên', 'Left arrow over'), t('\\overleftrightarrow{#0}', 'Mũi tên hai chiều', 'Two-way arrow over'),
      t('\\overbrace{#0}^{#?}', 'Ngoặc trên', 'Overbrace'), t('\\underbrace{#0}_{#?}', 'Ngoặc dưới', 'Underbrace'),
      t('\\overset{\\frown}{#0}', 'Cung', 'Arc'),
    ],
  },
  {
    id: 'labeled', vi: 'Mũi tên có nhãn', en: 'Labeled arrow templates', face: '\\xrightarrow{\\square}', cols: 4,
    items: [
      t('\\xrightarrow{#?}', 'Mũi tên phải có nhãn trên', 'Right arrow, label above'),
      t('\\xleftarrow{#?}', 'Mũi tên trái có nhãn trên', 'Left arrow, label above'),
      t('\\xrightarrow[#?]{#?}', 'Nhãn trên và dưới', 'Labels above and below'),
      t('\\xleftrightarrow{#?}', 'Hai chiều có nhãn', 'Two-way, label above'),
      t('\\xRightarrow{#?}', 'Suy ra có nhãn', 'Implies, label above'),
      t('\\xrightleftharpoons{#?}', 'Thuận nghịch có nhãn', 'Equilibrium, label above'),
    ],
  },
  {
    id: 'products', vi: 'Tích & tập hợp', en: 'Products & set theory templates', face: '\\prod\\square\\bigcup', cols: 4,
    items: [
      t('\\prod_{#?}^{#?}#?', 'Tích', 'Product'), t('\\coprod_{#?}^{#?}#?', 'Đối tích', 'Coproduct'),
      t('\\bigcup_{#?}^{#?}#?', 'Hợp lớn', 'Big union'), t('\\bigcap_{#?}^{#?}#?', 'Giao lớn', 'Big intersection'),
      t('\\bigcup_{#?}#?', 'Hợp lớn (dưới)', 'Big union, lower'), t('\\bigcap_{#?}#?', 'Giao lớn (dưới)', 'Big intersection, lower'),
      t('\\bigvee_{#?}#?', 'Hoặc lớn', 'Big or'), t('\\bigwedge_{#?}#?', 'Và lớn', 'Big and'),
    ],
  },
  {
    id: 'matrices', vi: 'Ma trận & hệ', en: 'Matrix templates', face: '\\begin{smallmatrix}\\square&\\square\\\\\\square&\\square\\end{smallmatrix}', cols: 4,
    items: [
      t('\\begin{matrix}#?&#?\\\\#?&#?\\end{matrix}', 'Ma trận 2×2', '2×2 matrix'),
      t('\\begin{matrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{matrix}', 'Ma trận 3×3', '3×3 matrix'),
      t('\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', 'Ma trận ngoặc tròn', 'Parenthesized matrix'),
      t('\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}', 'Ma trận ngoặc vuông', 'Bracketed matrix'),
      t('\\begin{vmatrix}#?&#?\\\\#?&#?\\end{vmatrix}', 'Định thức', 'Determinant'),
      t('\\begin{pmatrix}#?\\\\#?\\end{pmatrix}', 'Vectơ cột', 'Column vector'),
      t('\\begin{pmatrix}#?&#?\\end{pmatrix}', 'Vectơ hàng', 'Row vector'),
      t('\\begin{cases}#?\\\\#?\\end{cases}', 'Hệ 2 phương trình', 'System of 2'),
      t('\\begin{cases}#?\\\\#?\\\\#?\\end{cases}', 'Hệ 3 phương trình', 'System of 3'),
      t('\\left[\\begin{aligned}&#?\\\\&#?\\end{aligned}\\right.', 'Tuyển (hoặc)', 'Either-or'),
      t('\\begin{aligned}#?&=#?\\\\&=#?\\end{aligned}', 'Căn theo dấu =', 'Aligned at ='),
      t('\\begin{cases}#?&\\text{khi }#?\\\\#?&\\text{khi }#?\\end{cases}', 'Hàm từng khúc', 'Piecewise'),
    ],
  },
];

/* --------------------------------- small bar -------------------------------- */

export const SMALL_BAR: ToolItem[] = [
  s('\\pi', 'Pi'), s('\\infty', 'Vô cực', 'Infinity'), s('\\to', 'Tiến tới', 'Tends to'), s('\\partial', 'Đạo hàm riêng', 'Partial'),
  s('\\le', 'Nhỏ hơn hoặc bằng', 'Less or equal'), s('\\ge', 'Lớn hơn hoặc bằng', 'Greater or equal'),
  s('\\times', 'Nhân', 'Times'), s('\\pm', 'Cộng trừ', 'Plus-minus'), s('\\approx', 'Xấp xỉ', 'Approximately'),
  s('\\ne', 'Khác', 'Not equal'), s('\\in', 'Thuộc', 'Element of'), s('\\Rightarrow', 'Suy ra', 'Implies'),
  s('\\Leftrightarrow', 'Tương đương', 'Iff'), s('\\angle', 'Góc', 'Angle'), s('^{\\circ}', 'Độ', 'Degree'),
  t('\\frac{#0}{#?}', 'Phân số', 'Fraction'), t('\\sqrt{#0}', 'Căn', 'Square root'), t('#@^{#?}', 'Mũ', 'Superscript'),
  t('#@_{#?}', 'Chỉ số dưới', 'Subscript'), t('\\left(#0\\right)', 'Ngoặc', 'Parentheses'),
  s('\\alpha', 'alpha'), s('\\beta', 'beta'), s('\\Delta', 'Delta'), s('\\varphi', 'phi'),
];

/* -------------------------------- tabbed bar -------------------------------- */

export const TABS: ToolPalette[] = [
  {
    id: 'algebra', vi: 'Đại số', en: 'Algebra', face: '',
    items: [
      t('x^{2}', 'x bình phương', 'x squared'), t('#0^{-1}', 'Nghịch đảo', 'Inverse'), t('\\frac{1}{2}', 'Một phần hai', 'One half'),
      t('x_{1},x_{2}', 'Hai nghiệm', 'Two roots'), t('ax^{2}+bx+c=0', 'Phương trình bậc hai', 'Quadratic equation'),
      t('\\Delta=b^{2}-4ac', 'Biệt thức', 'Discriminant'), t('x=\\frac{-b\\pm\\sqrt{\\Delta}}{2a}', 'Công thức nghiệm', 'Quadratic formula'),
      t('\\left(a+b\\right)^{2}=a^{2}+2ab+b^{2}', 'Hằng đẳng thức', 'Square of a sum'),
      t('a^{2}-b^{2}=\\left(a-b\\right)\\left(a+b\\right)', 'Hiệu hai bình phương', 'Difference of squares'),
      t('\\left|#0\\right|', 'Giá trị tuyệt đối', 'Absolute value'), t('\\log_{#?}#?', 'Logarit', 'Logarithm'),
      t('\\ln #?', 'ln', 'Natural log'), t('e^{#?}', 'Hàm mũ', 'Exponential'),
      t('\\begin{cases}#?\\\\#?\\end{cases}', 'Hệ phương trình', 'System of equations'),
      t('\\left[\\begin{aligned}&#?\\\\&#?\\end{aligned}\\right.', 'Tuyển (hoặc)', 'Either-or'),
    ],
  },
  {
    id: 'derivations', vi: 'Đạo hàm & tích phân', en: 'Derivations', face: '',
    items: [
      t("f'\\left(x\\right)", 'Đạo hàm', 'Derivative'), t("f''\\left(x\\right)", 'Đạo hàm cấp hai', 'Second derivative'),
      t('\\frac{\\mathrm{d}#?}{\\mathrm{d}x}', 'Đạo hàm Leibniz', 'Leibniz derivative'),
      t('\\frac{\\mathrm{d}^{2}#?}{\\mathrm{d}x^{2}}', 'Đạo hàm cấp hai Leibniz', 'Second Leibniz derivative'),
      t('\\frac{\\partial #?}{\\partial x}', 'Đạo hàm riêng', 'Partial derivative'),
      t('\\lim_{#?\\to #?}#?', 'Giới hạn', 'Limit'), t('\\lim_{x\\to +\\infty}#?', 'Giới hạn tại +∞', 'Limit at +∞'),
      t('\\lim_{x\\to #?^{+}}#?', 'Giới hạn phải', 'Right-hand limit'), t('\\lim_{x\\to #?^{-}}#?', 'Giới hạn trái', 'Left-hand limit'),
      t('\\int_{#?}^{#?}#?\\,\\mathrm{d}x', 'Tích phân', 'Definite integral'), t('\\int #?\\,\\mathrm{d}x', 'Nguyên hàm', 'Antiderivative'),
      t('\\left.#0\\right|_{#?}^{#?}', 'Thế cận', 'Evaluation bar'), t('\\sum_{n=1}^{\\infty}#?', 'Chuỗi', 'Series'),
    ],
  },
  {
    id: 'statistics', vi: 'Thống kê & xác suất', en: 'Statistics', face: '',
    items: [
      t('\\bar{x}', 'Trung bình', 'Mean'), t('\\sigma', 'Độ lệch chuẩn', 'Standard deviation'), t('\\sigma^{2}', 'Phương sai', 'Variance'),
      t('\\mu', 'Kỳ vọng', 'Population mean'), t('\\binom{n}{k}', 'Tổ hợp', 'Binomial'), t('C_{n}^{k}', 'Tổ hợp (VN)', 'Combinations'),
      t('A_{n}^{k}', 'Chỉnh hợp', 'Arrangements'), t('n!', 'Giai thừa', 'Factorial'), t('P\\left(A\\right)', 'Xác suất', 'Probability'),
      t('P\\left(A\\mid B\\right)', 'Xác suất có điều kiện', 'Conditional probability'), t('E\\left(X\\right)', 'Kỳ vọng E(X)', 'Expectation'),
      t('V\\left(X\\right)', 'Phương sai V(X)', 'Variance V(X)'),
      t('\\bar{x}=\\frac{1}{n}\\sum_{i=1}^{n}x_{i}', 'Công thức trung bình', 'Mean formula'),
    ],
  },
  {
    id: 'matrices', vi: 'Ma trận', en: 'Matrices', face: '',
    items: [
      t('\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', 'Ma trận 2×2', '2×2 matrix'),
      t('\\begin{pmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{pmatrix}', 'Ma trận 3×3', '3×3 matrix'),
      t('\\begin{vmatrix}#?&#?\\\\#?&#?\\end{vmatrix}', 'Định thức', 'Determinant'), t('#0^{T}', 'Chuyển vị', 'Transpose'),
      t('#0^{-1}', 'Ma trận nghịch đảo', 'Inverse'), t('\\det\\left(#0\\right)', 'det', 'det'),
      t('\\begin{pmatrix}#?\\\\#?\\\\#?\\end{pmatrix}', 'Vectơ cột 3', '3-vector'),
      t('\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}', 'Ma trận đơn vị', 'Identity matrix'),
    ],
  },
  {
    id: 'sets', vi: 'Tập hợp', en: 'Sets', face: '',
    items: [
      t('\\left\\{#0\\right\\}', 'Tập hợp', 'Set'), t('\\left\\{x\\in\\mathbb{R}\\mid #?\\right\\}', 'Tập có điều kiện', 'Set builder'),
      s('\\in', 'Thuộc', 'Element of'), s('\\notin', 'Không thuộc', 'Not element of'), s('\\subset', 'Tập con', 'Subset'),
      s('\\cup', 'Hợp', 'Union'), s('\\cap', 'Giao', 'Intersection'), s('\\setminus', 'Hiệu', 'Difference'),
      s('\\varnothing', 'Rỗng', 'Empty set'), s('\\mathbb{N}', 'N'), s('\\mathbb{Z}', 'Z'), s('\\mathbb{Q}', 'Q'), s('\\mathbb{R}', 'R'),
      t('\\left[#?;#?\\right]', 'Đoạn', 'Closed interval'), t('\\left(#?;#?\\right)', 'Khoảng', 'Open interval'),
      t('\\left[#?;#?\\right)', 'Nửa khoảng', 'Half-open interval'), t('\\left(-\\infty;#?\\right)', 'Khoảng vô hạn', 'Infinite interval'),
    ],
  },
  {
    id: 'trig', vi: 'Lượng giác', en: 'Trig', face: '',
    items: [
      t('\\sin #?', 'sin'), t('\\cos #?', 'cos'), t('\\tan #?', 'tan'), t('\\cot #?', 'cot'), t('\\sin^{2}#?', 'sin²'),
      t('\\cos^{2}#?', 'cos²'), t('\\arcsin #?', 'arcsin'), t('\\arccos #?', 'arccos'), t('\\arctan #?', 'arctan'),
      t('\\sin^{2}x+\\cos^{2}x=1', 'Hằng đẳng thức cơ bản', 'Pythagorean identity'),
      t('\\tan x=\\frac{\\sin x}{\\cos x}', 'Định nghĩa tan', 'Tangent definition'),
      t('x=#?+k2\\pi,\\ k\\in\\mathbb{Z}', 'Nghiệm tuần hoàn', 'Periodic solution'),
      t('\\frac{\\pi}{#?}', 'π chia', 'Pi over'), t('#?^{\\circ}', 'Độ', 'Degrees'),
    ],
  },
  {
    id: 'geometry', vi: 'Hình học', en: 'Geometry', face: '',
    items: [
      s('\\angle', 'Góc', 'Angle'), t('\\widehat{#0}', 'Góc (mũ)', 'Angle hat', '\\widehat{ABC}'), s('\\triangle', 'Tam giác', 'Triangle'),
      s('\\perp', 'Vuông góc', 'Perpendicular'), s('\\parallel', 'Song song', 'Parallel'), s('\\sim', 'Đồng dạng', 'Similar'),
      s('\\cong', 'Bằng nhau', 'Congruent'), t('\\overrightarrow{#0}', 'Vectơ', 'Vector', '\\overrightarrow{AB}'),
      t('\\overline{#0}', 'Đoạn thẳng', 'Segment', '\\overline{AB}'), t('\\overset{\\frown}{#0}', 'Cung', 'Arc', '\\overset{\\frown}{AB}'),
      s('^{\\circ}', 'Độ', 'Degree'), t('\\left(O;R\\right)', 'Đường tròn', 'Circle'), t('S_{\\triangle #?}', 'Diện tích tam giác', 'Triangle area'),
      t('\\left|\\overrightarrow{#0}\\right|', 'Độ dài vectơ', 'Vector length', '\\left|\\overrightarrow{AB}\\right|'),
      t('\\overrightarrow{a}\\cdot\\overrightarrow{b}', 'Tích vô hướng', 'Dot product'),
    ],
  },
];

/* ------------------------------ keyboard chords ----------------------------- */

/** Ctrl+G, <letter> → Greek letter (MathType uses the Symbol-font mapping). */
export const GREEK_KEYS: Record<string, string> = {
  a: '\\alpha', b: '\\beta', c: '\\chi', d: '\\delta', e: '\\varepsilon', f: '\\varphi', g: '\\gamma', h: '\\eta',
  i: '\\iota', j: '\\phi', k: '\\kappa', l: '\\lambda', m: '\\mu', n: '\\nu', o: 'o', p: '\\pi', q: '\\theta',
  r: '\\rho', s: '\\sigma', t: '\\tau', u: '\\upsilon', v: '\\varpi', w: '\\omega', x: '\\xi', y: '\\psi', z: '\\zeta',
  D: '\\Delta', F: '\\Phi', G: '\\Gamma', J: '\\vartheta', L: '\\Lambda', P: '\\Pi', Q: '\\Theta', S: '\\Sigma',
  U: '\\Upsilon', W: '\\Omega', X: '\\Xi', Y: '\\Psi',
};

/** Ctrl+K, <key> → symbol. */
export const SYMBOL_KEYS: Record<string, string> = {
  i: '\\infty', a: '\\to', d: '\\partial', t: '\\times', '+': '\\pm', '-': '\\mp', '=': '\\equiv', '<': '\\le',
  '>': '\\ge', '/': '\\ne', '~': '\\approx', e: '\\in', E: '\\notin', c: '\\subset', u: '\\cup', n: '\\cap',
  '.': '\\cdot', o: '^{\\circ}', '*': '\\ast', p: '\\perp', l: '\\parallel', g: '\\angle', r: '\\Rightarrow',
  q: '\\Leftrightarrow',
};

/** Ctrl+T, <key> → template. */
export const TEMPLATE_KEYS: Record<string, string> = {
  f: '\\frac{#0}{#?}', n: '\\sqrt[#?]{#0}', r: '\\sqrt{#0}', s: '\\sum_{#?}^{#?}#?', p: '\\prod_{#?}^{#?}#?',
  i: '\\int_{#?}^{#?}#?', l: '\\lim_{#?\\to #?}#?', m: '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}',
  c: '\\begin{cases}#?\\\\#?\\end{cases}', b: '\\left\\{#0\\right\\}', a: '\\left|#0\\right|', v: '\\overrightarrow{#0}',
};
