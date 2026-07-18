# 🚀 Guía de Deploy — Panel Radio junto a AzuraCast

VPS: Hostinger KVM 8 · `76.13.100.162` · usuario `root`
Objetivo: correr el panel Node en `https://server2.streaminghd.co` **sin romper**
AzuraCast que ya funciona en `https://server1.streaminghd.co`.

**Estrategia:** un reverse proxy **Caddy** (HTTPS automático) se vuelve dueño de
los puertos 80/443 y reparte por subdominio. AzuraCast se mueve al puerto interno
**8080**. Los puertos de streaming (8000+) **no se tocan**.

```
Internet
   │
   ▼  :80 / :443
 ┌──────────────── Caddy (host) ────────────────┐
 │  server1.streaminghd.co → localhost:8080      │ → AzuraCast (Docker)
 │  server2.streaminghd.co → localhost:3000      │ → Panel Node (PM2)
 └───────────────────────────────────────────────┘
```

> ⚠️ **Antes de empezar:** verifica que `server2.streaminghd.co` ya apunta al VPS.
> ```bash
> dig +short server2.streaminghd.co
> # debe devolver 76.13.100.162
> ```
> Si no devuelve la IP, espera a que propague el DNS antes de seguir (Caddy
> necesita el DNS correcto para emitir el certificado SSL).

---

## Resumen del orden (importante)

1. Instalar Node + PM2 y dejar el panel corriendo en `:3000` — **no toca AzuraCast**
2. Instalar Caddy y escribir el `Caddyfile`
3. **Mover AzuraCast a 8080** (aquí ocurre el ~1 min de downtime del panel web)
4. Recargar Caddy → toma 80/443 y emite los certificados
5. Verificar ambos dominios

---

## PASO 1 — Node 20 + PM2

```bash
# Node 20 desde NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # debe decir v20.x

# PM2 (mantiene la app viva y la reinicia sola)
sudo npm install -g pm2
```

---

## PASO 2 — Clonar el repo con Deploy Key (SSH, sin tokens)

```bash
# 1) Generar una llave SOLO para este servidor
ssh-keygen -t ed25519 -C "vps-panelstreaming" -f ~/.ssh/panelstreaming -N ""

# 2) Mostrar la llave PÚBLICA
cat ~/.ssh/panelstreaming.pub
```

Copia esa línea y pégala en GitHub:
**repo → Settings → Deploy keys → Add deploy key** (título "vps", deja
*Allow write access* DESMARCADO — solo lectura).

```bash
# 3) Decirle a git que use esa llave para GitHub
cat >> ~/.ssh/config <<'EOF'
Host github-panel
    HostName github.com
    User git
    IdentityFile ~/.ssh/panelstreaming
    IdentitiesOnly yes
EOF

# 4) Clonar
sudo mkdir -p /var/www && sudo chown $USER:$USER /var/www
cd /var/www
git clone git@github-panel:duverzu/panelstreaming.git
cd panelstreaming
npm install --omit=dev
```

---

## PASO 3 — Crear el `.env` de producción

El `.env` **NO viaja por git** (así debe ser). Créalo a mano en el servidor:

```bash
cd /var/www/panelstreaming
cp .env.example .env
nano .env
```

Déjalo así (⚠️ pon la API key REAL y genera secrets nuevos):

```env
PORT=3000
NODE_ENV=production

# Dominio del panel (para CORS)
CORS_ORIGIN=https://server2.streaminghd.co

# Genera cada secret con:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_ADMIN_SECRET=pega_aqui_un_secret_largo_aleatorio
JWT_CLIENTE_SECRET=pega_aqui_OTRO_secret_largo_aleatorio
JWT_EXPIRES_IN=8h

AZURACAST_BASE_URL=https://server1.streaminghd.co
AZURACAST_API_KEY=tu_api_key_real_de_azuracast

DATABASE_URL=postgresql://usuario:password@localhost:5432/panel_radio
```

Arranca el panel con PM2:

```bash
cd /var/www/panelstreaming
pm2 start server.js --name panel-radio
pm2 save
pm2 startup   # ejecuta el comando que te imprima (para que arranque solo al reiniciar el VPS)

# Verifica que responde localmente (aún sin dominio):
curl -s http://localhost:3000/    # debe devolver el JSON de healthcheck
```

---

## PASO 4 — Instalar Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

