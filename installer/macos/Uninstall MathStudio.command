#!/bin/bash
# Removes MathStudio from Word for Mac (double-click this file; it asks for your password once).
# Equations and figures already in documents stay as they are.
APP="/Library/Application Support/MathStudio"
echo "Gỡ MathStudio khỏi Word… (hãy đóng Word trước)"
rm -f "$HOME/Library/Containers/com.microsoft.Word/Data/Documents/wef/MathStudio.manifest.xml"
for f in STIXTwoMath-Regular.otf texgyretermes-math.otf latinmodern-math.otf; do rm -f "$HOME/Library/Fonts/$f"; done
sudo rm -rf "$APP"
sudo pkgutil --forget vn.mathstudio.word >/dev/null 2>&1 || true
echo "Đã gỡ MathStudio. Có thể đóng cửa sổ này."
