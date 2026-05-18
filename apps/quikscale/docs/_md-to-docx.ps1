param(
    [Parameter(Mandatory=$true)][string]$InputMd,
    [Parameter(Mandatory=$true)][string]$OutputDocx
)

$ErrorActionPreference = 'Stop'

function Convert-Inline {
    param([string]$s)
    # escape HTML
    $s = $s -replace '&', '&amp;'
    $s = $s -replace '<', '&lt;'
    $s = $s -replace '>', '&gt;'
    # inline code
    $s = [regex]::Replace($s, '`([^`]+)`', '<code>$1</code>')
    # bold
    $s = [regex]::Replace($s, '\*\*([^*]+)\*\*', '<strong>$1</strong>')
    # italic (avoid matching ** already handled)
    $s = [regex]::Replace($s, '(?<!\*)\*([^*]+)\*(?!\*)', '<em>$1</em>')
    # links [text](url)
    $s = [regex]::Replace($s, '\[([^\]]+)\]\(([^)]+)\)', '<a href="$2">$1</a>')
    return $s
}

function Convert-MarkdownToHtml {
    param([string[]]$Lines)

    $sb = New-Object System.Text.StringBuilder
    $i = 0
    $n = $Lines.Length

    while ($i -lt $n) {
        $line = $Lines[$i]
        $trim = $line.TrimEnd()

        # blank line
        if ($trim -eq '') { [void]$sb.AppendLine(''); $i++; continue }

        # horizontal rule
        if ($trim -match '^-{3,}$') { [void]$sb.AppendLine('<hr/>'); $i++; continue }

        # headings
        if ($trim -match '^(#{1,6})\s+(.*)$') {
            $level = $matches[1].Length
            $text = Convert-Inline $matches[2]
            [void]$sb.AppendLine("<h$level>$text</h$level>")
            $i++; continue
        }

        # tables — header line followed by separator |---|---|
        if ($trim -match '^\|' -and ($i+1 -lt $n) -and ($Lines[$i+1] -match '^\s*\|?\s*:?-{2,}')) {
            $headerCells = ($trim.Trim('|') -split '\|') | ForEach-Object { $_.Trim() }
            $i += 2
            [void]$sb.AppendLine('<table>')
            [void]$sb.AppendLine('<thead><tr>')
            foreach ($c in $headerCells) { [void]$sb.AppendLine('<th>' + (Convert-Inline $c) + '</th>') }
            [void]$sb.AppendLine('</tr></thead><tbody>')
            while ($i -lt $n -and $Lines[$i].TrimEnd() -match '^\|') {
                $rowCells = ($Lines[$i].TrimEnd().Trim('|') -split '\|') | ForEach-Object { $_.Trim() }
                [void]$sb.AppendLine('<tr>')
                foreach ($c in $rowCells) { [void]$sb.AppendLine('<td>' + (Convert-Inline $c) + '</td>') }
                [void]$sb.AppendLine('</tr>')
                $i++
            }
            [void]$sb.AppendLine('</tbody></table>')
            continue
        }

        # blockquote
        if ($trim -match '^>\s?(.*)$') {
            $buf = @()
            while ($i -lt $n -and $Lines[$i].TrimEnd() -match '^>\s?(.*)$') {
                $buf += (Convert-Inline $matches[1])
                $i++
            }
            [void]$sb.AppendLine('<blockquote>' + ($buf -join '<br/>') + '</blockquote>')
            continue
        }

        # unordered list
        if ($trim -match '^[-*]\s+(.*)$') {
            [void]$sb.AppendLine('<ul>')
            while ($i -lt $n) {
                $l = $Lines[$i].TrimEnd()
                if ($l -match '^[-*]\s+(.*)$') {
                    [void]$sb.AppendLine('<li>' + (Convert-Inline $matches[1]) + '</li>')
                    $i++
                } elseif ($l -match '^\s{2,}(.*)$' -and $i -gt 0) {
                    # continuation of previous bullet — append as text in last <li>
                    $i++
                } else { break }
            }
            [void]$sb.AppendLine('</ul>')
            continue
        }

        # ordered list
        if ($trim -match '^\d+\.\s+(.*)$') {
            [void]$sb.AppendLine('<ol>')
            while ($i -lt $n -and $Lines[$i].TrimEnd() -match '^\d+\.\s+(.*)$') {
                [void]$sb.AppendLine('<li>' + (Convert-Inline $matches[1]) + '</li>')
                $i++
            }
            [void]$sb.AppendLine('</ol>')
            continue
        }

        # paragraph — gather until blank line
        $para = @()
        while ($i -lt $n -and $Lines[$i].TrimEnd() -ne '' -and -not ($Lines[$i] -match '^(#{1,6}\s|>|[-*]\s|\d+\.\s|\||-{3,}$)')) {
            $para += (Convert-Inline $Lines[$i].TrimEnd())
            $i++
        }
        if ($para.Count -gt 0) {
            [void]$sb.AppendLine('<p>' + ($para -join '<br/>') + '</p>')
        }
    }

    return $sb.ToString()
}

