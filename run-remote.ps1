# run-remote.ps1 - Windows PowerShell runner for HWO remote access.
#
# Usage:
#   .\run-remote.ps1
#   .\run-remote.ps1 -Profile prod
#   .\run-remote.ps1 -Prod              # shorthand
#   .\run-remote.ps1 -NoMobile
#
# Optional env vars:
#   $env:PROFILE="dev|prod"      default: dev (or use -Profile parameter)
#   $env:SPRING_PROFILE="dev|prod"
#   $env:BACKEND_PORT="8080"; $env:WEB_PORT="3000"; $env:METRO_PORT="8081"; $env:AI_PORT="8000"
#   $env:NGROK_BIN="C:\path\to\ngrok.exe"
#   $env:NGROK_AUTHTOKEN="..."
#   $env:SKIP_POSTGRES_CHECK="1"
#
# Stop with Ctrl+C. This script stops only processes it starts.

param(
  [ValidateSet("dev", "prod")]
  [string]$Profile = $(if ($env:PROFILE) { $env:PROFILE } else { "dev" }),
  [switch]$Prod,
  [switch]$Dev,
  [switch]$NoMobile
)

if ($Prod) { $Profile = "prod" }
if ($Dev) { $Profile = "dev" }

$SpringProfile = if ($env:SPRING_PROFILE) { $env:SPRING_PROFILE } else { $Profile }

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $Root ".remote-logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$BackendPort = if ($env:BACKEND_PORT) { [int]$env:BACKEND_PORT } else { 8080 }
$AiPort = if ($env:AI_PORT) { [int]$env:AI_PORT } else { 8000 }
$WebPort = if ($env:WEB_PORT) { [int]$env:WEB_PORT } else { 3000 }
$MetroPort = if ($env:METRO_PORT) { [int]$env:METRO_PORT } else { 8081 }
$NgrokApi = if ($env:NGROK_API) { $env:NGROK_API } else { "http://127.0.0.1:4040/api/tunnels" }
$MobileMode = if ($env:MOBILE_MODE) { $env:MOBILE_MODE } else { "ngrok" }
$StartMobile = -not $NoMobile

$StartedProcesses = New-Object System.Collections.Generic.List[System.Diagnostics.Process]
$StartedPorts = New-Object System.Collections.Generic.List[int]
$NgrokProcess = $null

function Log($message) { Write-Host "[run-remote] $message" -ForegroundColor Blue }
function Ok($message) { Write-Host "[ok] $message" -ForegroundColor Green }
function Warn($message) { Write-Host "[warn] $message" -ForegroundColor Yellow }
function Fail($message) { Write-Host "[error] $message" -ForegroundColor Red }

function Test-PortOpen([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $result.AsyncWaitHandle.WaitOne(700, $false)) { return $false }
    $client.EndConnect($result)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Show-LogTail([string]$LogName, [int]$Lines = 25) {
  foreach ($suffix in @("err", "out", "log")) {
    $path = if ($suffix -eq "log") {
      Join-Path $LogDir "$LogName.log"
    } else {
      Join-Path $LogDir "$LogName.$suffix.log"
    }
    if ((Test-Path $path) -and ((Get-Item $path).Length -gt 0)) {
      Write-Host "----- $(Split-Path $path -Leaf) (last $Lines lines) -----" -ForegroundColor DarkGray
      Get-Content $path -Tail $Lines | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    }
  }
}

function Wait-ForHttp([string]$Url, [int]$TimeoutSeconds, [string]$Label, [string]$LogName, $Process) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 | Out-Null
      Ok "$Label is up"
      return $true
    } catch {
      # If the process we started already died, stop waiting and surface its log.
      if ($Process -and $Process.HasExited) {
        Fail "$Label process exited early (code $($Process.ExitCode)) before becoming reachable."
        if ($LogName) { Show-LogTail $LogName }
        return $false
      }
      Start-Sleep -Seconds 2
    }
  }
  Warn "$Label not responding after ${TimeoutSeconds}s (continuing anyway)"
  if ($LogName) { Show-LogTail $LogName }
  return $false
}

function Get-ExePath([string[]]$Names) {
  foreach ($name in $Names) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  return $null
}

