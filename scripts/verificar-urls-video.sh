#!/usr/bin/env bash
#
# verificar-urls-video.sh — el contrato de URLs del nodo de video.
#
# Estas son las direcciones que los clientes YA tienen puestas en sus webs,
# apps y reproductores. Si alguna deja de responder 200, se les rompe el
# servicio. Este script se corre ANTES y DESPUÉS de cualquier cambio en el
# servidor de video: si el resultado es idéntico, el cambio fue invisible.
#
#   bash scripts/verificar-urls-video.sh
#
# Capturado el 2026-07-21 contra VDO Panel 1.6.4, que es la referencia a
# igualar cuando se reemplace por el motor propio.

DOMINIO="${DOMINIO:-video.streaminghd.co}"

# cuenta:puerto:emite   — `emite` = si la cuenta tiene emisión 24/7 activa.
# Una cuenta vacía (sin videos ni WebTV) responde 404 y eso es lo correcto:
# lo que importa es que DESPUÉS de migrar responda igual que ANTES.
CUENTAS=(
  "santander:3129:si"
  "trenradi:3718:si"
  "sensaciontv:3953:no"    # cuenta vacía: hoy no emite nada
)

fallos=0
echo "═══ Contrato de URLs · $DOMINIO ═══"
for entrada in "${CUENTAS[@]}"; do
  echo
  emite="${entrada##*:}"
  cuenta="${entrada%%:*}"; puerto=$(echo "$entrada" | cut -d: -f2)

  # Si la cuenta emite 24/7, sus rutas deben dar 200. Si no emite, dan 404.
  if [ "$emite" = "si" ]; then
    RUTAS=(
      "stream/play.m3u8:200:Emisión 24/7 (WebTV)"
      "hybrid/play.m3u8:200:Híbrido (vivo + WebTV)"
      "live/play.m3u8:404:En vivo — 404 si nadie transmite ahora"
    )
  else
    RUTAS=(
      "stream/play.m3u8:404:Cuenta sin emisión — 404 esperado"
      "hybrid/play.m3u8:404:Cuenta sin emisión — 404 esperado"
      "live/play.m3u8:404:En vivo — 404 si nadie transmite ahora"
    )
  fi

  echo "── $cuenta (puerto $puerto)"
  for r in "${RUTAS[@]}"; do
    ruta="${r%%:*}"; resto="${r#*:}"; esperado="${resto%%:*}"; nota="${resto#*:}"
    url="https://$DOMINIO:$puerto/$ruta"
    codigo=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 8 "$url")

    if [ "$codigo" = "$esperado" ]; then
      estado="✅"
    elif [ "$codigo" = "200" ] && [ "$esperado" = "404" ]; then
      estado="✅"   # está transmitiendo en vivo: mejor que lo esperado
    else
      estado="❌"; fallos=$((fallos + 1))
    fi
    printf "   %s %-18s → %s (esperado %s)  %s\n" "$estado" "$ruta" "$codigo" "$esperado" "$nota"
  done
done

echo
if [ "$fallos" -eq 0 ]; then
  echo "✅ Todas las URLs responden como en la referencia."
else
  echo "❌ $fallos URL(s) fuera de contrato: los clientes verían el servicio caído."
  exit 1
fi
