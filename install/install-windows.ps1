# Installs the Claude Bridge CEP panel for the current Windows user (no admin needed).
# Usage (from the repo root):  powershell -ExecutionPolicy Bypass -File install\install-windows.ps1
$ErrorActionPreference = "Stop"

$src = Join-Path $PSScriptRoot "..\panel"
$dst = Join-Path $env:APPDATA "Adobe\CEP\extensions\ClaudeBridge"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -Path (Join-Path $src "*") -Destination $dst -Recurse -Force
Write-Host "Panel installed to $dst"

# Unsigned CEP panels only load with PlayerDebugMode (per user, HKCU).
foreach ($v in 10, 11, 12) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    New-Item -Path $key -Force | Out-Null
    Set-ItemProperty -Path $key -Name PlayerDebugMode -Value "1"
}
Write-Host "PlayerDebugMode enabled for CSXS 10-12"

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. After Effects > Edit > Preferences > Scripting & Expressions > tick 'Allow Scripts to Write Files and Access Network'"
Write-Host "  2. Restart After Effects. Window > Extensions > Claude Bridge should show a green dot."
Write-Host "  3. Claude Desktop > Settings > Extensions > Install Extension... > choose after-effects-mcp-pro.mcpb (from Releases)"
