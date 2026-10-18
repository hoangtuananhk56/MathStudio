# Builds MathStudioHotkeys.exe with the C# compiler that ships with Windows (.NET Framework 4.x),
# so no SDK is needed. Output: dist-tools/MathStudioHotkeys.exe (+ mathstudio.ico)
# A running copy is stopped first so the new build can replace it.
param([string]$OutDir)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$out = if ($OutDir) { $OutDir } else { Join-Path $root 'dist-tools' }
if (-not $OutDir) { Get-Process MathStudioHotkeys -ErrorAction SilentlyContinue | Stop-Process -Force }
New-Item -ItemType Directory -Force $out | Out-Null

$fw = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$csc = Join-Path $fw 'csc.exe'
$refs = @(
  'System.dll', 'System.Drawing.dll', 'System.Windows.Forms.dll',
  (Join-Path $fw 'WPF\UIAutomationClient.dll'), (Join-Path $fw 'WPF\UIAutomationTypes.dll'), (Join-Path $fw 'WPF\WindowsBase.dll')
) | ForEach-Object { "/reference:$_" }

& $csc /nologo /target:winexe /optimize+ /codepage:65001 "/out:$(Join-Path $out 'MathStudioHotkeys.exe')" @refs (Join-Path $PSScriptRoot 'MathStudioHotkeys.cs')
if ($LASTEXITCODE -ne 0) { throw "csc failed ($LASTEXITCODE)" }

# Tray icon from the add-in logo.
Add-Type -AssemblyName System.Drawing
$png = Join-Path $root 'public\assets\logo-32.png'
if (Test-Path $png) {
  $bmp = New-Object System.Drawing.Bitmap($png)
  $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
  $fs = [System.IO.File]::Create((Join-Path $out 'mathstudio.ico'))
  $icon.Save($fs); $fs.Close(); $bmp.Dispose()
}
Write-Output "Built $(Join-Path $out 'MathStudioHotkeys.exe')"
