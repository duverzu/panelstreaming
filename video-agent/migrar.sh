#!/usr/bin/env bash
#
# migrar.sh — cambia los clientes de VDO Panel al motor propio.
#
# Corte todo-o-nada (VDO Panel es un solo nginx sirviendo a los tres):
# se para VDO, arranca el nuestro y encienden los canales. Downtime < 1 min.
#
# REVERSIBLE: si algo falla, `bash migrar.sh revertir` vuelve a VDO Panel.
#
#   bash migrar.sh preparar   # genera config + claves, SIN cortar (seguro)
#   bash migrar.sh cortar      # el corte real
#   bash migrar.sh revertir    # vuelve a VDO Panel
#
set -u

AGENTE="http://127.0.0.1:3000"
TOKEN=$(grep '^AGENT_TOKEN=' /opt/video-agent/.env | cut -d= -f2)
NGINX_PANEL="/opt/nginx-panel/sbin/nginx"

# cuenta:puerto_http:puerto_rtmp  (los puertos reales que ya usan los clientes)
CLIENTES=(
  "santander:3129:2334"
  "trenradi:3718:2101"
  "sensaciontv:3953:2820"
)

api() { curl -s -H "Authorization: Bearer $TOKEN" "$@"; }

preparar() {
  echo "═══ PREPARAR — genera config y claves, sin cortar nada ═══"
  for entrada in "${CLIENTES[@]}"; do
    IFS=: read -r user http rtmp <<< "$entrada"
    echo "── $user (http $http, rtmp $rtmp)"
    # Genera la config de nuestro nginx con SUS puertos, pero no la activa aún
    # (el reload fallaria el bind porque VDO tiene esos puertos). Solo escribe.
    api -X POST "$AGENTE/cuentas" -H 'Content-Type: application/json' \
        -d "{\"user\":\"$user\",\"http\":$http,\"rtmp\":$rtmp,\"reload\":false}" -o /tmp/mig-$user.json
    grep -q '"error"' /tmp/mig-$user.json && { echo "   ⚠️  $(cat /tmp/mig-$user.json)"; }
    # Clave de transmisión en vivo (aleatoria; se puede regenerar luego)
    api -X POST "$AGENTE/cuentas/$user/clave" -o /tmp/clave-$user.json >/dev/null
    echo "   config escrita · clave lista"
  done
  echo
  echo "✅ Preparado. Revisa que no haya errores arriba y luego: bash migrar.sh cortar"
}

cortar() {
  echo "═══ CORTE — VDO Panel → motor propio ═══"
  echo "Guardando referencia de VDO Panel…"
  cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.pre-migracion 2>/dev/null || true

  echo "1) Parando el nginx de VDO Panel…"
  systemctl stop nginx 2>/dev/null || nginx -s stop 2>/dev/null || pkill -f "vdopanel" || true
  sleep 2

  echo "2) Arrancando nuestro nginx (toma los puertos de los clientes)…"
  if ! $NGINX_PANEL -t 2>/tmp/ng.txt; then
    echo "   ❌ config inválida:"; cat /tmp/ng.txt
    echo "   Revirtiendo…"; revertir; exit 1
  fi
  # si ya estaba corriendo (canal de prueba), recarga; si no, arranca
  $NGINX_PANEL -s reload 2>/dev/null || $NGINX_PANEL
  sleep 2

  echo "3) Encendiendo los canales 24/7…"
  for entrada in "${CLIENTES[@]}"; do
    IFS=: read -r user _ rtmp <<< "$entrada"
    api -X POST "$AGENTE/cuentas/$user/24-7" -H 'Content-Type: application/json' \
        -d "{\"encender\":true,\"rtmp\":$rtmp}" -o /tmp/on-$user.json
    echo "   $user → $(head -c 80 /tmp/on-$user.json)"
  done

  echo
  echo "4) Esperando 20s a que generen HLS…"; sleep 20
  echo "✅ Corte hecho. Verifica con: bash /var/www/panelstreaming/scripts/verificar-urls-video.sh"
  echo "   (correlo desde el VPS de audio, o adaptá el dominio a 127.0.0.1 aquí)"
}

revertir() {
  echo "═══ REVERTIR — volver a VDO Panel ═══"
  echo "1) Apagando nuestro motor…"
  for entrada in "${CLIENTES[@]}"; do
    IFS=: read -r user _ _ <<< "$entrada"
    api -X POST "$AGENTE/cuentas/$user/24-7" -H 'Content-Type: application/json' -d '{"encender":false}' >/dev/null 2>&1
  done
  $NGINX_PANEL -s stop 2>/dev/null || true
  sleep 2
  echo "2) Arrancando VDO Panel…"
  systemctl start nginx 2>/dev/null || nginx || true
  sleep 2
  echo "✅ De vuelta en VDO Panel. Verifica que los clientes estén al aire."
}

case "${1:-}" in
  preparar) preparar ;;
  cortar)   cortar ;;
  revertir) revertir ;;
  *) echo "Uso: bash migrar.sh {preparar|cortar|revertir}"; exit 1 ;;
esac
