# Homologacao local - backend FastAPI na porta 8002
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend-services"

Set-Location $Backend

if (-not (Test-Path ".venv\Scripts\Activate.ps1")) {
    Write-Error "venv nao encontrado. Execute: python -m venv .venv"
}

. .\.venv\Scripts\Activate.ps1

if (-not (Test-Path ".env")) {
    Write-Warning ".env ausente - copie de .env.example e preencha as credenciais."
}

$port = if ($env:PORT) { $env:PORT } else { "8002" }

# Liberta a porta se restarem uvicorn antigos (evita 500 por processo stale)
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Write-Host "A iniciar Cervejariadoedy API em http://127.0.0.1:$port" -ForegroundColor Cyan
uvicorn app.main:app --reload --host 127.0.0.1 --port $port
