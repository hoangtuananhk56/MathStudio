# Builds MathStudio-Setup-Windows.exe: one file with the manifest, the fonts and the
# double-click helper inside. Uses the C# compiler that ships with Windows (.NET Framework 4.x).
#   powershell -File installer/windows/build.ps1 -SiteUrl https://<user>.github.io/<repo> [-OutDir dist-installers]
# The offline version carries the add-in (dist-offline/, from `npm run build:offline`) and the
# local https server; its manifest points at https://localhost:44317:
#   powershell -File installer/windows/build.ps1 -Offline [-OutDir dist-installers]
param(
  [string]$SiteUrl,
  [switch]$Offline,
  [string]$OutDir
)
if ($Offline) { $SiteUrl = 'https://localhost:44317' }
elseif (-not $SiteUrl) { throw 'SiteUrl is required (or -Offline)' }
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

$extra = @()
if ($Offline) {
  $site = Join-Path $root 'dist-offline'
  if (-not (Test-Path (Join-Path $site 'office-js\office.js'))) { throw 'dist-offline missing: run npm run build:offline first' }
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'tools\server-win\build.ps1') -OutDir $work
  if ($LASTEXITCODE -ne 0) { throw 'server build failed' }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = Join-Path $work 'site.zip'
  [System.IO.Compression.ZipFile]::CreateFromDirectory($site, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
  $resources += "/resource:$zip,site.zip"
  $resources += "/resource:$(Join-Path $work 'MathStudioServer.exe'),MathStudioServer.exe"
  $extra = @('/define:OFFLINE', '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll')
}

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$name = if ($Offline) { 'MathStudio-Setup-Windows-Offline.exe' } else { 'MathStudio-Setup-Windows.exe' }
$exe = Join-Path $out $name
& $csc /nologo /target:winexe /optimize+ /codepage:65001 "/win32icon:$(Join-Path $work 'mathstudio.ico')" "/out:$exe" `
  /reference:System.Windows.Forms.dll /reference:System.Drawing.dll @extra @resources (Join-Path $PSScriptRoot 'MathStudioSetup.cs')
if ($LASTEXITCODE -ne 0) { throw "csc failed ($LASTEXITCODE)" }
Remove-Item -Recurse -Force $work
Write-Output "Built $exe"
