@echo off
setlocal

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

node src\index.js

echo.
echo Coletor encerrado.
pause
