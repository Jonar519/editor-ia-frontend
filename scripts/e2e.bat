@echo off
rem Pruebas de punta a punta en el contenedor OFICIAL de Playwright para Linux (el mismo que el CI).
rem No usa el node_modules de Windows: copia el repo dentro del contenedor, instala y construye ahi.
rem Uso: scripts\e2e.bat [argumentos de playwright test]
rem Reporte: playwright-report\index.html
setlocal
pushd "%~dp0.."
if not exist "playwright-report" mkdir "playwright-report"
docker run --rm --ipc=host -e CI=true -e TZ=UTC -e HOME=/root -v "%CD%:/src:ro" -v "%CD%\playwright-report:/salida" mcr.microsoft.com/playwright:v1.63.0-noble bash /src/scripts/e2e-linux.sh %*
set "CODIGO=%ERRORLEVEL%"
popd
exit /b %CODIGO%
