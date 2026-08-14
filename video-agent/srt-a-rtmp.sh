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

# Solo se puentea lo que entra POR SRT. Desde que existe la salida SRT, este
# mismo gancho salta tambien cuando es nuestro propio extractor el que publica
# aqui -- y puentear eso devolveria a nginx la señal que acaba de salir de
# nginx: un bucle que ademas pelearia con el publicador de verdad.
# Se descarta por lo que NO debe puentearse, no por lo que si: el unico caso a
# excluir es nuestro propio extractor, que publica aqui por RTSP. Al reves --
# exigir el nombre exacto del tipo SRT -- una version de MediaMTX que lo
# renombrara dejaria al cliente sin poder emitir, y sin pista de por que.
case "$MTX_SOURCE_TYPE" in
  *rtsp*|*RTSP*)
    # Dormir en vez de salir: MediaMTX relanza este gancho cada vez que
    # termina mientras el canal siga disponible, asi que salir aqui deja un
    # arranque cada 5 s llenando el log. Al irse el canal, MediaMTX lo mata.
    echo "[srt] $USUARIO: la fuente es nuestro propio extractor, no se puentea"
    exec sleep infinity ;;
esac

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
