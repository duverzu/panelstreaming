#!/usr/bin/env bash
# ==================================================================
#  deploy.sh — actualiza el panel en el VPS en un solo comando.
#  Uso:  bash deploy.sh
# ==================================================================
set -e
cd "$(dirname "$0")"

echo "→ 1/4  Bajando cambios de GitHub…"
git pull

echo "→ 2/4  Dependencias del backend…"
npm install --omit=dev

echo "→ 3/4  Compilando el frontend React…"
cd frontend
npm install
npm run build
cd ..

echo "→ 4/4  Reiniciando el panel…"
pm2 restart panel-radio

echo "✅ Deploy completo. https://server2.streaminghd.co"
