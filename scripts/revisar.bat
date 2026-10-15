@echo off
rem Auditoria de significado de color, contraste AA y presupuestos (este ultimo construye antes).
rem Uso: scripts\revisar.bat
setlocal
pushd "%~dp0.."
call npm run -s colores
set "C1=%ERRORLEVEL%"
call npm run -s contraste
set "C2=%ERRORLEVEL%"
call npm run -s build
set "C3=%ERRORLEVEL%"
call npm run -s presupuestos
set "C4=%ERRORLEVEL%"
echo.
echo colores exit=%C1%   contraste exit=%C2%   build exit=%C3%   presupuestos exit=%C4%
popd
if not "%C1%%C2%%C3%%C4%"=="0000" exit /b 1
exit /b 0
