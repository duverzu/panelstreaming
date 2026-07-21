#!/usr/bin/env bash
#
# revisar-codecs.sh — ¿se pueden emitir estos videos sin recodificar?
#
# La emisión 24/7 usa `-c copy` (copia los bytes, no recodifica) para no
# gastar CPU. Eso EXIGE que todos los videos de una cuenta compartan el
# mismo códec de video, de audio, resolución y fps. Si uno difiere, la
# emisión se corta al llegar a él.
#
# Este script agrupa los videos por "firma técnica". Si todos caen en el
# mismo grupo, se migra directo. Si hay varios grupos, hay que normalizar
# (recodificar una vez al mismo formato) antes de migrar.
#
#   bash revisar-codecs.sh /home/santander/uploads
#
set -u
DIR="${1:-.}"
command -v ffprobe >/dev/null || { echo "❌ ffprobe no está instalado (apt install ffmpeg)"; exit 1; }

declare -A GRUPOS
total=0

while IFS= read -r -d '' f; do
  # Firma: códec de video, resolución, fps, códec de audio, sample rate
  firma=$(ffprobe -v error -select_streams v:0 \
      -show_entries stream=codec_name,width,height,r_frame_rate \
      -of csv=p=0 "$f" 2>/dev/null | tr -d ' ')
  audio=$(ffprobe -v error -select_streams a:0 \
      -show_entries stream=codec_name,sample_rate \
      -of csv=p=0 "$f" 2>/dev/null | tr -d ' ')
  clave="v=${firma:-sin-video} a=${audio:-sin-audio}"
  GRUPOS["$clave"]=$(( ${GRUPOS["$clave"]:-0} + 1 ))
  total=$((total + 1))
done < <(find "$DIR" -maxdepth 1 -type f \( -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.mov' -o -iname '*.flv' -o -iname '*.webm' \) -print0)

echo "═══ $DIR ═══"
echo "Videos encontrados: $total"
echo
echo "Firmas técnicas (códec-video ancho,alto,fps | códec-audio,hz):"
i=0
for clave in "${!GRUPOS[@]}"; do
  i=$((i + 1))
  echo "   [$i] ${GRUPOS[$clave]} video(s)  →  $clave"
done

echo
if [ "$total" -eq 0 ]; then
  echo "⚠️  No hay videos en esta carpeta."
elif [ "${#GRUPOS[@]}" -eq 1 ]; then
  echo "✅ Todos comparten firma: se pueden emitir con -c copy SIN normalizar."
else
  echo "⚠️  Hay ${#GRUPOS[@]} firmas distintas: la emisión 24/7 se cortaría entre videos."
  echo "   Hay que normalizarlos (recodificar una vez al mismo formato) antes de migrar."
fi
