# MY SUZU ROAD BOOK プロトタイプ 起動スクリプト
# PowerShell 5.1 想定。終了は Ctrl + C。
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
$port = 8000

$ips = @(Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress)

Write-Host ''
Write-Host '  MY SUZU ROAD BOOK  プロトタイプ' -ForegroundColor Yellow
Write-Host '  ------------------------------------------------'
Write-Host ''
Write-Host '  このPCで見る' -ForegroundColor Gray
Write-Host ("    http://localhost:{0}/" -f $port) -ForegroundColor White
Write-Host ("    http://localhost:{0}/?mock=1   ← 最初から擬似位置で開く" -f $port) -ForegroundColor DarkGray
Write-Host ''
if ($ips.Count -gt 0) {
    Write-Host '  同じWi-Fiにつないだスマホで見る' -ForegroundColor Gray
    foreach ($ip in $ips) {
        Write-Host ("    http://{0}:{1}/" -f $ip, $port) -ForegroundColor White
    }
} else {
    Write-Host '  ネットワークのIPアドレスが取得できませんでした。' -ForegroundColor DarkYellow
}
Write-Host ''
Write-Host '  ※スマホはHTTP接続のため、位置情報APIが使えません。' -ForegroundColor DarkGray
Write-Host '    自動で「擬似位置モード」になり、地図をタップした場所が現在地になります。' -ForegroundColor DarkGray
Write-Host '    左上の状態表示をタップすると、GPSと擬似位置を手で切り替えられます。' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  終了: Ctrl + C' -ForegroundColor Gray
Write-Host ''

python "$PSScriptRoot\serve_plain.py" $port
