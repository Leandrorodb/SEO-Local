# Desliga somente processos criados pelo iniciador. Preserva o banco e seus dados.
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$registry=Join-Path $root 'work\iniciador\processos.json'
if (-not (Test-Path $registry)) { Write-Host 'Nao ha processos registrados pelo iniciador.'; exit 0 }
$items=Get-Content $registry -Raw | ConvertFrom-Json
function IsSame($item) {
    if ($null -eq $item) { return $false }
    try {
        $p=Get-Process -Id ([int]$item.id) -ErrorAction Stop
        return ($p.StartTime.ToUniversalTime().Ticks -eq [long]$item.startTicks)
    } catch { return $false }
}
# Parar banco com pg_ctl (graceful) antes de encerrar os wrappers.
$dbStopOk = $true
if ($items.postgres -and (IsSame $items.postgres)) {
    $ctrl=Join-Path $root 'node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe'
    if (-not (Test-Path $ctrl)) { $ctrl=Join-Path $root 'node_modules\.pnpm\@embedded-postgres+windows-x64@18.1.0-beta.16\node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe' }
    $data=Join-Path $root 'work\local-db\postgres'
    if ((Test-Path $ctrl) -and (Test-Path $data)) {
        & $ctrl -D $data -m fast -w stop
        if ($LASTEXITCODE -ne 0) { $dbStopOk = $false; Write-Host 'Nao foi possivel parar o PostgreSQL; ele sera preservado para evitar perda de dados.' -ForegroundColor Yellow }
    }
}
foreach ($key in @('painel','worker','api','login','postgres')) {
    $item=$items.$key
    if (-not (IsSame $item)) { continue }
    if ($key -eq 'postgres' -and -not $dbStopOk) { continue }
    & taskkill.exe /PID ([int]$item.id) /T /F 2>$null | Out-Null
    Write-Host ('Encerrado: ' + $key)
}
Remove-Item $registry -ErrorAction SilentlyContinue
Write-Host 'Encerramento concluido. Arquivos e dados foram preservados.' -ForegroundColor Green
