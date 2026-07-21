-- ==================================================================
--  schema.sql — Estructura de la base de datos del Panel Radio
--  Ejecutar con:  npm run migrate   (o psql < schema.sql)
--  Es idempotente: se puede correr varias veces sin romper nada.
-- ==================================================================

-- Usuarios (admin, revendedores y clientes comparten esta tabla, se distinguen por role)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Permitir el rol 'reseller' (actualiza el CHECK en BD existentes)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'cliente', 'reseller'));

-- Login por USUARIO (no por email): un mismo correo puede tener varias radios.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);
UPDATE users SET username = email WHERE username IS NULL;          -- backfill de cuentas viejas
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;       -- el email ya NO es único
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users(username);

-- Revendedores (mayoristas): crean sus propias radios hasta un cupo.
CREATE TABLE IF NOT EXISTS resellers (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nombre_empresa VARCHAR(255) NOT NULL,
  cupo_radios    INTEGER NOT NULL DEFAULT 5,
  activo         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Límites agregados de la cuenta del revendedor (suma de todas sus radios)
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS max_oyentes_total INTEGER NOT NULL DEFAULT 500;
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS espacio_total_mb  INTEGER NOT NULL DEFAULT 10240;

-- Planes / plantillas de radio (definidos por el super admin).
-- Los límites se aplican en AzuraCast al crear la estación del cliente.
CREATE TABLE IF NOT EXISTS planes (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(80)   NOT NULL,
  precio_mensual  NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_bitrate     INTEGER       NOT NULL DEFAULT 128,   -- kbps (0 = ilimitado)
  max_oyentes     INTEGER       NOT NULL DEFAULT 100,
  espacio_mb      INTEGER       NOT NULL DEFAULT 1024,  -- cuota AutoDJ en MB
  max_mounts      INTEGER       NOT NULL DEFAULT 1,
  permite_dj      BOOLEAN       NOT NULL DEFAULT true,  -- DJ en vivo (streamers)
  activo          BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Tipo de servicio del plan: decide si la cuenta es de radio o de video, y
-- por lo tanto en qué servidor se crea y qué ve el cliente en su panel.
ALTER TABLE planes ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) NOT NULL DEFAULT 'audio';

-- Planes de REVENDEDOR (paquetes de mayorista: cuánto puede vender).
-- Son distintos a `planes`: aquellos son plantillas de UNA radio; estos son
-- el cupo total de la cuenta del revendedor. Se venden como un servicio más.
CREATE TABLE IF NOT EXISTS planes_reseller (
  id                SERIAL PRIMARY KEY,
  nombre            VARCHAR(80) NOT NULL,
  cupo_radios       INTEGER     NOT NULL DEFAULT 5,      -- cuántas radios puede crear
  max_oyentes_total INTEGER     NOT NULL DEFAULT 500,    -- oyentes sumando todas sus radios
  espacio_total_mb  INTEGER     NOT NULL DEFAULT 10240,  -- almacenamiento total
  activo            BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plan contratado por el revendedor (nombre del plan; NULL = límites a medida)
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS plan VARCHAR(80);

-- Servidores AzuraCast (multi-servidor). Cada radio vive en uno.
CREATE TABLE IF NOT EXISTS servidores (
  id               SERIAL PRIMARY KEY,
  nombre           VARCHAR(120) NOT NULL,
  url              VARCHAR(255) NOT NULL,
  api_key          VARCHAR(255) NOT NULL,
  capacidad_radios INTEGER NOT NULL DEFAULT 100,
  activo           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tipo de servicio del servidor: 'audio' (radio) o 'video'.
-- Por defecto 'audio' para que todo lo que ya existe siga igual.
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) NOT NULL DEFAULT 'audio';

-- URL PÚBLICA del servidor: la que ven los clientes (escucha y DJ).
-- `url` es la de administración (la API de AzuraCast); `url_publica` es un
-- dominio de marca blanca que solo expone /listen y /public. Si está vacía se
-- usa `url`, así las instalaciones viejas siguen funcionando igual.
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS url_publica VARCHAR(255);

-- Tope de banda mensual del servidor (GB). 0 = sin tope definido.
ALTER TABLE servidores ADD COLUMN IF NOT EXISTS banda_mensual_gb INTEGER NOT NULL DEFAULT 0;

-- Consumo de banda por servidor y día (lo llena el Guardián de Banda).
CREATE TABLE IF NOT EXISTS consumo_banda (
  servidor_id INTEGER NOT NULL REFERENCES servidores(id) ON DELETE CASCADE,
  fecha       DATE    NOT NULL,
  bytes       BIGINT  NOT NULL DEFAULT 0,
  PRIMARY KEY (servidor_id, fecha)
);

-- Llaves de API para integraciones externas (facturación tipo WHMCS).
CREATE TABLE IF NOT EXISTS api_keys (
  id         SERIAL PRIMARY KEY,
  nombre     VARCHAR(120) NOT NULL,
  token      VARCHAR(80)  NOT NULL UNIQUE,
  activo     BOOLEAN      NOT NULL DEFAULT true,
  ultimo_uso TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Documentación / centro de ayuda (artículos que edita el admin).
CREATE TABLE IF NOT EXISTS documentacion (
  id         SERIAL PRIMARY KEY,
  titulo     VARCHAR(200) NOT NULL,
  categoria  VARCHAR(80)  NOT NULL DEFAULT 'General',
  contenido  TEXT         NOT NULL DEFAULT '',
  orden      INTEGER      NOT NULL DEFAULT 0,
  publicado  BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Dueño del plan: NULL = plan global (del admin); si no, es de un revendedor.
ALTER TABLE planes ADD COLUMN IF NOT EXISTS reseller_id INTEGER REFERENCES resellers(id) ON DELETE CASCADE;

-- Clientes (dueños de radio). Cada uno pertenece a un user.
CREATE TABLE IF NOT EXISTS clientes (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nombre_empresa        VARCHAR(255) NOT NULL,
  plan                  VARCHAR(50)  NOT NULL DEFAULT 'basico',
  azuracast_station_id  INTEGER,
  url_streaming         TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  activo                BOOLEAN      NOT NULL DEFAULT true
);

-- Consumo de banda por RADIO y día (lo llena el Guardián de Banda).
-- Permite ver cuánto gasta cada cliente y, sumando, cada revendedor.
CREATE TABLE IF NOT EXISTS consumo_cliente (
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  fecha      DATE    NOT NULL,
  bytes      BIGINT  NOT NULL DEFAULT 0,
  PRIMARY KEY (cliente_id, fecha)
);

-- Suscripciones / facturación de cada cliente.
CREATE TABLE IF NOT EXISTS suscripciones (
  id                        SERIAL PRIMARY KEY,
  cliente_id                INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  plan_tipo                 VARCHAR(50)   NOT NULL,
  precio_mensual            NUMERIC(10,2) NOT NULL,
  fecha_inicio              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  fecha_proxima_renovacion  TIMESTAMPTZ,
  estado                    VARCHAR(20)   NOT NULL DEFAULT 'activa'
);

-- Canciones subidas por cada cliente (referencia al media en AzuraCast).
CREATE TABLE IF NOT EXISTS media (
  id                  SERIAL PRIMARY KEY,
  cliente_id          INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  azuracast_media_id  VARCHAR(100),
  titulo              VARCHAR(255),
  artista             VARCHAR(255),
  duracion            INTEGER,
  archivo_ruta        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Datos de conexión DJ en vivo del cliente (source/streamer en AzuraCast)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS dj_puerto   INTEGER;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS dj_usuario  VARCHAR(100);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS dj_password VARCHAR(100);

-- Revendedor dueño del cliente (NULL = creado directo por el super admin)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS reseller_id INTEGER REFERENCES resellers(id) ON DELETE SET NULL;

-- Servidor AzuraCast donde vive la radio (NULL = servidor por defecto del .env)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS servidor_id INTEGER REFERENCES servidores(id) ON DELETE SET NULL;
-- Shortcode de la estación (para el reproductor/embed público sin exponer el id)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS short_name VARCHAR(150);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_clientes_user_id     ON clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_suscripciones_cliente ON suscripciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_media_cliente         ON media(cliente_id);
