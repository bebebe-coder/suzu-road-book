# MY SUZU ROAD BOOK を HTTPS で配信する（実機でGPSを試すとき用）
# 位置情報APIはHTTPSでないと動かないため。終了は Ctrl + C。
# ポートの割り当てとURLの表示は serve_https.py が行う。
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

# --- このPCのIPアドレス ---
$ips = @(Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress)
if ($ips.Count -eq 0) {
    Write-Host '  ネットワークのIPアドレスが取得できませんでした。' -ForegroundColor Red
    Read-Host '  Enterで閉じます'
    exit 1
}
$ip = $ips[0]

# --- openssl を探す（Git for Windows に同梱されている） ---
$openssl = $null
$cmd = Get-Command openssl -ErrorAction SilentlyContinue
if ($cmd) { $openssl = $cmd.Source }
if (-not $openssl) {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Git\mingw64\bin\openssl.exe'),
        (Join-Path $env:ProgramFiles 'Git\usr\bin\openssl.exe')
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { $openssl = $p; break }
    }
}
if (-not $openssl) {
    Write-Host '  openssl が見つかりません（Git for Windows に同梱されています）。' -ForegroundColor Red
    Read-Host '  Enterで閉じます'
    exit 1
}

# --- 証明書。IPが変わったときだけ作り直す ---
$certDir = Join-Path $PSScriptRoot '.cert'
if (-not (Test-Path $certDir)) { New-Item -ItemType Directory -Path $certDir | Out-Null }
$crt    = Join-Path $certDir 'server.crt'
$key    = Join-Path $certDir 'server.key'
$marker = Join-Path $certDir 'ip.txt'

$need = $true
if ((Test-Path $crt) -and (Test-Path $key) -and (Test-Path $marker)) {
    if ((Get-Content $marker -Raw).Trim() -eq $ip) { $need = $false }
}
if ($need) {
    Write-Host '  証明書を作成しています…' -ForegroundColor Gray
    $san = "subjectAltName=IP:$ip,IP:127.0.0.1,DNS:localhost"
    & $openssl req -x509 -newkey rsa:2048 -nodes -days 365 -keyout $key -out $crt -subj "/CN=$ip" -addext $san
    if (-not (Test-Path $crt)) {
        Write-Host '  証明書の作成に失敗しました。' -ForegroundColor Red
        Read-Host '  Enterで閉じます'
        exit 1
    }
    Set-Content -Path $marker -Value $ip -Encoding utf8
}

python serve_https.py $ip
