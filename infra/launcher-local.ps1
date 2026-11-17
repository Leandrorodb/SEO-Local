# Local Rank Tracker - iniciador Windows local, sem services globais.
# Nao publicar em producao. Requer Node 22.14+, pnpm e Windows PowerShell 5.1+.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$work = Join-Path $root 'work\iniciador'
New-Item -ItemType Directory -Path $work -Force | Out-Null
$registry = Join-Path $work 'processos.json'
$processes = @{}

function Info([string]$msg) { Write-Host ('[LRT] ' + $msg) -ForegroundColor Cyan }
function Fail([string]$msg) { throw $msg }
function PortOpen([int]$port) {
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $tcp.BeginConnect('127.0.0.1', $port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(450)) { return $false }
        $tcp.EndConnect($async)
        return $true
    } catch { return $false } finally { $tcp.Close() }
}
function WaitFor([string]$title, [scriptblock]$probe, [int]$seconds, $proc) {
    Info ('Aguardando ' + $title + '...')
    for ($i = 0; $i -lt $seconds; $i++) {
        if (& $probe) { return }
        if ($null -ne $proc -and $proc.HasExited) { Fail ($title + ' encerrou antes de iniciar. Veja logs em work\iniciador.') }
        Start-Sleep -Seconds 1
    }
    Fail ('Tempo esgotado ao iniciar ' + $title + '. Veja logs em work\iniciador.')
}
function StartService([string]$key, [string]$task) {
    $out = Join-Path $work ($key + '-saida.log')
    $err = Join-Path $work ($key + '-erros.log')
    # Arquivos distintos exigidos pelo Start-Process. Reinicializacao limpa do log.
    $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/c',('pnpm.cmd ' + $task)) `
        -WorkingDirectory $root -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $out -RedirectStandardError $err
    $proc.Refresh()
    $processes[$key] = @{ id = $proc.Id; startTicks = $proc.StartTime.ToUniversalTime().Ticks }
    $processes | ConvertTo-Json -Depth 5 | Set-Content -Path $registry -Encoding UTF8
    return $proc
}
function GetHttpJson([string]$url) {
    try { return Invoke-RestMethod -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop }
    catch { return $null }
}
function DatabaseOwnedByThisFolder() {
    try {
        $socket = Get-NetTCPConnection -LocalPort 55432 -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($null -eq $socket) { return $false }
        $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $socket.OwningProcess) -ErrorAction Stop
        if ($null -eq $process) { return $false }
        $normalized = ($process.CommandLine -replace '/', '\').ToLowerInvariant()
        $expected = (Join-Path $root 'work\local-db\postgres').ToLowerInvariant()
        return $normalized.Contains($expected)
    } catch { return $false }
}
function UpdateDatabaseEnvironment() {
    $envFile = Join-Path $root '.env'
    $dbFile = Join-Path $root 'work\local-db\database.env'
    if (-not (Test-Path $dbFile)) { Fail 'O banco iniciou, mas database.env nao foi criado.' }
    if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $root '.env.example') $envFile }
    $content = [System.IO.File]::ReadAllText($envFile)
    $backup = Join-Path $work 'env-backup-inicial.txt'
    if (-not (Test-Path $backup)) { [System.IO.File]::WriteAllText($backup, $content, [System.Text.UTF8Encoding]::new($false)) }
    # Recusa alterar uma configuracao apontando para banco remoto ou producao.
    if ($content -match '(?m)^NODE_ENV=production\s*$') { Fail 'Esta configuracao e de producao. O iniciador e exclusivo do PC local.' }
    $existingDb = [regex]::Match($content, '(?m)^DATABASE_URL=([^\r\n]+)')
    if ($existingDb.Success -and $existingDb.Groups[1].Value -notmatch 'CHANGE_LOCALLY') {
        try {
            $uri = [System.Uri]$existingDb.Groups[1].Value
            if ($uri.Host -notin @('127.0.0.1','localhost')) { Fail 'DATABASE_URL aponta para servidor remoto. Nada foi alterado.' }
        } catch { Fail 'DATABASE_URL existente invalida. Revise manualmente antes de usar o iniciador.' }
    }
    foreach ($line in [System.IO.File]::ReadAllLines($dbFile)) {
        if ($line -match '^(DATABASE_URL|MIGRATION_DATABASE_URL)=(.*)$') {
            $key = $Matches[1]
            $value = $Matches[2]
        } else { continue }
        if ($content -match ('(?m)^' + $key + '=')) {
            $content = [regex]::Replace($content, ('(?m)^' + $key + '=[^\r\n]*'), ($key + '=' + $value))
        } else { $content += "`n$key=$value`n" }
    }
    [System.IO.File]::WriteAllText($envFile, $content, [System.Text.UTF8Encoding]::new($false))
}
function AssertCommand([string]$name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { Fail ('Nao encontrei ' + $name + ' no PATH. Instale o Node.js e habilite pnpm primeiro.') }
}

