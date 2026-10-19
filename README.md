# MathStudio — Soạn công thức và vẽ hình Toán cho Microsoft Word

Add-in Office (Office.js) chạy trên **Word cho Windows, macOS và Word Online**.

- Công thức được chèn dưới dạng **công thức Word gốc (OMML)**: không phải ảnh, sửa được bằng trình soạn của Word, tìm kiếm và in sắc nét.
- Mỗi công thức được bọc trong một Content Control ẩn. Tag của Content Control chứa **mã LaTeX nguồn**, nên copy công thức sang tài liệu khác vẫn mở lại để sửa được.
- Giao diện thân thiện cho trẻ từ 7 tuổi, phong cách Google/Apple, có chế độ **Cơ bản / Nâng cao** và hai ngôn ngữ **Việt / Anh**.

## Tải về và cài đặt

Tải bộ cài ở trang **[Releases](https://github.com/hoangtuananhk56/MathStudio/releases/latest)**: `MathStudio-Setup-Windows.exe` (Windows) hoặc `MathStudio-macOS.pkg` (macOS), đóng Word rồi mở file để cài. Hướng dẫn: **[Cài đặt](docs/CAI-DAT.md)** · **[Sử dụng](docs/HUONG-DAN-SU-DUNG.md)**.

Bộ cài chỉ đăng ký add-in với Word (cùng phông chữ toán học và, trên Windows, công cụ nhấp đúp để sửa); MathStudio được tải từ GitHub Pages mỗi khi mở Word nên luôn là bản mới nhất.

## Hai dạng chèn công thức

| | **Ảnh vector (mặc định, giống MathType)** | **Công thức Word (OMML)** |
|---|---|---|
| Cách vẽ | MathJax 4 → SVG, phông vẽ thành nét (`src/core/render-svg.ts`) | Temml → MathML → OMML (`src/core/mathml-to-omml.ts`) |
| Hiển thị | Giống hệt trên mọi máy; phân số trong dòng cỡ lớn như MathType | Do Word tự dàn trang |
| Sửa | Bằng MathStudio (LaTeX lưu trong tag và alt-text) | Bằng MathStudio, hoặc bằng công cụ phương trình của Word |
| Chuyển đổi | Nút **Đổi dạng** trên Ribbon | Nút **Đổi dạng** trên Ribbon |

Chọn dạng mặc định trong hộp thoại (thanh trạng thái **Dạng**, hoặc menu **Định dạng**). Ảnh được chèn dạng SVG kèm PNG dự phòng, canh theo đường chân chữ, kích thước tính theo cỡ chữ của đoạn văn.

**Nhấp đúp để sửa** (Windows): chạy `npm run hotkeys`. Chương trình ở khay hệ thống nhận ra cú nhấp đúp vào công thức MathStudio rồi mở trình soạn. Cách này dùng được cho cả hai dạng.

## Hình học (giai đoạn 3: hình phẳng 2D)

Nhóm **Hình học** trên Ribbon có hai nút: **Vẽ hình** và **Sửa hình**. Có thể nhấp đúp vào hình để sửa.

- **Bộ máy dựng hình động** (`src/geometry/`), viết bằng TypeScript thuần và có test. Kéo một điểm thì mọi đối tượng phụ thuộc tự cập nhật. Các nhóm công cụ:
  - điểm, điểm theo tọa độ, giao điểm, trung điểm, hình chiếu vuông góc
  - đoạn thẳng, đoạn thẳng cho trước độ dài, đường thẳng, tia, vectơ
  - vuông góc, song song, trung trực, phân giác, tiếp tuyến
  - tam giác: thường, cân, vuông, vuông cân, đều, biết 3 cạnh (kiểm tra bất đẳng thức tam giác); đường cao, trung tuyến, phân giác trong, đường trung bình; trọng tâm G, trực tâm H, đường tròn ngoại tiếp (O) và nội tiếp (I). Kéo đỉnh thì hình vẫn giữ đúng tính chất (cân vẫn cân, vuông vẫn vuông) và tự có ký hiệu (gạch cạnh bằng nhau, ô vuông, cung phân giác).
  - tứ giác: hình vuông, chữ nhật, bình hành, thoi, thang, thang cân, thang vuông; đa giác, đa giác đều
  - đường tròn (tâm + điểm, tâm + bán kính, qua 3 điểm), cung, hình quạt
  - góc: góc qua 3 điểm, góc giữa hai đường thẳng (lấy phía đã nhấp), góc cho trước số đo, góc lớn hơn 180°. Góc vuông tự vẽ ô vuông. Có 1–3 cung, gạch trên cung, tên α β γ φ, tô màu. Các góc chung đỉnh tự xếp bán kính để không đè nhau. Số đo hiển thị số nguyên (mặc định), độ-phút hoặc thập phân.
  - ký hiệu bằng nhau (đoạn thẳng: gạch; góc: lần lượt 2–3 cung rồi gạch), số đo
  - phép đối xứng trục, đối xứng tâm, quay, tịnh tiến, vị tự (ảnh tự đặt tên A′B′C′)
  - chữ, đồ thị hàm số, hệ trục, lưới
- **Vẽ đúng quy ước sách giáo khoa:**
  - Đường thẳng và tia vẽ gọn, chỉ vượt qua điểm ngoài cùng một đoạn ngắn. Kéo ô vuông xanh ở hai đầu để cắt ngắn hoặc kéo dài, hoặc chọn "Kéo dài hết".
  - Tia có gốc và ngọn: nhấp vào chỗ trống làm ngọn thì tia được ghi kiểu Ox (chữ thường, không chấm); góc vẽ mới tự đặt tên xOy, tia phân giác là Ot.
  - Đường vuông góc tự có ô vuông; đường trung trực có ô vuông và gạch hai đoạn bằng nhau; tia phân giác đánh dấu hai góc bằng nhau.
  - Chữ trên góc: số đo thật, hoặc tự ghi theo đề bài (ví dụ 60°) dù hình vẽ không đúng 60°. Chữ tự né đường đi qua đỉnh; góc lớn bao các góc nhỏ thì vẽ ra ngoài.
  - Tam giác biết 2 cạnh và góc xen giữa (c.g.c), biết 1 cạnh và 2 góc kề (g.c.g) cho số đo chính xác.
- **Di chuyển và chỉnh sửa:**
  - Kéo điểm, đoạn thẳng, đường thẳng, đa giác, đường tròn để dời cả hình (hình mẫu vẫn giữ tính chất). Kéo tên điểm để đặt lại chỗ.
  - Chọn nhiều: **kéo trên nền trống để khoanh vùng chọn** (như Word / PowerPoint), Shift+nhấp để thêm/bớt, Ctrl+A hoặc nút "Chọn hết". Các đối tượng đã chọn có khung nét đứt: **nắm vào bất kỳ chỗ nào trong khung để dời cả nhóm**; thanh phía trên khung để xoay ±15°, lật ngang/dọc, phóng to/thu nhỏ (giữ nguyên tính chất hình), nhân bản, đổi màu, xóa.
  - Cuộn khung nhìn bằng bánh xe chuột (Shift: sang ngang), Space+kéo hoặc kéo chuột phải; Ctrl+bánh xe để phóng to.
  - Phím mũi tên dịch nhẹ 0,1 cm (Shift: 1 cm). Ctrl+C / Ctrl+V sao chép – dán, Ctrl+D nhân bản; Delete xóa các đối tượng đã chọn.
  - Khi kéo, giao điểm của đường thẳng và đường tròn không "nhảy" sang nghiệm kia.
  - Phím tắt công cụ: V di chuyển, P điểm, S đoạn thẳng, L đường thẳng, R tia, T tam giác, N đa giác, O đường tròn, G ký hiệu góc, M trung điểm, I giao điểm, K vuông góc, H song song, E ký hiệu bằng nhau, Q số đo, A chữ, D xóa; Esc quay lại Di chuyển.
  - Mở lại hình để sửa thì tự căn vừa khung.
- **Trình bày:** tên điểm tự tránh đè nhau; tên có chỉ số A_1 → A₁, x^2 → x², A' → A′; kiểu điểm chấm đặc, chấm rỗng, dấu ×; hiện diện tích và chu vi của đa giác, hình tròn.
- **Theo chương trình (đợt B):**
  - **Chia phần và tô màu** (phân số lớp 2–5): hình chữ nhật, hình vuông chia cột × hàng, tam giác, hình tròn, đa giác đều chia phần bằng nhau; nhấp vào từng phần để tô / bỏ tô; hiện "3/4".
  - **Dụng cụ ảo**: thước kẻ (cm, mm), ê-ke, thước đo góc hai thang số. Kéo để di chuyển, kéo ⟳ để xoay; thả gần một điểm thì bám vào điểm và khớp hướng đường thẳng. Chỉ hiện trong trình soạn, không chèn vào Word.
  - **Đáy và chiều cao** (lớp 5): nhấp vào cạnh làm đáy; chân đường cao nằm ngoài thì tự kéo dài đáy nét đứt. **Hai đường chéo** (lớp 8) kèm giao điểm O và ký hiệu đúng loại hình. Chu vi, diện tích hình chữ nhật / hình vuông kèm cách tính.
  - **Hình mẫu theo bài:** hai đường thẳng cắt nhau (đánh số 4 góc), hai đường song song và cát tuyến (góc tại A và B), góc ở tâm và góc nội tiếp, tiếp tuyến kèm bán kính và góc vuông, tia đối, ba đường cao / trung tuyến / phân giác cùng điểm đồng quy.
  - **Đề / Đáp án:** đánh dấu nét thuộc đáp án; bản Đề bỏ các nét đó khi chèn vào Word.
  - **Chú thích "Hình n"** dưới hình mới (trường SEQ của Word, tự đánh số lại).
- **Nâng cao (đợt C):**
  - **Hình mẫu & đề bài** (nút trên thanh trên):
    - **Thư viện ~45 hình mẫu theo lớp 2–10**, có ảnh xem trước: đường gấp khúc, hình chữ nhật có kích thước, hình tròn (bán kính, đường kính), các loại góc, tam giác có đáy và chiều cao, hai tam giác bằng nhau, định lí Thales, tiếp tuyến, tứ giác nội tiếp, hệ thức lượng, hình khối, tổng vectơ, đồ thị, tangram…
    - **Gõ đề ra hình** (offline): gõ hoặc dán đề, hình hiện ngay khi gõ. Từng câu được tô màu (xanh: đã hiểu, vàng: một phần, đỏ: chưa hiểu, xám: câu hỏi bỏ qua); bỏ chọn được từng câu; câu chưa hiểu có gợi ý ("Có phải ý bạn là: Đoạn thẳng BM?"), chọn gợi ý thì phần mềm có thể **ghi nhớ cách viết đó** cho lần sau. Phần chưa vẽ được chuyển thành danh sách **"Việc còn lại"** trong trình soạn, kèm nút mở đúng công cụ.
      - Hiểu: tam giác (vuông / cân / đều, biết cạnh, góc, tỉ số, AB = AC, AB < AC), tứ giác đặc biệt và đa giác đều (cả đề thực tế lớp 6: chiều dài, chiều rộng, cạnh đáy, chiều cao, đường chéo, đáy lớn / nhỏ, diện tích, chu vi, đơn vị m, dm…); đoạn thẳng, tia Ox, góc xOy, hai tia đối nhau, đường thẳng d, ba điểm thẳng hàng; đường cao, trung tuyến, phân giác (cả dạng danh sách "các đường cao BD, CE cắt nhau tại H"); "M, N lần lượt là trung điểm…"; vuông góc / song song tại, cắt … tại; "trên tia đối của tia MA lấy D sao cho MD = MA", "lấy E thuộc BC sao cho BE = 2EC"; đối xứng; giao điểm; nối (nối BN, nối B với N, nối A với E, D với E, nối các điểm…); đường tròn (O; R), (O) đường kính AB, đường tròn đường kính BC cắt … tại, dây, tiếp tuyến tại / từ một điểm, cắt (O) tại điểm thứ hai; tọa độ Oxy, đồ thị; hình chóp, hình hộp, lăng trụ, trụ, nón, cầu (SA ⊥ đáy). Ký hiệu ∆ ⊥ // ∈ Â và cách gõ không dấu đều được.
      - **Lấy đề từ Word:** bôi đen đề trong tài liệu rồi bấm **Vẽ hình** — đề (kể cả công thức MathType / Word) được đưa sẵn vào ô "Gõ đề bài"; hình chèn vào đoạn mới ngay sau đề.
      - Bộ đo chất lượng: `tests/corpus/exercises.ts` (đề lớp 6–12, gồm các bài của một phiếu bài tập thật).
  - **Hình khối 3D** theo cách vẽ SGK (chiều sâu 45°, cạnh khuất nét đứt): hình hộp chữ nhật, lập phương ABCD.A′B′C′D′, lăng trụ đứng tam giác, hình chóp tam giác / tứ giác S.ABCD, hình trụ, hình nón, hình cầu; kéo đỉnh A (hoặc tâm O) để dời hình.
  - **Trục số**: từ, đến, khoảng cách vạch, các số đánh dấu.
  - **Nét com-pa** (ô "Nét com-pa"): dựng tam giác biết 3 cạnh, đường trung trực, tia phân giác để lại các cung com-pa như dựng hình trên giấy.
  - **Ghép hình tangram** 7 mảnh tô màu, kéo từng mảnh.
- **Vẽ chính xác:** điểm tự gióng thẳng hàng với các điểm có sẵn (hiện đường gióng), bắt lưới 0,5. Giữ **Shift** khi vẽ để bắt góc 15° và độ dài chẵn 0,5 cm, kèm nhãn độ dài · góc cạnh con trỏ.
- **Hai phong cách vẽ:**
  - **SGK Việt Nam** (mặc định): nét đen, nhãn Times nghiêng tự đặt ra phía ngoài hình, số thập phân dùng dấu phẩy.
  - **Quốc tế**: màu nhẹ, đa giác tô nền mờ.
- **Chèn vào Word:** ảnh SVG kèm PNG dự phòng, kích thước theo cm thật (có thể đổi tỉ lệ). **Trạng thái hình được nhúng trong ảnh SVG**, nên copy hình sang tài liệu khác vẫn mở lại sửa được.
- **Dễ dùng cho học sinh từ 7 tuổi:**
  - Ô **"Dành cho: Lớp 2 … Lớp 10–12"** chỉ hiện công cụ của lớp đó (theo chương trình GDPT 2018). Lớp 2–5: nút to có chữ, lưới ô vuông bật sẵn, vùng chạm lớn hơn, bàn phím số to khi nhập số.
  - **Chọn thông minh:** nhấp vào trong góc để ký hiệu góc hay vẽ tia phân giác; nhấp vào một cạnh để lấy trung điểm (tự gạch hai nửa bằng nhau) hay vẽ trung trực; nhấp vào gần một đỉnh tam giác để vẽ đường cao, trung tuyến, phân giác; nhấp vào trong tam giác để có trọng tâm, trực tâm, đường tròn nội tiếp, ngoại tiếp.
  - **Kéo để vẽ:** nhấn giữ ở điểm đầu rồi kéo đến điểm cuối (đoạn thẳng, đường thẳng, tia, đường tròn, hình vuông, hình chữ nhật…).
  - **Hướng dẫn từng bước** ("Bước 1/3: Nhấp đỉnh thứ nhất") và những chỗ nhấp được sẽ sáng nhẹ lên.
  - Tam giác và tứ giác: chọn loại bằng hàng hình nhỏ (thường, cân, vuông, đều, biết 3 cạnh… / vuông, chữ nhật, bình hành, thoi, thang…).
  - Hộp nhập số: mỗi số một ô có nhãn, nút gợi ý (3 cm, 60°…), thanh trượt cho góc, hình minh họa cạnh / góc đang nhập; nhập sai thì báo ngay trong hộp kèm cách sửa.
  - Đa giác và **đường gấp khúc** (lớp 2) kết thúc bằng nhấp đúp, Enter hoặc nút "Xong".
  - Thanh công cụ nổi cạnh đối tượng đang chọn (màu, nét đứt, số đo, ký hiệu bằng nhau, đổi tên, xóa); nhấp đúp vào tên để đổi tên ngay tại chỗ.

## Chuyển đổi với MathType

Nút **MathType ⇄** trên Ribbon mở khung chuyển đổi.

- **MathType → MathStudio** (`src/core/mtef.ts`, `src/core/docx-mathtype.ts`): đọc file .docx đang mở và tìm mọi đối tượng OLE `Equation.DSMT*` / `Equation.3`. Với mỗi đối tượng: lấy luồng `Equation Native`, đọc định dạng MTEF (bản 3 và 5), chuyển sang LaTeX giữ nguyên cỡ chữ gốc, rồi thay bằng công thức MathStudio (dạng ảnh hoặc dạng công thức Word). Kết quả **mở thành tài liệu mới**; tài liệu gốc giữ nguyên. Công thức không đọc được thì giữ nguyên MathType và ghi vào báo cáo. Không cần cài MathType.
- **MathStudio → MathType**: đổi công thức MathStudio thành công thức Word thuần (sau đó dùng *MathType ▸ Convert Equations*) hoặc mã `$TeX$` (sau đó dùng *MathType ▸ Toggle TeX*).

Kiểm tra với một tài liệu thật:

```bash
MT_DOCX=path/to/file.docx npx vitest run tests/docx-mathtype.test.ts   # ghi ra file-omml.docx và file-image.docx
```

## Nhận diện từ ảnh (OCR, chạy offline)

Nút **Từ ảnh** trên Ribbon (hoặc nút **Từ ảnh** trong trình soạn, hay dán ảnh bằng Ctrl+V) đọc ảnh chụp sách, đề thi, ảnh quét, ảnh màn hình. Nếu đang chọn một ảnh trong tài liệu thì ảnh đó được đọc luôn. Kéo chuột trên ảnh để chỉ đọc một vùng.

- **Một công thức**: ra LaTeX, nạp thẳng vào trình soạn để sửa rồi chèn như công thức gõ tay.
- **Cả đề bài (chữ + công thức)**: ra đoạn văn tiếng Việt có công thức `$…$` / `$$…$$`; sửa trong ô kết quả (có xem trước, công thức nên xem lại được tô vàng) rồi **Chèn vào tài liệu**: chữ thành chữ, mỗi công thức thành công thức MathStudio (sửa lại được). Công thức chèn kiểu này là công thức Word; muốn dạng ảnh thì dùng **Đổi dạng**.
- **Hình vẽ**: ảnh một hình hình học (ảnh trong phiếu, ảnh quét, ảnh chụp sách) được dựng lại thành hình động: tên điểm, đoạn thẳng (liền, đứt), điểm nằm trên cạnh, giao điểm có tên, đường tròn, số đo trên cạnh, kí hiệu góc, góc vuông, cạnh bằng nhau, vùng tô màu. Cạnh gần ngang / dọc được làm ngang / dọc hẳn; đường ghi kích thước có mũi tên trao số đo cho cạnh nó chỉ. Trong trình vẽ hình: nút **Từ ảnh** (hoặc dán ảnh), hay chọn ảnh trong Word rồi bấm **Vẽ hình**; từ trình soạn công thức: **Mở trong trình vẽ hình**. Ảnh chụp thật (không phải hình vẽ) được nhận ra và từ chối.
- **Vẽ hình từ đề**: trong trình vẽ hình, tab *Gõ đề bài* ▸ **Lấy đề từ ảnh** (hoặc **Từ ảnh** ▸ *Cả đề bài*) đọc đề rồi dựng hình như khi gõ đề.

Ảnh chỉ nằm trong bộ nhớ của hộp thoại khi đang mở; ảnh chọn trong Word được chuyển cho hộp thoại qua `localStorage` và xóa ngay khi hộp thoại mở (và khi nó đóng). Không ảnh nào được lưu lại hay gửi đi.

Mọi thứ chạy trong add-in, không gửi ảnh đi đâu:

| Phần | Cách làm |
|---|---|
| Công thức | Pix2Text MFR 1.5 (MIT), lượng tử hóa int8 (31 MB), chạy bằng onnxruntime-web trong Web Worker (`src/ocr/formula-model.ts`) |
| Chữ tiếng Việt | Tesseract.js (Apache-2.0) với dữ liệu `vie` (LSTM, 1,4 MB) |
| Tìm công thức trong trang | `src/ocr/page-layout.ts`: từ đọc kém tin cậy, ký hiệu lạ, nét mực cao hơn dòng, gạch phân số, mảnh tử/mẫu số; phần mực không thuộc dòng chữ nào là công thức riêng dòng |
| Ảnh chụp | Cân sáng theo vùng, tự chỉnh nghiêng (`src/ocr/image.ts`) |
| Hình vẽ | `src/ocr/figure-vision.ts`: nét vẽ (bỏ vùng tô, bỏ chữ), làm mảnh nét, đoạn thẳng bằng biến đổi Hough, đường tròn; `figure-build.ts`: đỉnh, điểm trên cạnh, giao điểm, tên, số đo, kí hiệu, vùng tô → hình dựng động. Tên điểm (chữ in nghiêng) đọc bằng model công thức, số đo và chữ bằng Tesseract |
| Chuẩn hóa LaTeX | `\operatorname{s i n}` → `\sin`, `\left\{\begin{matrix}` → `cases`, bỏ chữ đậm giả, `\widehat{ABC}`, `60^\circ` (`src/ocr/latex-clean.ts`) |

Model nằm trong `vendor/models/mfr/` (dựng lại bằng `scripts/build-ocr-model.py`); `npm run assets` chép model, Tesseract và dữ liệu tiếng Việt vào `public/ocr/`. Lần dùng đầu tải khoảng 50 MB từ chính add-in rồi lưu lại (Cache Storage). Cần Word dùng WebView2 (Microsoft 365 / Office 2021 trở lên).

Kiểm tra: `npx vitest run tests/ocr-*.test.ts` chạy model và Tesseract thật trên ảnh mẫu trong `tests/ocr/samples/` (công thức in, ảnh giả lập chụp điện thoại, đề nhiều dòng) và trên các hình mẫu của trình vẽ hình (vẽ ra ảnh rồi đọc lại, so tên điểm và cạnh).

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
| `src/ocr/` | Nhận diện công thức và đề bài từ ảnh (offline) |
| `src/commands/` | Hàm xử lý các nút trên Ribbon |
| `src/taskpane/` | Khung "Hướng dẫn" và tải phông |
| `manifest.xml` | Manifest add-in (bản phát triển, `https://localhost:3000`) |
| `vendor/fonts/` | Phông toán học: STIX Two Math (OFL), TeX Gyre Termes Math và Latin Modern Math (GUST) |
| `vendor/models/` | Model nhận diện công thức (Pix2Text MFR, MIT) |
| `scripts/` | Chép tài nguyên, tạo icon, script dựng thử trên Word (COM) |

## Lệnh

```bash
npm install
npm run dev          # xem trình soạn trong trình duyệt: http://localhost:3000/editor/index.html
npm test             # 240+ test chuyển đổi (LaTeX → OMML → LaTeX)
npm run build        # bản AppSource (Office.js lấy từ CDN của Microsoft) → dist/
npm run build:offline  # bản offline (Office.js đóng gói sẵn trong office-js/) → dist-offline/
npm run validate     # kiểm tra manifest
npm run start        # cài chứng chỉ localhost, chạy server HTTPS và mở Word kèm add-in
```

### Phát hành

- Mỗi lần đẩy lên nhánh `main`, GitHub Actions build add-in và đăng lên GitHub Pages (`.github/workflows/pages.yml`, lần đầu bật **Settings → Pages → Source: GitHub Actions**). Người dùng nhận bản mới khi mở lại Word.
- Bộ cài: tạo tag phiên bản, ví dụ `git tag v1.0.0 && git push origin v1.0.0`; GitHub Actions build bộ cài Windows và macOS rồi đưa vào trang Releases (`.github/workflows/release.yml`). Chỉ cần bộ cài mới khi manifest thay đổi (thêm nút, đổi tên…).
- Build tay: `powershell -File installer/windows/build.ps1 -SiteUrl https://<user>.github.io/<repo>` (Windows) và `bash installer/macos/build-pkg.sh https://<user>.github.io/<repo>` (trên Mac); manifest cho một địa chỉ bất kỳ: `node scripts/make-manifest.mjs https://…`.
- Bản offline: `npm run build:offline`, rồi `powershell -File installer/windows/build.ps1 -Offline` → `MathStudio-Setup-Windows-Offline.exe` (kèm `tools/server-win/MathStudioServer.exe`: server HTTPS chỉ nghe trên 127.0.0.1 / ::1 cổng 44317, tự tạo CA "MathStudio Local CA" và chứng chỉ localhost, xóa khóa của CA ngay sau khi ký). Trên Mac: `bash installer/macos/build-pkg.sh --offline` (server Swift + LaunchAgent, thử nghiệm). Office.js trong bản offline là bản gốc của Microsoft (gói `@microsoft/office-js`), giữ nguyên, kèm giấy phép ở `office-js/LICENSE.md`.

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
- [x] Bộ cài Windows và macOS tự đăng ký add-in và cài phông (add-in chạy từ GitHub Pages)
- [x] Bản offline hoàn toàn: Office.js đóng gói sẵn, server HTTPS cục bộ (https://localhost:44317) với chứng chỉ tạo riêng cho từng máy; bộ cài Windows (macOS: thử nghiệm)
- [x] Giai đoạn 3: vẽ hình học phẳng 2D (dựng hình động, xuất SVG kèm trạng thái để sửa lại)
- [x] Hình khối 3D theo cách vẽ SGK (hộp, lập phương, lăng trụ, chóp, trụ, nón, cầu; nét khuất)
- [x] Hình không gian dựng động cho lớp 11–12: chóp, lăng trụ, hộp, tứ diện; điểm trên cạnh, giao điểm, giao tuyến, giao điểm đường – mặt, thiết diện, song song, hình chiếu; nét khuất tự đứt khi xoay hình; dựng từ đề bài
- [x] Nhận diện từ ảnh, chạy offline: công thức, cả đề bài (chữ tiếng Việt + công thức), hình vẽ → hình dựng động

## Giấy phép

Mã nguồn MathStudio phát hành theo giấy phép [MIT](LICENSE).

Các phông trong `vendor/fonts/` giữ giấy phép riêng:
- STIX Two Math: SIL Open Font License 1.1
- TeX Gyre Termes Math và Latin Modern Math: GUST Font License

Model trong `vendor/models/mfr/` là Pix2Text MFR 1.5 của BreezeDeus, giấy phép MIT (`vendor/models/mfr/LICENSE-Pix2Text.txt`). Tesseract.js, tesseract.js-core và dữ liệu `vie`: Apache-2.0 / MIT. ONNX Runtime Web: MIT.

Các thư viện dùng kèm (MathLive, Temml, MathJax, React, cfb, fflate…) giữ giấy phép của từng thư viện.
