$ErrorActionPreference = "Stop"

$nodeVersion = $env:PERSONARANK_NODE_VERSION
if ([string]::IsNullOrWhiteSpace($nodeVersion)) {
  $nodeVersion = "v18.20.8"
}

$nodePackageName = "node-$nodeVersion-win-x64"
$nodeZipUrl = "https://nodejs.org/dist/$nodeVersion/$nodePackageName.zip"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dist = Join-Path $root "dist"
$cache = Join-Path $root ".release-cache"
$release = Join-Path $dist "release"
$runtime = Join-Path $release "runtime"
$zipPath = Join-Path $dist "personarank-collector-windows.zip"
$nodeZipPath = Join-Path $cache "$nodePackageName.zip"
$nodeExtractPath = Join-Path $cache $nodePackageName

New-Item -ItemType Directory -Force $dist | Out-Null
New-Item -ItemType Directory -Force $cache | Out-Null

if (-not (Test-Path $nodeZipPath)) {
  Write-Host "Baixando Node.js portatil $nodeVersion..."
  Invoke-WebRequest -Uri $nodeZipUrl -OutFile $nodeZipPath
}

if (-not (Test-Path $nodeExtractPath)) {
  Write-Host "Extraindo Node.js portatil..."
  Expand-Archive -LiteralPath $nodeZipPath -DestinationPath $cache -Force
}

if (Test-Path $release) {
  Remove-Item -LiteralPath $release -Recurse -Force
}

New-Item -ItemType Directory -Force $release | Out-Null
New-Item -ItemType Directory -Force $runtime | Out-Null

Copy-Item -LiteralPath (Join-Path $nodeExtractPath "node.exe") -Destination (Join-Path $runtime "node.exe")
Copy-Item -LiteralPath (Join-Path $root "src") -Destination (Join-Path $release "src") -Recurse
Copy-Item -LiteralPath (Join-Path $root "package.json") -Destination (Join-Path $release "package.json")
Copy-Item -LiteralPath (Join-Path $root ".env.example") -Destination (Join-Path $release ".env.example")
Copy-Item -LiteralPath (Join-Path $root "README.md") -Destination (Join-Path $release "README.md")

@"
@echo off
cd /d "%~dp0"

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Arquivo .env criado a partir do .env.example.
  echo Edite o COLLECTOR_NAME se quiser identificar quem esta rodando o coletor.
  echo.
)

echo Iniciando PersonaRank Collector...
echo Deixe esta janela aberta ate o fim da partida.
echo.

runtime\node.exe src\index.js

echo.
echo Coletor encerrado.
pause
"@ | Set-Content -LiteralPath (Join-Path $release "start-collector.bat") -Encoding ASCII

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $release "*") -DestinationPath $zipPath -Force

Write-Host "Release criada em: $zipPath"
