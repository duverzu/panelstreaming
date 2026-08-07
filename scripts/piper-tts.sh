#!/usr/bin/env bash
# piper-tts.sh — voz neural offline para el "da la hora" (mejor que Google).
# El panel lo llama así:  piper-tts.sh "el texto"   → devuelve un MP3 por stdout.
#
# INSTALAR (una vez, en el VPS del panel):
#   1) Piper:   https://github.com/rhasspy/piper/releases  (descarga el binario Linux)
#      o vía pip:  pip install piper-tts
#   2) Un modelo de voz en español (.onnx + .onnx.json), ej:
#      es_ES-sharvard-medium  o  es_MX-ald-medium
#      https://huggingface.co/rhasspy/piper-voices/tree/main/es
#   3) ffmpeg (para pasar el WAV de Piper a MP3):  apt install -y ffmpeg
#   4) En el .env del panel:
#      ANUNCIO_TTS_CMD=/var/www/panelstreaming/scripts/piper-tts.sh
#      PIPER_BIN=/ruta/a/piper           (o solo 'piper' si está en el PATH)
#      PIPER_VOICE=/ruta/a/es_ES-sharvard-medium.onnx
#   5) chmod +x scripts/piper-tts.sh  y  pm2 restart panel-radio
set -euo pipefail

PIPER="${PIPER_BIN:-piper}"
VOICE="${PIPER_VOICE:-}"
TEXTO="${1:-}"

if [ -z "$VOICE" ] || [ -z "$TEXTO" ]; then
  echo "piper-tts: falta PIPER_VOICE o el texto" >&2
  exit 1
fi

# Piper genera WAV a stdout; ffmpeg lo convierte a MP3 (también a stdout).
printf '%s' "$TEXTO" \
  | "$PIPER" --model "$VOICE" --output_file - 2>/dev/null \
  | ffmpeg -hide_banner -loglevel error -i - -codec:a libmp3lame -qscale:a 4 -f mp3 - 2>/dev/null
