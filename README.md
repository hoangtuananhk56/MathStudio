# MathStudio — Soạn công thức Toán (và sắp tới: vẽ hình học) cho Microsoft Word

Add-in Office (Office.js) chạy trên **Word cho Windows, macOS và Word Online**.

- Công thức được chèn dưới dạng **công thức Word gốc (OMML)**: không phải ảnh, sửa được bằng trình soạn của Word, tìm kiếm và in sắc nét.
- Mỗi công thức được bọc trong một Content Control ẩn. Tag của Content Control chứa **mã LaTeX nguồn**, nên copy công thức sang tài liệu khác vẫn mở lại để sửa được.
- Giao diện thân thiện cho trẻ từ 7 tuổi, phong cách Google/Apple, có chế độ **Cơ bản / Nâng cao** và hai ngôn ngữ **Việt / Anh**.

## Hai dạng chèn công thức

| | **Ảnh vector (mặc định, giống MathType)** | **Công thức Word (OMML)** |
|---|---|---|
| Cách vẽ | MathJax 4 → SVG, phông vẽ thành nét (`src/core/render-svg.ts`) | Temml → MathML → OMML (`src/core/mathml-to-omml.ts`) |
| Hiển thị | Giống hệt trên mọi máy; phân số trong dòng cỡ lớn như MathType | Do Word tự dàn trang |
| Sửa | Bằng MathStudio (LaTeX lưu trong tag và alt-text) | Bằng MathStudio, hoặc bằng công cụ phương trình của Word |
| Chuyển đổi | Nút **Đổi dạng** trên Ribbon | Nút **Đổi dạng** trên Ribbon |

Chọn dạng mặc định trong hộp thoại (thanh trạng thái **Dạng**, hoặc menu **Định dạng**). Ảnh được chèn dạng SVG kèm PNG dự phòng, canh theo đường chân chữ, kích thước tính theo cỡ chữ của đoạn văn.

**Nhấp đúp để sửa** (Windows): chạy `npm run hotkeys`. Chương trình ở khay hệ thống nhận ra cú nhấp đúp vào công thức MathStudio rồi mở trình soạn. Cách này dùng được cho cả hai dạng.

## Chuyển đổi với MathType

Nút **MathType ⇄** trên Ribbon mở khung chuyển đổi.

- **MathType → MathStudio** (`src/core/mtef.ts`, `src/core/docx-mathtype.ts`): đọc file .docx đang mở và tìm mọi đối tượng OLE `Equation.DSMT*` / `Equation.3`. Với mỗi đối tượng: lấy luồng `Equation Native`, đọc định dạng MTEF (bản 3 và 5), chuyển sang LaTeX giữ nguyên cỡ chữ gốc, rồi thay bằng công thức MathStudio (dạng ảnh hoặc dạng công thức Word). Kết quả **mở thành tài liệu mới**; tài liệu gốc giữ nguyên. Công thức không đọc được thì giữ nguyên MathType và ghi vào báo cáo. Không cần cài MathType.
- **MathStudio → MathType**: đổi công thức MathStudio thành công thức Word thuần (sau đó dùng *MathType ▸ Convert Equations*) hoặc mã `$TeX$` (sau đó dùng *MathType ▸ Toggle TeX*).

Kiểm tra với một tài liệu thật:

```bash
MT_DOCX=path/to/file.docx npx vitest run tests/docx-mathtype.test.ts   # ghi ra file-omml.docx và file-image.docx
```

## Trải nghiệm giống MathType

| MathType | MathStudio |
|---|---|
| Tab Ribbon: Inline / Display / Right- & Left-Numbered | Nhóm **Chèn công thức**: Trong dòng, Riêng dòng, Đánh số phải, Đánh số trái |
| Toggle TeX, Update Equation Numbers | **Chuyển TeX**, **Cập nhật số** |
| Menu File / Edit / View / Format / Style / Size / Help | Tệp / Sửa / Xem / Định dạng / Kiểu / Cỡ / Trợ giúp |
| Hàng bảng ký hiệu (≤≠≈, ∂∞ℓ, λωθ…) và hàng bảng mẫu (ngoặc, phân số, tổng, tích phân, ma trận…) | Giống thứ tự và nhóm của MathType (`src/editor/mathtype/data.ts`) |
| Small bar, Tabbed bar (Algebra, Derivations, Statistics, Matrices, Sets, Trig, Geometry) | Có, nội dung theo chương trình Việt Nam |
| Phím tắt Ctrl+F, Ctrl+R, Ctrl+H, Ctrl+L, Ctrl+J, Ctrl+9, Ctrl+I, Ctrl+G+chữ, Ctrl+K+phím, Ctrl+T+phím, Ctrl+Shift+E/=/F/I/B, Ctrl+S | Có; xem Trợ giúp ▸ Phím tắt (F1) |
| Thanh trạng thái Style / Size / Zoom | Có (mặc định 200%) |