try {
    Info 'Iniciando Local Rank Tracker no seu computador...'
    if (-not (Test-Path (Join-Path $root 'package.json'))) { Fail 'Coloque estes arquivos na pasta que contem package.json.' }
    AssertCommand 'node.exe'
    AssertCommand 'pnpm.cmd'
    $major = [int]((& node.exe --version) -replace '^v(\d+)\..*$', '$1')
    if ($major -lt 22) { Fail 'E necessario Node.js 22.14 ou superior.' }
    # Se o sistema estiver rodando, apenas abre o navegador (sem sobrescrever .env).
    $api = GetHttpJson 'http://127.0.0.1:4178/health'
    $idp = GetHttpJson 'http://127.0.0.1:4181/.well-known/openid-configuration'
    if ($api -and $api.status -eq 'ok' -and $api.service -eq 'Local Rank Tracker' -and
        $idp -and $idp.issuer -eq 'http://127.0.0.1:4181' -and (PortOpen 5173)) {
        # Prevent opening a different/older ZIP's running app by mistake.
        $currentRegistry = Join-Path $root 'work\iniciador\processos.json'
        $sameInstall = $false
        if (Test-Path $currentRegistry) {
            try {
                $record = Get-Content $currentRegistry -Raw | ConvertFrom-Json
                $registered = Get-Process -Id ([int]$record.api.id) -ErrorAction Stop
                $sameInstall = ($registered.StartTime.ToUniversalTime().Ticks -eq [long]$record.api.startTicks)
            } catch { $sameInstall = $false }
        }
        if (-not $sameInstall) {
            Fail 'Outro Local Rank Tracker esta aberto. Encerre a V4 antiga pelo arquivo ENCERRAR_LOCAL_RANK_TRACKER.cmd da pasta antiga, depois tente novamente.'
        }
        Info 'O sistema desta pasta ja esta iniciado. Abrindo no navegador.'
        Start-Process 'http://127.0.0.1:5173/'
        exit 0
    }
    foreach ($port in @(4178,4181,5173)) {
        if (PortOpen $port) { Fail ('Porta ' + $port + ' ja esta ocupada. Feche os terminais antigos da API, login ou Vite e tente novamente.') }
    }
    if (-not (Test-Path (Join-Path $root 'node_modules\.bin\tsx.cmd'))) {
        Info 'Primeira instalacao: baixando dependencias (necessita internet)...'
        & pnpm.cmd install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { Fail 'Falha na instalacao das dependencias.' }
    }

    # O PostgreSQL deve sempre ser o deste diretorio. Nunca encerra bancos de outros programas.
    $dbproc = $null
    if (PortOpen 55432) {
        if (-not (DatabaseOwnedByThisFolder)) { Fail 'A porta 55432 esta ocupada por OUTRO PostgreSQL. Encerre apenas a instancia antiga antes de iniciar.' }
        Info 'PostgreSQL deste projeto ja esta ligado.'
    } else {
        Info 'Ligando PostgreSQL local...'
        $dbproc = StartService 'postgres' 'db:local'
    }
    if ($null -ne $dbproc) {
        $dbLog = Join-Path $work 'postgres-saida.log'
        WaitFor 'PostgreSQL' { (PortOpen 55432) -and (Test-Path '.\work\local-db\database.env') -and (Test-Path $dbLog) -and ((Get-Content $dbLog -Raw) -match 'PostgreSQL development ready') } 100 $dbproc
    } else {
        WaitFor 'PostgreSQL' { (PortOpen 55432) -and (Test-Path '.\work\local-db\database.env') } 20 $null
    }

    UpdateDatabaseEnvironment
    Info 'Preparando login gratuito e privado de homologacao...'
    & pnpm.cmd auth:local:setup
    if ($LASTEXITCODE -ne 0) { Fail 'Falha ao configurar o login local.' }

    # The local OIDC demo must run in development while provider is
    # explicitly isolated to this machine. No flags are allowed in production.
    $envFile = Join-Path $root '.env'
    $content = [System.IO.File]::ReadAllText($envFile)
    $localFlags = @{
        'LRT_LOCAL_EASY_LOGIN' = 'LOCAL_MACHINE_ONLY'
        'VITE_LOCAL_EASY_LOGIN' = 'LOCAL_MACHINE_ONLY'
        'RANK_PROVIDER' = 'local_chrome_preview'
        'LRT_LOCAL_EVAL' = 'I_ACCEPT_LOCAL_ONLY_EXPERIMENTAL_USE'
    }
    foreach ($key in $localFlags.Keys) {
        $value = $localFlags[$key]
        $pattern = '(?m)^' + [regex]::Escape($key) + '=[^\r\n]*'
        if ([regex]::IsMatch($content,$pattern)) { $content = [regex]::Replace($content,$pattern,($key+'='+$value)) }
        else { $content += "`n$key=$value`n" }
    }
    [System.IO.File]::WriteAllText($envFile,$content,[System.Text.UTF8Encoding]::new($false))

    # O pacote completo deve ser COMPILADO, nao executar uma interface de desenvolvimento.
    # VITE_* sao resolvidas no build: compilar somente depois de definir o login local.
    Info 'Compilando a aplicacao completa (React, API, worker e scripts)...'
    & pnpm.cmd build
    if ($LASTEXITCODE -ne 0) { Fail 'O build falhou. Veja o erro acima; nenhum servico da aplicacao sera iniciado.' }
    if (-not (Test-Path (Join-Path $root 'apps\web\dist\index.html'))) {
        Fail 'O build terminou sem gerar apps/web/dist/index.html.'
    }
    if (-not (Test-Path (Join-Path $root 'dist\apps\api\main.js'))) {
        Fail 'O build terminou sem gerar a API compilada.'
    }

    Info 'Preparando acesso e espaco de trabalho local...'
    & pnpm.cmd owner:bootstrap
    if ($LASTEXITCODE -ne 0) { Fail 'Falha ao criar o proprietario. Consulte o log de PostgreSQL.' }
    & pnpm.cmd local:workspace
    if ($LASTEXITCODE -ne 0) { Fail 'Falha ao preparar o ambiente local de trabalho.' }
    & pnpm.cmd preview:enable
    if ($LASTEXITCODE -ne 0) { Fail 'Falha ao ativar a medicao experimental local.' }

    $idpProc = StartService 'login' 'auth:local:serve'
    WaitFor 'login local' { $x = GetHttpJson 'http://127.0.0.1:4181/.well-known/openid-configuration'; $x -and $x.issuer -eq 'http://127.0.0.1:4181' } 30 $idpProc

    $apiProc = StartService 'api' 'api:built'
    WaitFor 'API Fastify' { $x = GetHttpJson 'http://127.0.0.1:4178/health'; $x -and $x.status -eq 'ok' -and $x.service -eq 'Local Rank Tracker' } 45 $apiProc

    $workerProc = StartService 'worker' 'worker:built'
    $webProc = StartService 'painel' 'preview:local'
    WaitFor 'painel React compilado' {
        $response = GetHttpJson 'http://127.0.0.1:5173/health'
        (PortOpen 5173) -and $response -and $response.status -eq 'ok'
    } 50 $webProc

    Info 'Pronto! Abrindo Local Rank Tracker em http://127.0.0.1:5173/'
    Start-Process 'http://127.0.0.1:5173/'
    Info 'Acesso automatico habilitado APENAS no localhost. Nao precisa de senha ou codigo.'
    Info 'Se o navegador nao abriu, use http://127.0.0.1:5173/'
    Info 'Para encerrar os servicos, clique em ENCERRAR_LOCAL_RANK_TRACKER.cmd.'
    exit 0
} catch {
    Write-Host ''
    Write-Host ('[ERRO] ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Logs de diagnostico em work\iniciador.' -ForegroundColor Yellow
    foreach ($name in @('postgres','login','api','worker','painel')) {
        $log = Join-Path $work ($name + '-erros.log')
        if ((Test-Path $log) -and ((Get-Item $log).Length -gt 0)) {
            Write-Host ('--- ' + $name + ' ---') -ForegroundColor Yellow
            Get-Content $log -Tail 8 | ForEach-Object { Write-Host $_ }
        }
    }
    exit 1
}
