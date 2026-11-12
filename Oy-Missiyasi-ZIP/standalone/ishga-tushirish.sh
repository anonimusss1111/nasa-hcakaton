#!/bin/sh
cd "$(dirname "$0")"
echo "Oy Missiyasi: http://127.0.0.1:8000/?skipModels=1"
python3 -m http.server 8000
