@echo off
REM CargoChain — one-command dev launcher (Windows cmd)
setlocal

cd /d "%~dp0"

echo ==^> [1/4] Starting Ganache
start "CargoChain-Ganache" cmd /k "ganache --deterministic"

echo ==^> [2/4] Compiling + migrating contracts
call npx truffle compile
if errorlevel 1 goto :error
call npx truffle migrate --reset --network development
if errorlevel 1 goto :error

echo ==^> [3/4] Starting Express upload server
start "CargoChain-Upload" cmd /k "node server\upload-server.js"

echo ==^> [4/4] Serving frontend
start "CargoChain-Frontend" cmd /k "cd src && npx http-server -p 8080 -c-1"

echo.
echo ================================================================
echo   CargoChain dev environment ready
echo   Marketplace:    http://127.0.0.1:8080
echo   Upload server:  http://127.0.0.1:3000
echo   Ganache RPC:    http://127.0.0.1:7545
echo ================================================================
goto :eof

:error
echo Build/migrate failed. See output above.
exit /b 1