# Read markdown
$mdContent = Get-Content -Path $InputMd -Raw -Encoding UTF8
$lines = $mdContent -split "`r?`n"

$body = Convert-MarkdownToHtml -Lines $lines

$css = @'
<style>
body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #222; line-height: 1.4; }
h1 { font-family: Calibri, Arial, sans-serif; font-size: 22pt; color: #1f3864; border-bottom: 2px solid #1f3864; padding-bottom: 4pt; margin-top: 0; }
h2 { font-family: Calibri, Arial, sans-serif; font-size: 16pt; color: #1f3864; margin-top: 18pt; border-bottom: 1px solid #b4c7e7; padding-bottom: 2pt; }
h3 { font-family: Calibri, Arial, sans-serif; font-size: 13pt; color: #2e5597; margin-top: 12pt; }
h4 { font-family: Calibri, Arial, sans-serif; font-size: 11.5pt; color: #2e5597; }
p { margin: 6pt 0; }
ul, ol { margin: 4pt 0 8pt 18pt; }
li { margin: 2pt 0; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
th, td { border: 1px solid #888; padding: 5pt 8pt; vertical-align: top; }
th { background: #d9e2f3; color: #1f3864; font-weight: bold; text-align: left; }
tr:nth-child(even) td { background: #f6f9fd; }
code { font-family: Consolas, "Courier New", monospace; background: #f0f0f0; padding: 0 3pt; border-radius: 2pt; font-size: 10pt; }
blockquote { border-left: 3px solid #b4c7e7; margin: 6pt 0; padding: 4pt 10pt; color: #555; background: #f6f9fd; }
hr { border: 0; border-top: 1px solid #d0d7e2; margin: 10pt 0; }
a { color: #1f3864; }
</style>
'@

$html = @"
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>OPSP What's New</title>
$css
</head><body>
$body
</body></html>
"@

# Write HTML to a temp file (UTF-8 with BOM so Word picks up encoding)
$tmpHtml = [System.IO.Path]::Combine([System.IO.Path]::GetDirectoryName($OutputDocx), '_tmp-opsp.html')
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($tmpHtml, $html, $utf8Bom)

Write-Host "HTML written: $tmpHtml"
Write-Host "Opening in Word..."

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0  # wdAlertsNone

try {
    $doc = $word.Documents.Open($tmpHtml, $false, $true)  # ReadOnly = true on the HTML
    # wdFormatDocumentDefault = 16 (docx)
    $doc.SaveAs([ref]$OutputDocx, [ref]16)
    $doc.Close()
    Write-Host "Saved: $OutputDocx"
} finally {
    $word.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
    Remove-Item $tmpHtml -ErrorAction SilentlyContinue
}
