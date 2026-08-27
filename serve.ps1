# 轻量静态文件服务器（用于本地预览，仅开发用途）
param([int]$Port = 5500)

$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/  (Ctrl+C to stop)"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    $url = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($url -eq "/") { $url = "/index.html" }
    $path = [System.IO.Path]::Combine($root, $url.TrimStart('/'))
    $full = [System.IO.Path]::GetFullPath($path)
    if (-not $full.StartsWith([System.IO.Path]::GetFullPath($root))) {
      $res.StatusCode = 403; $res.Close(); continue
    }

    if ([System.IO.File]::Exists($full)) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $mime = switch ($ext) {
        ".html" { "text/html; charset=utf-8" }
        ".css"  { "text/css; charset=utf-8" }
        ".js"   { "application/javascript; charset=utf-8" }
        ".png"  { "image/png" }
        ".jpg" { "image/jpeg" }
        ".jpeg" { "image/jpeg" }
        ".webp" { "image/webp" }
        ".gif"  { "image/gif" }
        ".pdf"  { "application/pdf" }
        ".svg"  { "image/svg+xml" }
        ".ico"  { "image/x-icon" }
        ".ttf"  { "font/ttf" }
        ".woff" { "font/woff" }
        ".woff2" { "font/woff2" }
        ".json" { "application/json; charset=utf-8" }
        default { "application/octet-stream" }
      }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $res.ContentType = $mime
      $res.StatusCode = 200
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
    $res.Close()
  } catch {
    try { $res.StatusCode = 500; $res.Close() } catch {}
  }
}