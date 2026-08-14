#!/bin/sh
# Puente SRT -> RTMP. Lo lanza MediaMTX cuando un canal empieza a emitir.
#
# Reenvia el flujo a `application live` de nginx-rtmp EXACTAMENTE como si el
# cliente hubiera publicado por RTMP: asi se dispara el on_publish de siempre y
# funcionan solos el token, la pausa del 24/7 y el aviso al panel. Cero logica
# nueva aguas abajo.
#
# -c copy = copia el flujo sin recodificar. El coste en CPU es despreciable;
# transcodificar aqui multiplicaria por cien el consumo y no aporta nada.
USUARIO="$1"
[ -z "$USUARIO" ] && exit 1

# El token lo guarda el agente (compat-tokens.json); se pide por localhost.
TOKEN=$(curl -s --max-time 5 "http://127.0.0.1:3000/srt/token?user=$USUARIO")
if [ -z "$TOKEN" ]; then
  echo "[srt] sin token para $USUARIO: no se puentea" >&2
  exit 1
fi

echo "[srt] $USUARIO: puenteando SRT -> rtmp://127.0.0.1:1935/live/$USUARIO"
exec ffmpeg -hide_banner -loglevel warning \
  -rtsp_transport tcp -i "rtsp://127.0.0.1:8554/$USUARIO" \
  -c copy -f flv "rtmp://127.0.0.1:1935/live/$USUARIO?token=$TOKEN"
