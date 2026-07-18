# 🎵 Biblioteca de música de cortesía

Coloca aquí archivos **.mp3 libres de derechos** (CC0 / dominio público / licencia comercial).
Al crear una radio nueva, estos tracks se copian automáticamente a su estación en una
playlist llamada **"Biblioteca"**, para que suene de inmediato.

## ⚠️ Importante — solo música legal

- ✅ **CC0 / dominio público** (sin obligaciones) — lo más seguro
- ✅ **Licencia comercial** (ej. Jamendo Licensing)
- ⚠️ **CC-BY** requiere dar crédito al autor
- ❌ **NO** uses música de "no copyright" de YouTube ni comercial sin licencia

## Fuentes recomendadas (descarga en el VPS, que sí tiene internet)

- **Pixabay Music** — https://pixabay.com/music/ (licencia tipo CC0, sin atribución)
- **Chosic** — https://www.chosic.com/free-music/all/ (CC0 y CC)
- **Musopen** — https://musopen.org (clásica, dominio público)
- **Free Music Archive** — https://freemusicarchive.org (revisa la licencia de cada track)

## Cómo poblarla en el VPS

```bash
cd /var/www/panelstreaming/biblioteca
# sube tus 10 mp3 aquí (scp, wget, o el descargador de tu preferencia)
ls *.mp3   # verifica que estén
```

Luego, para radios que ya existen, usa el botón **"Música de cortesía"** en el panel admin
(en la fila del cliente), o al crear una radio nueva se copia sola.

> Los .mp3 NO se suben a git (están en .gitignore). Viven solo en el servidor.
