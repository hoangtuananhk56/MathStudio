# Cài đặt MathStudio cho Word

MathStudio thêm tab **MathStudio** vào Microsoft Word: soạn công thức Toán đẹp như sách giáo khoa, vẽ hình học, nhận diện công thức / đề bài / hình vẽ từ ảnh. Miễn phí.

## Cần có

- **Windows**: Word 2016, 2019, 2021, 2024 hoặc Microsoft 365.
- **macOS**: Word 2016 cho Mac trở lên, hoặc Microsoft 365.
- **Kết nối mạng** khi mở Word (MathStudio được tải từ mạng mỗi khi mở, nên luôn là bản mới nhất). Ảnh dùng để nhận diện được xử lý ngay trên máy, không gửi đi đâu.
- Nhận diện từ ảnh cần Word mới (Microsoft 365 hoặc Office 2021 trở lên). Lần đầu dùng sẽ tải khoảng 50 MB, những lần sau dùng ngay.

## Tải về

Vào trang **[Releases](https://github.com/hoangtuananhk56/MathStudio/releases/latest)** và tải:

| Máy | File |
|---|---|
| Windows | `MathStudio-Setup-Windows.exe` |
| macOS | `MathStudio-macOS.pkg` |

## Cài trên Windows

1. **Lưu tài liệu và đóng Word.**
2. Nhấp đúp `MathStudio-Setup-Windows.exe`.
3. Nếu Windows hiện **"Windows đã bảo vệ PC của bạn"**: bấm **Thông tin bổ sung** (More info) → **Vẫn chạy** (Run anyway). Cảnh báo này xuất hiện vì bộ cài chưa được ký số, không phải vì có vấn đề.
4. Bấm **OK** để cài. Không cần quyền quản trị.
5. Mở Word: tab **MathStudio** nằm trên thanh công cụ.
   - Nếu chưa thấy: vào **Chèn → Bổ trợ của tôi** (Insert → My Add-ins) → mục **Bổ trợ dành cho nhà phát triển** (Developer Add-ins) → chọn **MathStudio**.

Bộ cài còn cài:
- các **phông chữ toán học** (STIX Two Math, TeX Gyre Termes Math, Latin Modern Math);
- công cụ nhỏ chạy cùng Windows (biểu tượng MathStudio ở khay hệ thống, góc phải dưới màn hình) để **nhấp đúp vào công thức / hình là sửa được** và có **phím tắt như MathType**: Ctrl+Alt+Q (công thức trong dòng), Alt+Q (riêng dòng), Ctrl+Alt+E (sửa).

**Gỡ cài đặt**: Cài đặt Windows → **Ứng dụng** → **MathStudio cho Word** → Gỡ cài đặt. Công thức và hình đã chèn trong tài liệu vẫn giữ nguyên.

## Cài trên macOS

1. **Đóng Word.**
2. **Nhấp chuột phải** (hoặc Control + nhấp) vào `MathStudio-macOS.pkg` → **Mở** (Open) → **Mở** lần nữa.
   - Nếu macOS báo không mở được vì *"không xác minh được nhà phát triển"*: vào **Cài đặt hệ thống → Quyền riêng tư & Bảo mật**, kéo xuống, bấm **Vẫn mở** (Open Anyway), rồi mở lại file.
3. Làm theo các bước của trình cài đặt (có thể phải nhập mật khẩu máy).
4. Mở Word → **Chèn → Bổ trợ → Bổ trợ của tôi** (Insert → Add-ins → My Add-ins) → chọn **MathStudio**. Từ lần sau tab MathStudio có sẵn.

Trên Mac, sửa công thức / hình bằng cách đặt con trỏ vào đó rồi bấm **Sửa công thức** hoặc **Sửa hình** trên tab MathStudio.

**Gỡ cài đặt**: mở Finder → **Đi → Đi tới thư mục…** → gõ `/Library/Application Support/MathStudio` → nhấp đúp **Uninstall MathStudio.command**.

## Cập nhật

MathStudio tự cập nhật: mỗi lần mở Word là bản mới nhất. Chỉ cần cài lại khi trang Releases ghi rõ là cần (khi có nút mới trên thanh công cụ).

## Gặp vấn đề

| Hiện tượng | Cách xử lý |
|---|---|
| Không thấy tab MathStudio | Đóng hẳn Word (cả các cửa sổ Word khác) rồi mở lại. Vẫn chưa có: xem bước 5 (Windows) / bước 4 (Mac) ở trên. |
| Tab MathStudio báo lỗi tải, trang trắng | Kiểm tra kết nối mạng, rồi mở lại Word. |
| Công thức hiện phông khác trên máy khác | Máy đó chưa có phông STIX Two Math: cài MathStudio trên máy đó, hoặc dùng dạng **Ảnh (MathType)** khi chèn. |
| Nhận diện từ ảnh báo "phiên bản Word chưa hỗ trợ" | Cập nhật Word lên Microsoft 365 / Office 2021 trở lên. |
| Nhấp đúp không mở được trình sửa (Windows) | Kiểm tra biểu tượng MathStudio có ở khay hệ thống không; nếu không, mở menu Start → gõ *MathStudio*, hoặc cài lại. |

Báo lỗi hoặc góp ý: tạo một mục mới ở trang **[Issues](https://github.com/hoangtuananhk56/MathStudio/issues)** của dự án.
