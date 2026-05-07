$path = 'c:\Users\4-410\Desktop\2026.05.07\nodamm_supporters_homepage.html'
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

$styleRegex = '(?is)<style>(.*?)</style>'
$scriptRegex = '(?is)<script>(.*?)</script>'

$styleMatch = [regex]::Match($content, $styleRegex)
if ($styleMatch.Success) {
    [System.IO.File]::WriteAllText('c:\Users\4-410\Desktop\2026.05.07\nodamm_style.css', $styleMatch.Groups[1].Value.Trim(), [System.Text.Encoding]::UTF8)
    $content = $content -replace $styleRegex, '<link rel="stylesheet" href="nodamm_style.css" />'
}

$scriptMatch = [regex]::Match($content, $scriptRegex)
if ($scriptMatch.Success) {
    [System.IO.File]::WriteAllText('c:\Users\4-410\Desktop\2026.05.07\nodamm_script.js', $scriptMatch.Groups[1].Value.Trim(), [System.Text.Encoding]::UTF8)
    $content = $content -replace $scriptRegex, '<script src="nodamm_script.js"></script>'
}

[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
