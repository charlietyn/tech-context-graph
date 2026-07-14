param(
    [ValidateSet("minimal", "recommended", "all")]
    [string]$Profile = "recommended",
    [switch]$InstallOllama
)

$ErrorActionPreference = "Stop"

function Test-Command($Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command "uv")) {
    Write-Host "Installing uv with winget..."
    winget install --id astral-sh.uv --exact --accept-package-agreements --accept-source-agreements
}

$Package = switch ($Profile) {
    "minimal" { "graphifyy[mcp]" }
    "recommended" { "graphifyy[pdf,office,mcp,svg,sql,postgres,ollama]" }
    "all" { "graphifyy[all]" }
}

Write-Host "Installing official Graphify package: $Package"
uv tool install --force $Package
uv tool update-shell

if ($InstallOllama -and -not (Test-Command "ollama")) {
    Write-Host "Installing Ollama..."
    winget install --id Ollama.Ollama --exact --accept-package-agreements --accept-source-agreements
}

Write-Host "Registering Graphify project-agnostic agent skill..."
graphify install --platform agents

Write-Host "Installation complete. Open a new terminal and run: graphify --version"
