#!/bin/sh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1 || ! command -v corepack >/dev/null 2>&1; then
  echo "Manba o‘yinini ishga tushirish uchun Node.js va Corepack kerak."
  exit 1
fi
if [ ! -x node_modules/.bin/vite ]; then
  echo 'Kutubxonalar o‘rnatilmagan. Terminalda "corepack pnpm install" buyrug‘ini bajaring.'
  exit 1
fi
corepack pnpm dev -- --host 127.0.0.1 --open
