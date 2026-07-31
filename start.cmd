@echo off
REM CargoChain — one-command dev launcher wrapper (Windows cmd)
setlocal

cd /d "%~dp0"
call npm run dev:all
