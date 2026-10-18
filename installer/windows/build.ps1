# Builds MathStudio-Setup-Windows.exe: one file with the manifest, the fonts and the
# double-click helper inside. Uses the C# compiler that ships with Windows (.NET Framework 4.x).
#   powershell -File installer/windows/build.ps1 -SiteUrl https://<user>.github.io/<repo> [-OutDir dist-installers]
param(
  [Parameter(Mandatory = $true)][string]$SiteUrl,
  [string]$OutDir
)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$out = if ($OutDir) { $OutDir } else { Join-Path $root 'dist-installers' }
$work = Join-Path $out 'windows-build'
New-Item -ItemType Directory -Force $work | Out-Null

# the manifest for the public address, and the helper
& node (Join-Path $root 'scripts\make-manifest.mjs') $SiteUrl (Join-Path $work 'manifest.xml')
if ($LASTEXITCODE -ne 0) { throw 'manifest failed' }
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'tools\hotkeys-win\build.ps1') -OutDir $work
if ($LASTEXITCODE -ne 0) { throw 'helper build failed' }

$fonts = Join-Path $root 'vendor\fonts'
$resources = @(
  (Join-Path $work 'manifest.xml'),
  (Join-Path $work 'MathStudioHotkeys.exe'),
  (Join-Path $work 'mathstudio.ico'),
  (Join-Path $fonts 'STIXTwoMath-Regular.otf'),
  (Join-Path $fonts 'texgyretermes-math.otf'),
  (Join-Path $fonts 'latinmodern-math.otf')
) | ForEach-Object { "/resource:$_,$(Split-Path $_ -Leaf)" }

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$exe = Join-Path $out 'MathStudio-Setup-Windows.exe'
& $csc /nologo /target:winexe /optimize+ /codepage:65001 "/win32icon:$(Join-Path $work 'mathstudio.ico')" "/out:$exe" `
  /reference:System.Windows.Forms.dll /reference:System.Drawing.dll @resources (Join-Path $PSScriptRoot 'MathStudioSetup.cs')
if ($LASTEXITCODE -ne 0) { throw "csc failed ($LASTEXITCODE)" }
Remove-Item -Recurse -Force $work
Write-Output "Built $exe"
