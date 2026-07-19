#!/bin/sh
# Se ejecuta al arrancar el contenedor: migra la BD (idempotente) y lanza el panel.
set -e
echo "→ Migración de base de datos…"
node scripts/migrate.js
echo "→ Iniciando panel en el puerto ${PORT:-3000}…"
exec node server.js
