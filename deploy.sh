#!/usr/bin/env bash
# ==================================================================
#  deploy.sh — actualiza el panel en el VPS en un solo comando.
#  Uso:  bash deploy.sh
# ==================================================================
set -e
cd "$(dirname "$0")"

echo "→ 1/4  Bajando cambios de GitHub…"
git pull

echo "→ 2/5  Dependencias del backend…"
npm install --omit=dev

echo "→ 3/5  Migraciones de base de datos (idempotente)…"
npm run migrate

echo "→ 4/5  Compilando el frontend React…"
cd frontend
npm install
npm run build
cd ..

echo "→ 5/5  Reiniciando el panel…"
pm2 restart panel-radio

echo "✅ Deploy completo. https://server2.streaminghd.co"
