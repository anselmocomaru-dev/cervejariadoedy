# Cria o repositório remoto no GitHub e faz push da branch main.
# Pré-requisito: gh autenticado (gh auth login).

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
    Write-Error "GitHub CLI (gh) não encontrado. Instale com: winget install GitHub.cli"
}

$auth = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Autentique-se no GitHub (abre o browser):" -ForegroundColor Yellow
    gh auth login --hostname github.com --git-protocol https --web --skip-ssh-key
}

git remote set-url origin https://github.com/anselmocomaru-dev/cervejariadoedy.git

$exists = gh repo view anselmocomaru-dev/cervejariadoedy 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "A criar repositório remoto..." -ForegroundColor Cyan
    gh repo create cervejariadoedy --public --source=. --remote=origin --description "Cervejaria do Edy - monorepo independente"
}

Write-Host "A enviar commits para origin/main..." -ForegroundColor Cyan
git push -u origin main

Write-Host "Concluído: https://github.com/anselmocomaru-dev/cervejariadoedy" -ForegroundColor Green
