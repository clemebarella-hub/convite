-- ============================================================
-- CONVITE.CL — Schema PostgreSQL para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- TABLA: users
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT,                          -- null si usa OAuth / login mágico
  name          TEXT NOT NULL,
  phone_enc     TEXT,                          -- cifrado AES-256
  role          TEXT DEFAULT 'client'
                CHECK (role IN ('client', 'provider', 'admin')),
  provider_id   UUID,                          -- si role=provider, FK a providers
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

-- ─────────────────────────────────────────────
-- TABLA: providers (los 21 proveedores actuales)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS providers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,        -- 'beefy', 'chili-fries', etc.
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,               -- 'hamburguesas', 'pizza', 'papas', etc.
  type_tags       TEXT[],                      -- ['hamburguesas','papas']
  city            TEXT DEFAULT 'Santiago',
  capacity_desc   TEXT,
  price_min       INTEGER,
  price_max       INTEGER,
  min_people      INTEGER,
  profile_page    TEXT,                        -- 'beefy.html'
  image_file      TEXT,                        -- 'Beefy.png.jpeg'

  -- Datos sensibles cifrados (AES-256 en app layer)
  whatsapp_enc    TEXT NOT NULL,
  email_enc       TEXT,
  instagram_enc   TEXT,

  rating          NUMERIC(2,1) DEFAULT 5.0,
  reviews_count   INTEGER DEFAULT 0,
  verified        BOOLEAN DEFAULT FALSE,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TABLA: leads
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       UUID REFERENCES providers(id) ON DELETE SET NULL,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Datos del cliente (cifrados, nunca visibles al proveedor antes del desbloqueo)
  client_name_enc   TEXT NOT NULL,
  client_phone_enc  TEXT NOT NULL,
  client_email_enc  TEXT NOT NULL,

  -- Datos del evento (visibles al proveedor para decidir si cotiza)
  event_date        DATE NOT NULL,
  event_time        TIME,
  event_comuna      TEXT NOT NULL,
  event_type        TEXT,
  guest_count       INTEGER NOT NULL,
  event_space       TEXT,
  message           TEXT,
  products_json     JSONB,

  -- Cotización y pagos
  quoted_amount     INTEGER,                   -- monto propuesto por el proveedor (CLP)
  anticipo_amount   INTEGER,                   -- 10% de quoted_amount
  commission_amount INTEGER,                   -- porcentaje que retiene Convite
  truck_share       INTEGER,                   -- lo que va al proveedor como garantía

  -- Mercado Pago
  mp_preference_id  TEXT,
  mp_payment_id     TEXT,
  mp_payment_status TEXT,

  -- Máquina de estados
  status            TEXT DEFAULT 'PENDIENTE'
                    CHECK (status IN (
                      'PENDIENTE',
                      'PROPUESTA_ENVIADA',
                      'PAGO_INICIADO',
                      'RESERVA_PAGADA',
                      'DESBLOQUEADO',
                      'CANCELADO_CLIENTE',
                      'CANCELADO_PROVEEDOR',
                      'COMPLETADO',
                      'DISPUTA'
                    )),

  unlocked_at       TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TABLA: lead_status_log (auditoría completa)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_status_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE,
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  triggered_by  TEXT CHECK (triggered_by IN ('client','provider','system','webhook_mp','admin')),
  metadata      JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ÍNDICES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_provider    ON leads(provider_id);
CREATE INDEX IF NOT EXISTS idx_leads_status      ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_event_date  ON leads(event_date);
CREATE INDEX IF NOT EXISTS idx_leads_user        ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_log_lead          ON lead_status_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_providers_slug    ON providers(slug);

