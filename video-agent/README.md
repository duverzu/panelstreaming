# Agente de video

Corre **en el VPS de video** y le reporta al panel qué hay ahí: cuentas, videos,
espacio y consumo. El panel nunca entra por SSH: le pregunta a este agente por HTTP.

## Fase A — solo lectura

Esta versión **no escribe nada**: no crea cuentas, no borra archivos, no toca la
configuración de nginx. Se puede instalar con VDO Panel funcionando sin riesgo.

## Instalación

```bash
# 1) Node (si no está)
node -v || (curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs)

# 2) Traer el código
sudo mkdir -p /opt/video-agent && cd /opt/video-agent
# copiar aquí video-agent/ del repo (git clone o scp)

npm install --omit=dev   # sin --silent: si algo falla, hay que verlo

# 3) Configurar
cp .env.example .env
openssl rand -hex 24        # copia el resultado a AGENT_TOKEN del .env
nano .env

# 4) Probar a mano
node server.js
# En otra terminal:
curl localhost:3000/health
```

## Dejarlo corriendo

```bash
sudo npm install -g pm2
pm2 start server.js --name video-agent
pm2 save && pm2 startup
```

## Cerrar el puerto al mundo

El agente solo debe hablar con el panel. **Es importante**: aunque pide token,
no tiene por qué estar expuesto a internet.

```bash
sudo ufw allow from IP_DEL_PANEL to any port 3000 proto tcp
sudo ufw deny 3000
```

## Endpoints

Todos piden `Authorization: Bearer <AGENT_TOKEN>` salvo `/health`.

| Método | Ruta | Qué devuelve |
|---|---|---|
| GET | `/health` | Que el agente vive |
| GET | `/cuentas` | Cuentas del nodo: espacio, nº de videos, puertos, si están al aire |
| GET | `/cuentas/:user` | Detalle con la lista de videos |
| GET | `/cuentas/:user/consumo?dias=30` | Bytes servidos por día |

## Cómo averigua las cosas

- **Cuentas**: carpetas de `/home` que tengan `uploads/` (las de `IGNORAR` se saltan).
- **Puertos**: los lee de `/etc/nginx/conf.d/<user>-http.http` y `<user>-rtmp.conf`.
- **Al aire**: si hay un `.m3u8` modificado hace menos de un minuto. HLS reescribe
  la lista con cada fragmento, así que un archivo "fresco" significa emisión en curso.
- **Consumo**: parsea `/home/<user>/logs/access.log` (formato combinado de nginx) y
  suma el tamaño de las respuestas por día.

## Lo que NO hace (a propósito)

Nada de escritura. Crear cuentas, subir y borrar videos vienen en fases siguientes,
cuando la lectura esté validada contra el sistema real.
