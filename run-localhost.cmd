@echo off
setlocal
cd /d "%~dp0"

set "PKG_RUNNER="
where npm >nul 2>nul
if not errorlevel 1 set "PKG_RUNNER=npm"

if "%PKG_RUNNER%"=="" (
  set "CODEX_PNPM=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
  if exist "%CODEX_PNPM%" set "PKG_RUNNER=%CODEX_PNPM%"
)

if "%PKG_RUNNER%"=="" (
  echo Node.js or the Codex bundled runtime is required to run this application.
  echo Install Node.js LTS from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing project dependencies. This can take a few minutes the first time.
  call "%PKG_RUNNER%" install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting IPI Billing ^& Sales on http://localhost:5173
call "%PKG_RUNNER%" run dev -- --host 127.0.0.1 --port 5173
pause
