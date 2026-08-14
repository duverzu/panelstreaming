#!/bin/sh
# Salida SRT: saca la señal de nginx y la mete en MediaMTX para que un tercero
# se la lleve por SRT. Es lo que enganchan los CABLE OPERADORES.
#
# Lo lanza MediaMTX (runOnDemand) cuando alguien PIDE el canal y no hay nadie
# publicandolo ahi. Bajo demanda a proposito: si no hay operador conectado no
# se gasta ni un ffmpeg.
#
# Se lee de `asilivehls`, que es donde nginx concentra todo lo que entra --
# venga del RTMP del cliente, del 24/7 o del puente SRT. Asi la salida funciona
# igual sin importar como suba su señal.
#
# -c copy = sin recodificar.
USUARIO="$1"
[ -z "$USUARIO" ] && exit 1

echo "[srt-salida] $USUARIO: sacando la señal para quien la pide"
exec ffmpeg -hide_banner -loglevel warning \
  -i "rtmp://127.0.0.1:1935/asilivehls/$USUARIO" \
  -c copy -f rtsp -rtsp_transport tcp "rtsp://127.0.0.1:8554/$USUARIO"
