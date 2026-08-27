#!/bin/sh
# Salida SRT: saca la señal de nginx y la mete en MediaMTX para que un tercero
# se la lleve. Es lo que enganchan los CABLE OPERADORES.
#
# Lo lanza MediaMTX (runOnDemand) cuando alguien PIDE el canal.
#
# POR QUE SE VIGILA SOLO: al publicar aqui, este proceso convierte la ruta "bajo
# demanda" en una ruta con publicador permanente, y entonces MediaMTX ya no la
# cierra al irse el ultimo lector. Sin esto, el extractor se queda tirando del
# canal para NADIE -- se encontraron dos corriendo 28 y 3 horas sin un solo
# lector. Asi que cierra el mismo cuando ya no hay a quien servir.
USUARIO="$1"
[ -z "$USUARIO" ] && exit 1

API=http://127.0.0.1:9997/v3/paths/get
ESPERA=15          # cada cuanto se comprueba
VACIAS=3           # comprobaciones seguidas sin lectores antes de cerrar
CANDADO="/tmp/srt-salida-$USUARIO.pid"

# Un solo extractor por canal. MediaMTX puede pedirlo de nuevo mientras el
# anterior sigue vivo, y dos tirando del mismo canal es el doble de todo.
if [ -f "$CANDADO" ] && kill -0 "$(cat "$CANDADO" 2>/dev/null)" 2>/dev/null; then
  echo "[srt-salida] $USUARIO: ya hay un extractor vivo, no se abre otro"
  exit 0
fi

echo "[srt-salida] $USUARIO: sacando la señal para quien la pide"
ffmpeg -hide_banner -loglevel warning -nostdin \
  -i "rtmp://127.0.0.1:1935/asilivehls/$USUARIO" \
  -c copy -f rtsp -rtsp_transport tcp "rtsp://127.0.0.1:8554/$USUARIO" &
FF=$!
echo "$FF" > "$CANDADO"
# Si MediaMTX nos corta, nos llevamos el ffmpeg por delante.
trap 'kill "$FF" 2>/dev/null; rm -f "$CANDADO"; exit 0' TERM INT

sin=0
while kill -0 "$FF" 2>/dev/null; do
  sleep "$ESPERA"
  n=$(curl -s --max-time 5 "$API/$USUARIO" | tr ',' '\n' | grep -c '"id"')
  # La API cuenta tambien al publicador, que somos nosotros: se descuenta.
  [ "$n" -gt 0 ] && n=$((n - 1))
  if [ "$n" -le 0 ]; then
    sin=$((sin + 1))
    if [ "$sin" -ge "$VACIAS" ]; then
      echo "[srt-salida] $USUARIO: nadie lo esta leyendo, se cierra"
      kill "$FF" 2>/dev/null
      break
    fi
  else
    sin=0
  fi
done
rm -f "$CANDADO"
