# 🚚 Guía de Migración — mover el panel a otro servidor

El panel es **muy portátil** porque solo depende de 3 cosas:
1. **Código** → está en git
2. **Base de datos** → un dump de PostgreSQL
3. **Config** → el archivo `.env`

Y habla con AzuraCast **solo por API** (`AZURACAST_BASE_URL`), así que el panel y
AzuraCast se mueven por separado.

---

## Opción A — Con Docker (recomendada, 1 comando)

En el **servidor nuevo** (con Docker instalado):

```bash
# 1. Traer el código
git clone git@github.com:duverzu/panelstreaming.git
cd panelstreaming

# 2. Crear el .env (copiar del viejo o de .env.example)
cp .env.example .env
nano .env         # pon: JWT secrets, AZURACAST_BASE_URL, AZURACAST_API_KEY, DB_PASSWORD

# 3. Levantar panel + base de datos
docker compose up -d --build

# 4. (solo la primera vez) usuarios demo
docker compose exec panel npm run seed
```

El panel queda en `http://SERVIDOR:3000`. Pon Caddy/nginx delante apuntando a `localhost:3000`
(igual que en la instalación actual).

### Restaurar los datos existentes
```bash
# En el server VIEJO: exportar la BD
pg_dump "$DATABASE_URL" > panel_backup.sql        # instalación clásica
# o si el viejo también es docker:
docker compose exec -T db pg_dump -U panel_radio panel_radio > panel_backup.sql

# Copiar panel_backup.sql al server nuevo y restaurar:
cat panel_backup.sql | docker compose exec -T db psql -U panel_radio -d panel_radio
```

---

## Opción B — Clásica (Node + PM2 + Postgres nativo)

En el servidor nuevo (ver también `DEPLOY.md`):

```bash
# 1. Node 20 + PM2 + PostgreSQL (ver DEPLOY.md pasos 1 y VPS-1/2)
# 2. Clonar y preparar
git clone git@github.com:duverzu/panelstreaming.git
cd panelstreaming
npm install --omit=dev
cp .env.example .env && nano .env      # config + DATABASE_URL real

# 3. Restaurar la BD
psql "$DATABASE_URL" < panel_backup.sql   # (dump traído del server viejo)
#   o si es BD nueva:  npm run migrate && npm run seed

# 4. Compilar frontend y arrancar
cd frontend && npm install && npm run build && cd ..
pm2 start server.js --name panel-radio && pm2 save
```

---

## Mover también AzuraCast (opcional)

Si mueves AzuraCast a otro servidor dedicado:

1. En el server viejo: `cd /var/azuracast && ./docker.sh backup` → genera un backup.
2. Instala AzuraCast en el server nuevo y restaura ese backup (`./docker.sh restore`).
3. En el **panel**, cambia **UNA línea** del `.env`:
   ```
   AZURACAST_BASE_URL=https://nuevo-servidor-azuracast...
   AZURACAST_API_KEY=nueva_api_key
   ```
4. Reinicia el panel. **Cero cambios de código.**

---

## Checklist de migración

- [ ] Backup de PostgreSQL del panel (`pg_dump`)
- [ ] Backup de la carpeta `biblioteca/` (los MP3 no van en git)
- [ ] Copiar el `.env` (o recrearlo con los mismos secrets JWT — si cambian, se cierran las sesiones)
- [ ] Restaurar la BD en el server nuevo
- [ ] Ajustar DNS (`server2.streaminghd.co` → nueva IP)
- [ ] Verificar `AZURACAST_BASE_URL` / API key
- [ ] Caddy/nginx apuntando a `localhost:3000` + SSL

---

## Backups automáticos (recomendado)

Un cron diario que respalda la BD:

```bash
# crontab -e
0 3 * * * pg_dump "postgresql://panel_radio:PASS@localhost:5432/panel_radio" > /root/backups/panel-$(date +\%F).sql
```

> Guarda también la carpeta `biblioteca/`. Todo lo demás (estaciones, música de
> clientes, playlists) vive en AzuraCast, que tiene su propio backup nativo.

---

## Escalar (overselling a gran escala)

Cuando un solo AzuraCast no dé abasto, la ruta correcta es **agregar servidores
AzuraCast** y que el panel reparta las radios entre ellos (tabla `servidores` con
URL+API key de cada uno). Así creces sin migrar nada: solo enchufas otro nodo.
Es una mejora futura del panel, no un cambio de infraestructura.
