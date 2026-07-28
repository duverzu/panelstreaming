# Migración Centova → Panel propio (guía de operador)

Objetivo: mover radios de un servidor Centova a **nuestro panel/AzuraCast** en un
**dedicado nuevo**, **sin que el cliente cambie su URL** de escucha.

La URL real del oyente es:

    http://<dominio>:<PUERTO>/<MOUNT>      ej.  http://radiohd4.streaminghd.co:8163/stream

Se preserva porque: (a) el **dominio** lo movemos por DNS, y (b) el **servidor
nuevo** sirve el **mismo puerto y mount**. Esa única URL sirve tanto el AutoDJ
como el DJ en vivo (así funciona Icecast).

> ⚠️ Todo esto se corre contra el **servidor NUEVO**. No toca producción hasta
> el paso del DNS. Las radios viejas siguen sonando hasta el flip.

---

## Pieza del kit
| Archivo | Qué hace |
|---|---|
| `scripts/exportar-centova.js` | CSV de Centova → `manifest.json` (normaliza y valida) |
| `scripts/importar-manifest.js` | Empuja el manifest al panel (crea las estaciones en lote) |
| `scripts/bajar-musica-centova.js` | Descarga la música del AutoDJ por FTP |
| Endpoint `POST /admin/migracion/importar` | Crea cada estación preservando puerto/mount/clave |

---

## Paso a paso

### 0) Preparar el dedicado nuevo
1. Instalar **AzuraCast** en el dedicado (Ubuntu).
2. En el panel → **Servidores** → agregar el nuevo servidor de audio (URL de su
   API + API key). Anota su **id** (lo pide el importador como `SERVIDOR_ID`).

### 1) Armar el manifest (los datos de las 68 radios)
Del panel de Centova saca por cada radio: `usuario, titulo, puerto, oyentes,
bitrate`. El **mount** casi siempre es `/stream` (confírmalo en "Enlaces
rápidos"). El **source_password** está en cada cuenta → Configuración → Stream
settings.

Arma un CSV `centova-export.csv` con encabezado EXACTO:

    usuario,titulo,puerto,mount,source_password,max_oyentes,bitrate,email
    agropalmira,Club de Artistas Stream,8163,/stream,claveSource,500,128,dueno@correo.com

Normalízalo:

    node scripts/exportar-centova.js centova-export.csv manifest.json

> Si no consigues el `source_password` de alguna, déjalo vacío: esa radio
> tendrá que actualizar **solo** ese dato en su encoder (los oyentes no se
> enteran). La URL de escucha se preserva igual.

### 2) Probar con 1–2 radios PRIMERO
Edita `manifest.json` y deja solo 1–2 cuentas. Impórtalas:

    PANEL_URL=https://server2.streaminghd.co \
    ADMIN_TOKEN=<token admin> \
    SERVIDOR_ID=<id del servidor nuevo> \
    node scripts/importar-manifest.js manifest.json

Verifica que la radio quede creada, con su puerto/mount, y suene.
`ADMIN_TOKEN`: entra al panel como admin y copia el token de sesión (o usa el
login por API `/api/admin/login`).

### 3) Mover la música (si usan AutoDJ)
Por cada cuenta con música:

    npm install basic-ftp   # una sola vez
    FTP_HOST=radiohd4.streaminghd.co FTP_USER=agropalmira FTP_PASS=<clave admin cuenta> \
    node scripts/bajar-musica-centova.js

Queda en `./musica/<usuario>/`. Súbela a la estación en AzuraCast por su **SFTP**
o el gestor de medios. (Las radios de puro DJ en vivo no necesitan esto.)

### 4) Importar TODAS
Con las pruebas OK, corre el manifest completo (el importador **salta** las que
ya existan, así que puedes reintentar sin duplicar):

    ... node scripts/importar-manifest.js manifest.json

### 5) El flip de DNS (el corte, minutos)
1. **Un día antes:** baja el TTL del dominio (`radiohd4.streaminghd.co`) a 300s.
2. Confirma que en el dedicado nuevo cada radio suena en su puerto/mount.
3. **Repunta el DNS** del dominio → IP del dedicado nuevo.
4. Los reproductores de los oyentes se reconectan solos (segundos).
5. Deja el Centova viejo unos días por si acaso; luego se da de baja (y se deja
   de pagar la licencia 🎉).

---

## Notas de operador
- **Idempotente:** reimportar no duplica; salta usuarios existentes.
- **Puertos:** deben ser los mismos de Centova (8000–8205). En el dedicado nuevo
  no deben chocar con otros servicios.
- **Revendedores:** las cuentas bajo un revendedor de Centova (ej. *Airesstereo*)
  se pueden crear como cliente del revendedor equivalente (`reseller_id`).
- **Qué NO se migra automático:** estadísticas históricas de Centova (arrancan
  de cero en el panel nuevo).
- **Rollback:** mientras no se toque el DNS, el viejo sigue sirviendo. El flip es
  lo único irreversible-ish (y se revierte volviendo a apuntar el DNS al viejo).