> Al instalarse, Caddy intentará usar 80/443 y **fallará** porque AzuraCast los
> tiene todavía. **Es normal**, lo arreglamos en el paso 6.

Escribe el `Caddyfile`:

```bash
sudo nano /etc/caddy/Caddyfile
```

Contenido completo (borra lo que traiga por defecto):

```caddyfile
server1.streaminghd.co {
    reverse_proxy localhost:8080
}

server2.streaminghd.co {
    reverse_proxy localhost:3000
}
```

Valida la sintaxis:

```bash
caddy validate --config /etc/caddy/Caddyfile
```

---

## PASO 5 — Backup de AzuraCast (¡NO te saltes esto!)

```bash
cd /var/azuracast
cp .env .env.backup-$(date +%F)
ls -la .env.backup-*   # confirma que se creó
```

---

## PASO 6 — Mover AzuraCast al puerto 8080  ⏱️ (aquí el ~1 min de downtime)

```bash
cd /var/azuracast
nano .env
```

Busca estas dos líneas (están comentadas) y déjalas así — **descomenta y cambia**:

```env
AZURACAST_HTTP_PORT=8080
AZURACAST_HTTPS_PORT=8443
```

Recrea los contenedores para aplicar los nuevos puertos:

```bash
cd /var/azuracast
docker compose down
docker compose up -d
```

Comprueba que AzuraCast quedó en 8080 y liberó 80/443:

```bash
curl -sI http://localhost:8080 | head -1     # debe responder (301/200)
sudo ss -tlnp | grep -E ':80 |:443 '         # ya NO debe aparecer docker-proxy en 80/443
```

---

## PASO 7 — Encender Caddy (toma 80/443 y emite certificados)

```bash
sudo systemctl restart caddy
sudo systemctl status caddy --no-pager     # debe decir "active (running)"

# Ver cómo emite los certificados en vivo:
sudo journalctl -u caddy -f
# (espera a ver "certificate obtained successfully" para ambos dominios, luego Ctrl+C)
```

---

## PASO 8 — Verificar todo ✅

```bash
# AzuraCast por su dominio (a través de Caddy)
curl -sI https://server1.streaminghd.co | head -1

# Panel Node por su dominio
curl -s https://server2.streaminghd.co/    # JSON de healthcheck

# Login de prueba del panel
curl -s -X POST https://server2.streaminghd.co/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@panel.com","password":"123456"}'
```

Abre en el navegador:
- `https://server1.streaminghd.co` → AzuraCast (candado verde 🔒)
- `https://server2.streaminghd.co` → Panel Node (candado verde 🔒)

> En AzuraCast, entra a **System Settings** y confirma que el "Base URL" siga
> siendo `https://server1.streaminghd.co`. AzuraCast respeta los headers de
> proxy que Caddy envía, así que los enlaces y el reproductor público seguirán
> funcionando con HTTPS.

---

## 🔄 Plan de reversa (si algo sale mal)

Si el panel de AzuraCast deja de cargar y quieres volver TODO como estaba:

```bash
# 1) Apagar Caddy para soltar 80/443
sudo systemctl stop caddy

# 2) Restaurar el .env original de AzuraCast
cd /var/azuracast
cp .env.backup-$(date +%F) .env     # (usa el nombre exacto del backup)

# 3) Recrear AzuraCast en 80/443
docker compose down
docker compose up -d
```

En ~1 min AzuraCast vuelve a estar como al inicio. El streaming (puertos 8000+)
nunca se ve afectado por estos cambios.

---

## 🔁 Actualizaciones futuras del panel

Cada vez que hagas cambios y los subas a GitHub:

```bash
cd /var/www/panelstreaming
git pull
npm install --omit=dev
pm2 restart panel-radio
```

---

## Notas

- **PostgreSQL:** aún no hace falta. El panel arranca con datos mock en memoria.
  Cuando conectemos Postgres real, se instala y se ajusta `DATABASE_URL`.
- **Firewall:** los puertos 80/443 ya estaban abiertos (AzuraCast los usaba), así
  que Caddy funciona sin tocar el firewall. Si usas `ufw`, confirma:
  `sudo ufw status` → 80 y 443 permitidos.
- **Seguridad:** cambia el token de GitHub que usaste antes y nunca lo pongas en
  la URL del `git clone` (por eso usamos deploy key SSH).
```
