# Gera links do PWA Cliente para homologação local.
# Uso: obtenha token_sessao da mesa no Table Editor do Supabase (tabela mesas).

param(
    [string]$Token = "",
    [string]$BaseUrl = "http://127.0.0.1:8002"
)

if (-not $Token) {
    Write-Host "Informe o token_sessao da mesa:" -ForegroundColor Yellow
    Write-Host "  .\scripts\qr-link-cliente.ps1 -Token '<uuid-da-mesa>'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Exemplo de URL:" -ForegroundColor Gray
    Write-Host "  $BaseUrl/cliente?t=00000000-0000-0000-0000-000000000001"
    exit 0
}

$url = "$BaseUrl/cliente?t=$Token"
Write-Host "Link do cliente (QR Code):" -ForegroundColor Green
Write-Host $url
Write-Host ""
Write-Host "Cole esta URL em um gerador de QR (ex: qr-code-generator.com) para imprimir na mesa."
