#!/usr/bin/env bash
#
# instalar-compat.sh — monta la capa de compatibilidad "asilivehd" en el nodo.
#
# Requisitos previos:
#   1) El certificado del dominio migrado YA debe existir:
#        /etc/letsencrypt/live/<DOMINIO>/fullchain.pem
#      (sácalo con certbot por DNS-01 ANTES de correr esto, sin downtime).
#   2) El archivo de tokens: /opt/panelstreaming/video-agent/compat-tokens.json
#
# Uso:
#   bash instalar-compat.sh server.asilivehd.com
#
set -e

DOMINIO="${1:-server.asilivehd.com}"
CUENTAS=/opt/nginx-panel/conf/cuentas
PLANTILLAS=/opt/panelstreaming/video-agent/plantillas
HLS_DIR=/var/asilive/hls
LOG_DIR=/var/asilive
PLAYER_DIR=/var/asilive/player
AGENTE="${PUERTO_AGENTE:-3000}"
CERT="/etc/letsencrypt/live/$DOMINIO"

if [ ! -f "$CERT/fullchain.pem" ]; then
  echo "❌ No existe el certificado de $DOMINIO ($CERT/fullchain.pem)."
  echo "   Sácalo primero con certbot (DNS-01) y vuelve a correr esto."
  exit 1
fi

mkdir -p "$HLS_DIR"
chmod -R 777 "$LOG_DIR"    # nginx (worker) escribe aquí el HLS y los logs

echo "→ Preparando el reproductor propio …"
mkdir -p "$PLAYER_DIR"
cp "$PLANTILLAS/player.html" "$PLAYER_DIR/index.html"
if [ ! -f "$PLAYER_DIR/hls.min.js" ]; then
  curl -fsSL https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js -o "$PLAYER_DIR/hls.min.js" \
    || { echo "❌ No se pudo bajar hls.js"; exit 1; }
fi
chmod -R 755 "$PLAYER_DIR"

echo "→ Generando config de entrada (RTMP app 'live') …"
sed -e "s#{{PUERTO_AGENTE}}#$AGENTE#g" \
    -e "s#{{HLS_DIR}}#$HLS_DIR#g" \
    -e "s#{{LOG_DIR}}#$LOG_DIR#g" \
    "$PLANTILLAS/asilive.rtmp" > "$CUENTAS/_asilive.rtmp"

echo "→ Generando config de salida (HLS HTTPS para $DOMINIO) …"
sed -e "s#{{DOMINIO_ASILIVE}}#$DOMINIO#g" \
    -e "s#{{HLS_DIR}}#$HLS_DIR#g" \
    -e "s#{{LOG_DIR}}#$LOG_DIR#g" \
    -e "s#{{PLAYER_DIR}}#$PLAYER_DIR#g" \
    -e "s#{{PUERTO_AGENTE}}#$AGENTE#g" \
    -e "s#{{CERT_FULLCHAIN}}#$CERT/fullchain.pem#g" \
    -e "s#{{CERT_KEY}}#$CERT/privkey.pem#g" \
    "$PLANTILLAS/asilive.http" > "$CUENTAS/_asilive.http"

echo "→ Probando y recargando nginx …"
if /opt/nginx-panel/sbin/nginx -t; then
  systemctl reload nginx-panel
  echo "✅ Capa de compatibilidad activa para $DOMINIO"
  echo "   Tokens cargados: $(grep -c ':' /opt/panelstreaming/video-agent/compat-tokens.json 2>/dev/null || echo 0)"
else
  echo "❌ nginx rechazó la config. Revisa arriba. No se recargó nada."
  exit 1
fi