Chế độ đơn giản cho học sinh nhỏ vẫn có trong **Xem ▸ Chế độ đơn giản**.

**Khác biệt do giới hạn của nền tảng Office Add-in:**
- Không bắt được thao tác **nhấp đúp** vào công thức. Muốn sửa, đặt con trỏ vào công thức rồi bấm **Sửa công thức**.
- Phím tắt trong Word (Ctrl+Alt+Q…) không có trên Office 2019; Microsoft 365 hỗ trợ được, sẽ bổ sung sau.
- Số thứ tự công thức là số tĩnh. Bấm **Cập nhật số** sau khi thêm hoặc xóa công thức đánh số; lệnh chèn tự đánh lại số.

## Kiến trúc

```
LaTeX (nguồn chuẩn, sinh từ MathLive)
   │  src/core/latex.ts            Temml: LaTeX → MathML
   ▼
MathML
   │  src/core/mathml-to-omml.ts   bộ chuyển đổi tự viết → OMML (font, nary, func, eqArr, ma trận…)
   ▼
OMML ── src/core/ooxml.ts ──► gói Flat-OPC + Content Control (tag = LaTeX) ──► Word.insertOoxml
   ▲
   │  src/core/omml-to-latex.ts    chuyển ngược, dùng cho công thức gốc của Word
   │                               hoặc công thức đã bị sửa tay trong Word
```

| Thư mục | Nội dung |
|---|---|
| `src/core/` | Lõi chuyển đổi, thuần TypeScript, có test |
| `src/office/` | Thao tác với Word (WordApi 1.3) và mở hộp thoại soạn thảo |
| `src/editor/` | Hộp thoại soạn công thức (React + MathLive) |
| `src/commands/` | Hàm xử lý các nút trên Ribbon |
| `src/taskpane/` | Khung "Hướng dẫn" và tải phông |
| `manifest.xml` | Manifest add-in (bản phát triển, `https://localhost:3000`) |
| `vendor/fonts/` | Phông toán học: STIX Two Math (OFL), TeX Gyre Termes Math và Latin Modern Math (GUST) |
| `scripts/` | Chép tài nguyên, tạo icon, script dựng thử trên Word (COM) |

## Lệnh

```bash
npm install
npm run dev          # xem trình soạn trong trình duyệt: http://localhost:3000/editor/index.html
npm test             # 240+ test chuyển đổi (LaTeX → OMML → LaTeX)
npm run build        # bản AppSource (Office.js lấy từ CDN của Microsoft) → dist/
npm run validate     # kiểm tra manifest
npm run start        # cài chứng chỉ localhost, chạy server HTTPS và mở Word kèm add-in
```

### Kiểm tra bằng Word thật (Windows, không cần chạy add-in)

```bash
WORD_EXPORT=out npx vitest run tests/word-export.test.ts
powershell -File scripts/word-render.ps1 -Dir out    # chèn mọi mẫu vào Word → out/render.pdf
```

## Phông chữ

| Phông | Ghi chú |
|---|---|
| **STIX Two Math** (mặc định) | Kiểu Times, gần MathType nhất, hiển thị trong Word đẹp nhất |
| TeX Gyre Termes Math | Kiểu Times cổ điển; khoảng cách sau chỉ số dưới hơi rộng |
| Latin Modern Math | Phong cách LaTeX |
| Cambria Math | Có sẵn trong Office, dùng làm phông dự phòng |

Phông phải được cài trên máy để hiển thị đúng; máy chưa cài thì Word tự dùng Cambria Math. Bộ cài đặt (bản trả phí) sẽ tự cài phông, còn bản AppSource có nút tải phông trong khung "Hướng dẫn".

## Lộ trình

- [x] Giai đoạn 1–2: nền tảng add-in, trình soạn công thức, chèn và sửa công thức OMML
- [ ] Bản offline: mirror Office.js cùng một server HTTPS cục bộ; bộ cài `.msi` (Windows) và `.pkg` (macOS) tự đăng ký add-in và cài phông
- [ ] Giai đoạn 3: vẽ hình học (dựng hình động, xuất SVG kèm trạng thái để sửa lại)
