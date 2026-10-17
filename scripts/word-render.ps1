# Inserts every package from packages.json into a new Word document (via COM),
# reports the equation/content-control counts and exports a PDF for review.
# Usage: powershell -File scripts/word-render.ps1 -Dir <folder with packages.json>
param([Parameter(Mandatory = $true)][string]$Dir)
$ErrorActionPreference = 'Stop'

$items = Get-Content (Join-Path $Dir 'packages.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$word = New-Object -ComObject Word.Application
# If COM handed us a Word that already has documents open (the user's session), stop:
# never add documents to, or quit, a Word the user is working in.
if ($word.Documents.Count -ne 0) { Write-Output 'A Word session with open documents was returned by COM - aborting.'; exit 3 }
$word.Visible = $false
try {
  $doc = $word.Documents.Add()
  $failed = 0
  foreach ($it in $items) {
    $r = $doc.Content
    $r.Collapse(0)
    $r.InsertAfter("$($it.label):")
    $r.InsertParagraphAfter()
    $r = $doc.Content
    $r.Collapse(0)
    try { $r.InsertXML($it.xml) } catch { $failed++; Write-Output "FAILED: $($it.label) - $($_.Exception.Message)" }
    # Mirror the add-in: set the equation paragraph's alignment explicitly (0 = left, 1 = centre).
    # Tag layout codes: 0 inline, 1 display, R<n>/L<n> numbered; an "i" prefix marks pictures.
    $tag = $doc.ContentControls.Item($doc.ContentControls.Count).Tag
    $layout = ($tag -split '\|')[2]
    $centre = $layout -eq '1' -or $layout -eq 'i1' -or $layout -like 'R*'
    $doc.Paragraphs.Last.Alignment = $(if ($centre) { 1 } else { 0 })
    $end = $doc.Content
    $end.Collapse(0)
    $end.InsertParagraphAfter()
  }
  Write-Output "Items: $($items.Count)  Failed: $failed"
  Write-Output "OMaths: $($doc.OMaths.Count)  ContentControls: $($doc.ContentControls.Count)"
  $tags = 0; foreach ($cc in $doc.ContentControls) { if ($cc.Tag -like 'mt2|*') { $tags++ } }
  Write-Output "Tagged equations: $tags"
  $pdf = Join-Path $Dir 'render.pdf'
  $doc.ExportAsFixedFormat([string]$pdf, 17)
  $doc.SaveAs2([string](Join-Path $Dir 'render.docx'))
  $doc.Close([ref]0)
  Write-Output "PDF: $pdf"
} finally { $word.Quit() }
