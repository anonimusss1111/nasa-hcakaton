@echo off
chcp 65001 >nul
setlocal
set "GAME_DIR=%~dp0standalone"
if not exist "%GAME_DIR%\index.html" (
  echo Tayyor offline o‘yin topilmadi.
  echo Manba loyihadan ishga tushirish uchun "ishga-tushirish-manba.bat" faylini oching.
  echo Offline nusxani yaratish uchun Node.js, pnpm va "corepack pnpm build" kerak.
  pause
  exit /b 1
)
call "%GAME_DIR%\ishga-tushirish.bat"