-- ─────────────────────────────────────────────
-- TRIGGER: updated_at automático
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_providers_updated
  BEFORE UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_leads_updated
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- DATOS INICIALES: 21 proveedores migrados
-- (whatsapp_enc se rellena con el script de migración)
-- ─────────────────────────────────────────────
INSERT INTO providers (slug, name, category, type_tags, price_min, price_max, min_people, capacity_desc, profile_page, image_file, whatsapp_enc, verified, active) VALUES
  ('beefy',                'Beefy',                    'hamburguesas', ARRAY['hamburguesas'],          4000, 6000,  40, 'Hasta 500 hamburguesas',    'beefy.html',                'Beefy.png.jpeg',                    'PENDING_ENC', true, true),
  ('chili-fries',          'Chili Fries',              'papas',        ARRAY['papas'],                 1200, 2875,  80, 'Hasta 350+ personas',       'chili-fries.html',          'Chili.fries.png.jpeg',              'PENDING_ENC', true, true),
  ('agostinos',            'Agostino''s Pizza',        'pizza',        ARRAY['pizza'],                 5000,12000,   8, 'Hasta 100 personas',        'agostinos.html',            'Agostinos.png.jpeg',                'PENDING_ENC', true, true),
  ('churrascos-patagonia', 'Churrascos Patagonia',     'sandwiches',   ARRAY['sandwiches','papas'],    1690, 3190,  25, 'Sin límite',                'churrascos-patagonia.html', 'Churrascos-patagonia.png.jpeg',     'PENDING_ENC', true, true),
  ('crispy-fries',         'Crispy Fries & Burgers',   'papas',        ARRAY['hamburguesas','papas'],   850, 2200,  40, 'Hasta 400 personas',        'crispy-fries.html',         'Crispy-fries-and-burgers.png.jpeg', 'PENDING_ENC', true, true),
  ('de-niros',             'De Niro''s Pizza',         'pizza',        ARRAY['pizza'],                 3500,11990,  20, 'Hasta 200+ personas',       'de-niros.html',             'De-niros-pizza.png.jpeg',           'PENDING_ENC', true, true),
  ('brisket-in-law',       'Brisket In Law',           'sandwiches',   ARRAY['sandwiches'],            4200, 5400,  60, 'Hasta 200 personas',        'brisket-in-law.html',       'brisket-in-law.png.jpeg',           'PENDING_ENC', true, true),
  ('naturapura',           'Naturapura Açaí Bar',      'postres',      ARRAY['postres'],               4000, 8500,  10, 'Hasta 200 personas',        'naturapura.html',           'naturapura.png.jpeg',               'PENDING_ENC', true, true),
  ('wild-smash',           'Wild Smash',               'hamburguesas', ARRAY['hamburguesas','papas','hotdogs'], 5500,6000,30,'Flexible',             'wild-smash.html',           'wild-smash.png.jpeg',               'PENDING_ENC', true, true),
  ('a-la-medida',          'A la Medida Gourmet',      'hamburguesas', ARRAY['hamburguesas','sandwiches','pizza','tacos','hotdogs','papas'], 3400,8000,35,'A coordinar','a-la-medida.html','A-la-medida.png.jpeg',      'PENDING_ENC', true, true),
  ('entrepanes',           'Entrepanes',               'sandwiches',   ARRAY['sandwiches','hamburguesas'],1200,5500, 20,'Hasta 400 personas',         'entrepanes.html',           'Entre-panes.png.jpeg',              'PENDING_ENC', true, true),
  ('k-burgas',             'K-Burgas',                 'hamburguesas', ARRAY['hamburguesas','papas'],   4000, 5500,  20, 'Hasta 300+ personas',       'k-burgas.html',             'k-burgas.jpeg',                     'PENDING_ENC', true, true),
  ('el-frito-jack',        'El Frito Jack',            'papas',        ARRAY['papas','empanadas'],      1000, 1800,  50, 'Consultar',                 'el-frito-jack.html',        'El-frito-jack.png.jpeg',            'PENDING_ENC', true, true),
  ('grillers',             'Grillers',                 'hamburguesas', ARRAY['hamburguesas','sandwiches','papas'],4000,6500,30,'Hasta 300 personas',  'grillers.html',             'Grillers.png.jpeg',                 'PENDING_ENC', true, true),
  ('nunos-smash',          'Nuno''s Smash',            'hamburguesas', ARRAY['hamburguesas'],           5000, 7500,  40, 'Hasta 300 hamburguesas',    'nunos-smash.html',          'nunos-smash.png.jpeg',              'PENDING_ENC', true, true),
  ('el-buen-mordisco',     'El Buen Mordisco',         'sandwiches',   ARRAY['sandwiches','hamburguesas','hotdogs'],1500,6000,40,'Eventos masivos',    'el-buen-mordisco.html',     'El-buen-mordisco.png.jpeg',         'PENDING_ENC', true, true),
  ('dirty-smash',          'Dirty Smash',              'hamburguesas', ARRAY['hamburguesas'],           4500, 6000,  50, 'Hasta 700 personas',        'dirty-smash.html',          'Dirty-Smash-2.png.jpeg.jpeg',       'PENDING_ENC', true, true),
  ('tacon-todo',           'Taco''n Todo',             'tacos',        ARRAY['tacos'],                  3500, 6000,  30, 'Hasta 300 personas',        'tacon-todo.html',           'tacon-todo.png.jpeg',               'PENDING_ENC', true, true),
  ('el-compadre-parrillero','El Compadre Parrillero',  'asados',       ARRAY['asados'],                 8000,35000,  20, 'Hasta 500 personas',        'el-compadre-parrillero.html','el-compadre-parrillero.png.jpeg',  'PENDING_ENC', true, true),
  ('salva-bajon',          'Salva-Bajón',              'hotdogs',      ARRAY['hotdogs','sandwiches','hamburguesas','papas'],3000,12000,40,'Hasta 400 personas','salva-bajon.html','salva-bajon.png.jpeg',               'PENDING_ENC', true, true),
  ('el-club',              'El Club Gourmet',          'hamburguesas', ARRAY['hamburguesas','pizza','sandwiches','hotdogs','papas'],3500,7500,40,'Hasta 400 personas','el-club.html','El-club.png.jpeg',                 'PENDING_ENC', true, true)
ON CONFLICT (slug) DO NOTHING;
