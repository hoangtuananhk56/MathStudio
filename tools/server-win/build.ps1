# Builds MathStudioServer.exe (the offline version's local https server) with the C# compiler
# that ships with Windows (.NET Framework 4.7.2 or later at run time).
# Output: dist-tools/MathStudioServer.exe
param([string]$OutDir)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$out = if ($OutDir) { $OutDir } else { Join-Path $root 'dist-tools' }
if (-not $OutDir) { Get-Process MathStudioServer -ErrorAction SilentlyContinue | Stop-Process -Force }
New-Item -ItemType Directory -Force $out | Out-Null

$fw = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
& (Join-Path $fw 'csc.exe') /nologo /target:winexe /optimize+ /codepage:65001 "/out:$(Join-Path $out 'MathStudioServer.exe')" `
  /reference:System.dll /reference:System.Core.dll "/reference:$(Join-Path $fw 'netstandard.dll')" (Join-Path $PSScriptRoot 'MathStudioServer.cs')
if ($LASTEXITCODE -ne 0) { throw "csc failed ($LASTEXITCODE)" }
Write-Output "Built $(Join-Path $out 'MathStudioServer.exe')"
