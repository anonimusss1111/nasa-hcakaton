#!/bin/sh
GAME_DIR="$(dirname "$0")/standalone"
if [ ! -f "$GAME_DIR/index.html" ]; then
  echo "Tayyor offline o‘yin topilmadi. Manba loyihadan ishga tushirish uchun ./ishga-tushirish-manba.sh buyrug‘ini bering."
  echo "Offline nusxa yaratish uchun Node.js, pnpm va corepack pnpm build kerak."
  exit 1
fi
exec sh "$GAME_DIR/ishga-tushirish.sh"