function Get-NgrokToken {
  if ($env:NGROK_AUTHTOKEN) { return $env:NGROK_AUTHTOKEN }

  $paths = @(
    (Join-Path $env:LOCALAPPDATA "ngrok\ngrok.yml"),
    (Join-Path $env:APPDATA "ngrok\ngrok.yml"),
    (Join-Path $HOME ".config\ngrok\ngrok.yml"),
    (Join-Path $HOME ".ngrok2\ngrok.yml")
  )

  foreach ($path in $paths) {
    if (Test-Path $path) {
      $line = Get-Content $path | Where-Object { $_ -match "^\s*authtoken:" } | Select-Object -First 1
      if ($line) {
        return (($line -replace ".*authtoken:\s*", "") -replace '"', "").Trim()
      }
    }
  }
  return ""
}

function ConvertTo-QuotedArg([string]$Value) {
  # Start-Process does not auto-quote -ArgumentList items that contain spaces,
  # which breaks paths like "C:\Users\IT MODERN LTD\...". Quote them ourselves.
  if ($Value -match '[\s"]') {
    return '"' + ($Value -replace '"', '\"') + '"'
  }
  return $Value
}

function Start-LoggedProcess([string]$FilePath, [string[]]$ArgumentList, [string]$WorkingDirectory, [string]$LogName) {
  $out = Join-Path $LogDir "$LogName.out.log"
  $err = Join-Path $LogDir "$LogName.err.log"
  $argString = (($ArgumentList | ForEach-Object { ConvertTo-QuotedArg $_ }) -join ' ')
  return Start-Process -FilePath $FilePath `
    -ArgumentList $argString `
    -WorkingDirectory $WorkingDirectory `
    -RedirectStandardOutput $out `
    -RedirectStandardError $err `
    -PassThru `
    -WindowStyle Hidden
}

function Get-BackendJar {
  $jars = Get-ChildItem (Join-Path $Root "backend\target\*.jar") -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "*.original" } |
    Sort-Object LastWriteTime -Descending
  if ($jars) { return $jars[0].FullName }
  return $null
}

function Ensure-BackendJar {
  $jar = Get-BackendJar
  if ($jar) { return $jar }
  Log "Building backend jar (first prod run - can take several minutes) -> $LogDir\backend-build.log"
  $buildLog = Join-Path $LogDir "backend-build.log"
  Push-Location (Join-Path $Root "backend")
  try {
    & $MvnBin @("-q", "-DskipTests", "package") *>$buildLog
  } finally {
    Pop-Location
  }
  if ($LASTEXITCODE -ne 0) {
    Fail "Backend package failed - see $buildLog"
    Show-LogTail "backend-build"
    exit 1
  }
  $jar = Get-BackendJar
  if (-not $jar) {
    Fail "Backend jar not found after package - see $buildLog"
    exit 1
  }
  Ok "Backend jar ready"
  return $jar
}

function Ensure-WebProdBuild {
  $buildId = Join-Path $Root ".next\BUILD_ID"
  if (Test-Path $buildId) {
    Ok "Next.js production build present (reusing)"
    return
  }
  Log "Building Next.js for production (first prod run - can take a few minutes) -> $LogDir\web-build.log"
  $buildLog = Join-Path $LogDir "web-build.log"
  Push-Location $Root
  try {
    & $NpmBin run build *>$buildLog
    if ($LASTEXITCODE -ne 0) {
      Fail "Next.js build failed - see $buildLog"
      Show-LogTail "web-build"
      exit 1
    }
    Ok "Next.js production build ready"
  } finally {
    Pop-Location
  }
}

function Stop-Started {
  Write-Host ""
  Log "Shutting down..."

  if ($NgrokProcess -and -not $NgrokProcess.HasExited) {
    Stop-Process -Id $NgrokProcess.Id -Force -ErrorAction SilentlyContinue
  }

  foreach ($process in $StartedProcesses) {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }

  foreach ($port in $StartedPorts) {
    try {
      Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    } catch {
      # Get-NetTCPConnection is not available in older shells; process tracking above is enough.
    }
  }

  Ok "Stopped."
}

$NgrokBin = if ($env:NGROK_BIN) { $env:NGROK_BIN } else { Get-ExePath @("ngrok.exe", "ngrok") }
$NodeBin = Get-ExePath @("node.exe", "node")
$NpxBin = Get-ExePath @("npx.cmd", "npx.exe", "npx")
$NpmBin = Get-ExePath @("npm.cmd", "npm.exe", "npm")
$MvnBin = Get-ExePath @("mvn.cmd", "mvn.exe", "mvn")
$JavaBin = Get-ExePath @("java.exe", "java")

