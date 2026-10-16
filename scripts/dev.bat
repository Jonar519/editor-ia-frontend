@echo off
rem Servidor de desarrollo en http://127.0.0.1:5175 (el API va por proxy a 127.0.0.1:4200).
setlocal
pushd "%~dp0.."
call npm run dev
set "CODIGO=%ERRORLEVEL%"
popd
exit /b %CODIGO%
