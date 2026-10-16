@echo off
rem Pruebas unitarias (Vitest). Las de punta a punta: scripts\e2e.bat.
setlocal
pushd "%~dp0.."
call npm run -s test
set "CODIGO=%ERRORLEVEL%"
popd
exit /b %CODIGO%
