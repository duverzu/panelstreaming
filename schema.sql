-- ==================================================================
--  schema.sql — Estructura de la base de datos del Panel Radio
--  Ejecutar con:  npm run migrate   (o psql < schema.sql)
--  Es idempotente: se puede correr varias veces sin romper nada.
-- ==================================================================

-- Usuarios (admin y clientes comparten esta tabla, se distinguen por role)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'cliente')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

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

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_clientes_user_id     ON clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_suscripciones_cliente ON suscripciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_media_cliente         ON media(cliente_id);
