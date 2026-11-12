@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Manba o‘yinini ishga tushirish uchun Node.js o‘rnating: https://nodejs.org/
  pause
  exit /b 1
)
where corepack >nul 2>nul
if errorlevel 1 (
  echo Corepack topilmadi. Node.js LTS versiyasini qayta o‘rnating yoki pnpm o‘rnating.
  pause
  exit /b 1
)
if not exist "node_modules\.bin\vite.cmd" (
  echo Kutubxonalar o‘rnatilmagan. Terminalda "corepack pnpm install" buyrug‘ini bajaring.
  pause
  exit /b 1
)
start "Oy Missiyasi manba serveri" /D "%~dp0" cmd /k "corepack pnpm dev -- --host 127.0.0.1 --open"
