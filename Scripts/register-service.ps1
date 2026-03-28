# Chakhdi Proxy - Windows Service Registration
# Run once as Administrator. After that, no prompts on boot.

param(
    [string]$InstallPath = $PSScriptRoot,
    [string]$ServiceName = "ChakhdiProxyService"
)

# Require admin
$currentPrincipal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator."
    Write-Host "Right-click PowerShell and choose 'Run as administrator'."
    exit 1
}

# Resolve app directory
$appDir = $InstallPath
if ($InstallPath -match "scripts$") {
    $appDir = Split-Path -Parent $InstallPath
}

$exePath = Join-Path $appDir "dist\\chakhdi-service.exe"
$serverJs = Join-Path $appDir "server.js"

# Resolve Node.js executable (portable or system)
$nodeExe = ""
$portableNode = Get-ChildItem -Path $appDir -Directory -Filter "node-*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($portableNode) {
    $candidate = Join-Path $portableNode.FullName "node.exe"
    if (Test-Path $candidate) { $nodeExe = $candidate }
}
if (-not $nodeExe) {
    $nodeFound = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeFound) { $nodeExe = $nodeFound.Source }
}

# Determine binPath
$binPath = $null
$binPathRaw = $null
if (Test-Path $exePath) {
    $binPath = '"' + $exePath + '"'
    $binPathRaw = "`"$exePath`""
} else {
    # Fallback to node server.js for dev mode
    if (-not $nodeExe) {
        Write-Error "Neither dist\\chakhdi-service.exe nor node.exe was found."
        Write-Host "Build the EXE or install Node.js, then retry."
        exit 1
    }
    if (-not (Test-Path $serverJs)) {
        Write-Error "server.js not found at: $serverJs"
        exit 1
    }
    $binPath = '"' + $nodeExe + '" "' + $serverJs + '"'
    $binPathRaw = "`"$nodeExe`" `"$serverJs`""
}

$displayName = "Chakhdi Proxy Service"
$description = "Custom HTTPS Proxy with DNS and Web Dashboard"

# Remove existing service if present
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Service already exists. Removing..." -ForegroundColor Yellow
    try {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    } catch { }
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

# Create service
Write-Host "Registering service: $ServiceName" -ForegroundColor Cyan
Write-Host "Using binPath: $binPath" -ForegroundColor Gray

try {
    New-Service -Name $ServiceName -BinaryPathName $binPathRaw -DisplayName $displayName -StartupType Automatic -ErrorAction Stop | Out-Null
} catch {
    # Fallback to sc.exe if New-Service fails
    $binArg = "binPath= $binPath"
    $displayArg = "DisplayName= `"$displayName`""
    $startArg = "start= auto"
    $scOutput = & sc.exe create $ServiceName $binArg $displayArg $startArg 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Service creation failed. New-Service error: $($_.Exception.Message) | sc.exe output: $scOutput"
        exit 1
    }
}

# Set description
$regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
if (Test-Path $regPath) {
    Set-ItemProperty -Path $regPath -Name "Description" -Value $description -ErrorAction SilentlyContinue
}

Write-Host "Service registered successfully." -ForegroundColor Green
Write-Host "Start it with: net start $ServiceName" -ForegroundColor Gray