if (-not $NgrokBin) {
  Fail "ngrok is not installed or not on PATH."
  Write-Host "Install one of:"
  Write-Host "  winget install ngrok.ngrok"
  Write-Host "  choco install ngrok"
  Write-Host "  scoop install ngrok"
  Write-Host "Then run: ngrok config add-authtoken <YOUR_TOKEN>"
  exit 1
}
if (-not $NodeBin) { Fail "node not found"; exit 1 }
if (-not $NpxBin) { Fail "npx not found"; exit 1 }
if (-not $NpmBin) { Fail "npm not found"; exit 1 }
if (-not $MvnBin) { Fail "maven (mvn) not found"; exit 1 }
if ($Profile -eq "prod" -and -not $JavaBin) {
  Fail "java not found (JDK 17+ required for prod profile)"
  exit 1
}

$NgrokToken = Get-NgrokToken
if (-not $NgrokToken) {
  Fail "No ngrok authtoken found."
  Write-Host "Run once: ngrok config add-authtoken <YOUR_TOKEN>"
  Write-Host "Or set: `$env:NGROK_AUTHTOKEN='<YOUR_TOKEN>'"
  exit 1
}

try {
  Log "Profile: $Profile (Spring profile: $SpringProfile)"

  if ($env:SKIP_POSTGRES_CHECK -ne "1") {
    if (Test-PortOpen 5432) { Ok "PostgreSQL reachable on :5432" }
    else { Warn "PostgreSQL not reachable on :5432 - start it before the backend will work" }
  }

  $BackendProcess = $null
  if (Test-PortOpen $BackendPort) {
    Ok "Backend already running on :$BackendPort (reusing)"
  } else {
    if ($Profile -eq "prod") {
      $backendJar = Ensure-BackendJar
      Log "Starting Spring Boot backend (prod jar, profile=$SpringProfile) -> $LogDir\backend.*.log"
      $BackendProcess = Start-LoggedProcess $JavaBin @("-jar", $backendJar, "--spring.profiles.active=$SpringProfile") (Join-Path $Root "backend") "backend"
    } else {
      Log "Starting Spring Boot backend (dev, profile=$SpringProfile) -> $LogDir\backend.*.log"
      $BackendProcess = Start-LoggedProcess $MvnBin @("-q", "spring-boot:run", "-Dspring-boot.run.profiles=$SpringProfile") (Join-Path $Root "backend") "backend"
    }
    $StartedProcesses.Add($BackendProcess); $StartedPorts.Add($BackendPort)
  }

  $AiVenv = Join-Path $Root "ai-service\.venv"
  $AiUvicorn = Join-Path $AiVenv "Scripts\uvicorn.exe"
  if (Test-PortOpen $AiPort) {
    Ok "AI service already running on :$AiPort (reusing)"
  } else {
    if (-not (Test-Path $AiUvicorn)) {
      $PyBin = Get-ExePath @("py.exe", "py", "python.exe", "python", "python3")
      if ($PyBin) {
        Log "Setting up AI service venv (first run - this can take a few minutes) -> $LogDir\ai-setup.log"
        $setupLog = Join-Path $LogDir "ai-setup.log"
        try {
          & $PyBin -m venv $AiVenv *>$setupLog
          $AiPython = Join-Path $AiVenv "Scripts\python.exe"
          & $AiPython -m pip install --quiet --upgrade pip *>>$setupLog
          & $AiPython -m pip install -q -r (Join-Path $Root "ai-service\requirements.txt") *>>$setupLog
          if (Test-Path $AiUvicorn) { Ok "AI venv ready" }
          else { Warn "AI venv setup incomplete (see $setupLog) - backend will use its fallback model" }
        } catch {
          Warn "AI venv setup failed (see $setupLog) - backend will use its fallback model"
        }
      } else {
        Warn "python not found - skipping AI service; backend uses its fallback model"
      }
    }
    if (Test-Path $AiUvicorn) {
      Log "Starting AI service -> $LogDir\ai.*.log"
      $p = Start-LoggedProcess $AiUvicorn @("main:app", "--host", "0.0.0.0", "--port", "$AiPort") (Join-Path $Root "ai-service") "ai"
      $StartedProcesses.Add($p); $StartedPorts.Add($AiPort)
      Warn "AI service warms up on first import (~1-2 min); backend falls back until it is healthy"
    }
  }

  $WebProcess = $null
  if (Test-PortOpen $WebPort) {
    Ok "Web already running on :$WebPort (reusing)"
  } else {
    if ($Profile -eq "prod") {
      Ensure-WebProdBuild
      Log "Starting Next.js web (prod, next start) -> $LogDir\web.*.log"
      $WebProcess = Start-LoggedProcess $NpmBin @("run", "start") $Root "web"
    } else {
      Log "Starting Next.js web (dev, next dev) -> $LogDir\web.*.log"
      $WebProcess = Start-LoggedProcess $NpmBin @("run", "dev") $Root "web"
    }
    $StartedProcesses.Add($WebProcess); $StartedPorts.Add($WebPort)
  }

  if ($Profile -eq "prod") {
    $BackendTimeout = if ($env:BACKEND_TIMEOUT) { [int]$env:BACKEND_TIMEOUT } else { 360 }
    $WebTimeout = if ($env:WEB_TIMEOUT) { [int]$env:WEB_TIMEOUT } else { 180 }
  } else {
    $BackendTimeout = if ($env:BACKEND_TIMEOUT) { [int]$env:BACKEND_TIMEOUT } else { 120 }
    $WebTimeout = if ($env:WEB_TIMEOUT) { [int]$env:WEB_TIMEOUT } else { 120 }
  }
  $backendUp = Wait-ForHttp "http://127.0.0.1:$BackendPort/api/auth/registration-config" $BackendTimeout "Backend" "backend" $BackendProcess
  Wait-ForHttp "http://127.0.0.1:$WebPort" $WebTimeout "Web" "web" $WebProcess | Out-Null

  if (-not $backendUp) {
    Warn "Backend is not reachable. Mobile/web API calls will fail until it is up."
    Warn "Check $LogDir\backend.err.log (full log). Common causes: Java/Maven not installed, port $BackendPort in use, or DB not running."
  }

  $WantMetro = $StartMobile -and ($MobileMode -eq "ngrok")
  $NgrokCfg = Join-Path $LogDir "ngrok.yml"
  $cfg = @"
version: "2"
authtoken: $NgrokToken
tunnels:
  web:
    addr: $WebPort
    proto: http
  backend:
    addr: $BackendPort
    proto: http
"@
  if ($WantMetro) {
    $cfg += @"

  metro:
    addr: $MetroPort
    proto: http
"@
  }
  Set-Content -Path $NgrokCfg -Value $cfg -Encoding UTF8

  $tunnelLabel = "web:$WebPort, backend:$BackendPort"
  if ($WantMetro) { $tunnelLabel += ", metro:$MetroPort" }
  Log "Starting ngrok tunnels ($tunnelLabel) -> $LogDir\ngrok.*.log"
  $NgrokProcess = Start-LoggedProcess $NgrokBin @("start", "--all", "--config", $NgrokCfg, "--log", "stdout") $Root "ngrok"

  $WebUrl = ""; $BackendUrl = ""; $MetroUrl = ""
  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    try {
      $data = Invoke-RestMethod -Uri $NgrokApi -TimeoutSec 3
      foreach ($tunnel in $data.tunnels) {
        if ($tunnel.public_url -like "https*") {
          if ($tunnel.name -eq "web") { $WebUrl = $tunnel.public_url }
          if ($tunnel.name -eq "backend") { $BackendUrl = $tunnel.public_url }
          if ($tunnel.name -eq "metro") { $MetroUrl = $tunnel.public_url }
        }
      }
    } catch {}

    $metroReady = (-not $WantMetro) -or $MetroUrl
    if ($WebUrl -and $BackendUrl -and $metroReady) { break }
    if ($WebUrl -and ((Get-Date) -gt $deadline.AddSeconds(-29))) { break }
    # If ngrok exited before tunnels were ready, stop early and show why.
    if ($NgrokProcess -and $NgrokProcess.HasExited) {
      Fail "ngrok exited (code $($NgrokProcess.ExitCode)) before tunnels were ready."
      Show-LogTail "ngrok"
      Warn "Free plan allows up to 3 endpoints, so 3 tunnels is OK. Check the log above:"
      Warn " - ERR_NGROK_105/4018: invalid authtoken (run: ngrok config add-authtoken <TOKEN>)"
      Warn " - ERR_NGROK_108: another ngrok agent is already running (close it in Task Manager / dashboard.ngrok.com/agents)"
      exit 1
    }
    Start-Sleep -Seconds 2
  }

  if (-not $WebUrl) {
    Fail "Could not read ngrok URLs from $NgrokApi"
    Show-LogTail "ngrok"
    Warn "Free plan allows up to 3 endpoints, so 3 tunnels is OK. Check the log above:"
    Warn " - ERR_NGROK_105/4018: invalid authtoken (run: ngrok config add-authtoken <TOKEN>)"
    Warn " - ERR_NGROK_108: another ngrok agent is already running (close it in Task Manager / dashboard.ngrok.com/agents)"
    Warn " - is the ngrok web inspector reachable at http://127.0.0.1:4040 ?"
    exit 1
  }
  Ok "Tunnels established"

  if ($WantMetro -and -not $MetroUrl) {
    Warn "Metro tunnel not available (ngrok plan tunnel limit?) - falling back to Expo --tunnel"
    $MobileMode = "tunnel"
  }

  $MobileEnv = Join-Path $Root "mobile\.env"
  if ($BackendUrl) {
    $MobileApiDesc = "direct backend tunnel"
    $MobileEnvVar = "EXPO_PUBLIC_BACKEND_URL"
    $MobileEnvVal = $BackendUrl
    Set-Content -Path $MobileEnv -Value "# Auto-generated by run-remote.ps1 on $(Get-Date)`nEXPO_PUBLIC_BACKEND_URL=$BackendUrl" -Encoding UTF8
  } else {
    $MobileApiDesc = "web /api proxy (no separate backend tunnel)"
    $MobileEnvVar = "EXPO_PUBLIC_API_URL"
    $MobileEnvVal = $WebUrl
    Set-Content -Path $MobileEnv -Value "# Auto-generated by run-remote.ps1 on $(Get-Date)`nEXPO_PUBLIC_API_URL=$WebUrl" -Encoding UTF8
  }
  Ok "Wrote mobile\.env ($MobileEnvVar=$MobileEnvVal)"

  Write-Host ""
  Write-Host "------------------------------------------------------------" -ForegroundColor Green
  Write-Host " HWO is live over the internet ($Profile profile)" -ForegroundColor Green
  Write-Host "------------------------------------------------------------" -ForegroundColor Green
  Write-Host "  Web app (open in browser):   $WebUrl"
  Write-Host "  Mobile API target:           $MobileEnvVal"
  Write-Host "                               ($MobileApiDesc)"
  if ($MetroUrl) { Write-Host "  Mobile bundler (Metro):      $MetroUrl" }
  Write-Host "  ngrok inspector:             http://127.0.0.1:4040"
  Write-Host "  Logs:                        $LogDir"
  Write-Host "------------------------------------------------------------" -ForegroundColor Green

  if ($StartMobile) {
    Push-Location (Join-Path $Root "mobile")
    try {
      Set-Item -Path "Env:$MobileEnvVar" -Value $MobileEnvVal
      switch ($MobileMode) {
        "ngrok" {
          Log "Starting Expo (mobile) via ngrok Metro tunnel. Scan the QR in Expo Go. Ctrl+C stops everything."
          Log "Metro public URL: $MetroUrl"
          $env:EXPO_PACKAGER_PROXY_URL = $MetroUrl
          & $NpxBin expo start --port $MetroPort
        }
        "tunnel" {
          Log "Starting Expo (mobile) with Expo's --tunnel. Scan the QR in Expo Go. Ctrl+C stops everything."
          & $NpxBin expo start --tunnel
        }
        "lan" {
          Log "Starting Expo (mobile) in LAN mode (same Wi-Fi only). Ctrl+C stops everything."
          & $NpxBin expo start --lan
        }
        default {
          Fail "Unknown MOBILE_MODE='$MobileMode' (use ngrok|tunnel|lan)"
        }
      }
    } finally {
      Pop-Location
    }
  } else {
    Log "Mobile skipped (-NoMobile). Press Ctrl+C to stop services and tunnels."
    while ($true) { Start-Sleep -Seconds 3600 }
  }
} finally {
  Stop-Started
}
