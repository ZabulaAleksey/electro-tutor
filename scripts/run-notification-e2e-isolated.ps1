$ErrorActionPreference = 'Stop'
$dbName = 'electro-tutor-et141-test-20260928'
$dbPort = 55436
$idpName = "electro-tutor-et141-idp-$([guid]::NewGuid().ToString('N'))"
$dbStarted = $false
$idpStarted = $false

function Assert-FreePort([int]$port) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    try { $listener.Start() }
    finally { $listener.Stop() }
}

foreach ($port in @($dbPort, 58081, 8000, 4322)) { Assert-FreePort $port }
$details = @(docker inspect $dbName | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0 -or $details.Count -ne 1) { throw 'Disposable database container is unavailable.' }
$db = $details[0]
$dataMounts = @($db.Mounts | Where-Object Destination -eq '/var/lib/postgresql/data')
$otherMounts = @($db.Mounts | Where-Object Destination -ne '/var/lib/postgresql/data')
$bindings = @($db.HostConfig.PortBindings.'5432/tcp')
if ($db.Name -ne "/$dbName" -or $db.Config.Image -ne 'postgres:17.6' -or $db.State.Running -or
    $dataMounts.Count -ne 1 -or $dataMounts[0].Type -ne 'volume' -or $dataMounts[0].Name -ne $dbName -or
    $otherMounts.Count -ne 1 -or $otherMounts[0].Type -ne 'bind' -or $otherMounts[0].RW -or
    $otherMounts[0].Destination -ne '/docker-entrypoint-initdb.d/001-init.sql' -or
    $bindings.Count -ne 1 -or $bindings[0].HostIp -ne '127.0.0.1' -or [int]$bindings[0].HostPort -ne $dbPort) {
    throw 'Refusing to start a database that is not the exact stopped disposable ET-14.1 test container.'
}
docker image inspect 'quay.io/keycloak/keycloak:26.7.2' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Pinned local Keycloak image is unavailable; no image pull attempted.' }
if (-not (Test-Path 'services/api/.venv/Scripts/python.exe')) {
    throw 'Locked backend .venv is missing; run pnpm backend:bootstrap first.'
}
pnpm.cmd build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build and artifact audits failed before isolated services started.' }

try {
    $dbStarted = $true
    docker start $dbName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL start failed.' }
    $ready = $false
    for ($attempt = 0; $attempt -lt 180; $attempt++) {
        docker exec $dbName pg_isready -U electro_tutor_bootstrap -d electro_tutor_test 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Disposable PostgreSQL did not become ready.' }
    Write-Output 'Disposable PostgreSQL ownership and readiness PASS (127.0.0.1:55436).'

    $env:ET_KEYCLOAK_ADMIN_PASSWORD = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $env:ET_DEV_TEST_PASSWORD = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $env:KC_BOOTSTRAP_ADMIN_USERNAME = 'admin'
    $env:KC_BOOTSTRAP_ADMIN_PASSWORD = $env:ET_KEYCLOAK_ADMIN_PASSWORD
    $env:KC_HOSTNAME = 'http://127.0.0.1:58081'
    $env:KC_HOSTNAME_BACKCHANNEL_DYNAMIC = 'true'
    $idpStarted = $true
    docker run --pull=never --rm -d --name $idpName -p '127.0.0.1:58081:8080' `
        -e KC_BOOTSTRAP_ADMIN_USERNAME -e KC_BOOTSTRAP_ADMIN_PASSWORD `
        -e KC_HOSTNAME -e KC_HOSTNAME_BACKCHANNEL_DYNAMIC `
        'quay.io/keycloak/keycloak:26.7.2' start-dev --http-port=8080 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Disposable Keycloak start failed.' }
    $env:BACKEND_CLONE_CONTAINER = $dbName
    $env:ET_TEST_POSTGRES_PORT = [string]$dbPort
    node scripts/run-auth-e2e-isolated.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Isolated live-auth browser phase failed.' }
} finally {
    $cleanupFailures = @()
    if ($idpStarted) {
        $idpRunning = docker inspect --format '{{.State.Running}}' $idpName 2>$null
        if ($LASTEXITCODE -ne 0) { $cleanupFailures += 'Keycloak status unknown' }
        elseif ($idpRunning -eq 'true') {
            docker stop $idpName | Out-Null
            if ($LASTEXITCODE -ne 0) { $cleanupFailures += 'Keycloak' }
        }
    }
    if ($dbStarted) {
        $dbRunning = docker inspect --format '{{.State.Running}}' $dbName 2>$null
        if ($LASTEXITCODE -ne 0) { $cleanupFailures += 'PostgreSQL status unknown' }
        elseif ($dbRunning -eq 'true') {
            docker stop $dbName | Out-Null
            if ($LASTEXITCODE -ne 0) { $cleanupFailures += 'PostgreSQL' }
        }
    }
    foreach ($name in @('ET_KEYCLOAK_ADMIN_PASSWORD', 'ET_DEV_TEST_PASSWORD', 'KC_BOOTSTRAP_ADMIN_PASSWORD',
        'KC_BOOTSTRAP_ADMIN_USERNAME', 'KC_HOSTNAME', 'KC_HOSTNAME_BACKCHANNEL_DYNAMIC',
        'BACKEND_CLONE_CONTAINER', 'ET_TEST_POSTGRES_PORT')) {
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    if ($cleanupFailures.Count -gt 0) {
        throw "Disposable cleanup failed for: $($cleanupFailures -join ', ')."
    }
}
