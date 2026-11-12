import { cp, copyFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const distribution = resolve(root, 'standalone')

await mkdir(distribution, { recursive: true })
await cp(resolve(root, 'dist'), distribution, { recursive: true, force: true })
await copyFile(resolve(root, 'OYINNI-ISHGA-TUSHIRISH.txt'), resolve(distribution, 'OYINNI-ISHGA-TUSHIRISH.txt'))
await writeFile(resolve(distribution, 'ishga-tushirish.bat'), `@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  start "Oy Missiyasi serveri" /D "%~dp0" py -3 -m http.server 8000
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python topilmadi. O‘yinni ishga tushirish uchun Python 3 kerak.
    pause
    exit /b 1
  )
  start "Oy Missiyasi serveri" /D "%~dp0" python -m http.server 8000
)
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8000/?skipModels=1"
echo O‘yin brauzerda ochildi. To‘xtatish uchun "Oy Missiyasi serveri" oynasini yoping.
`, 'utf8')
await writeFile(resolve(distribution, 'ishga-tushirish.sh'), `#!/bin/sh
cd "$(dirname "$0")"
echo "Oy Missiyasi: http://127.0.0.1:8000/?skipModels=1"
python3 -m http.server 8000
`, 'utf8')

console.log(`Offline game prepared in ${distribution}`)
