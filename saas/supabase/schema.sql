-- ============================================================
-- SCHÉMA SUPABASE — Plateforme Comparatifs
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ── SITES ────────────────────────────────────────────────────
create table sites (
  id          uuid primary key default uuid_generate_v4(),
  slug        text unique not null,          -- ex: poussettes
  name        text not null,                 -- ex: Comparatif Poussettes
  domain      text not null,                 -- ex: cadeauclic.com
  base_path   text not null,                 -- ex: /comparatif-poussettes
  status      text default 'draft',          -- draft | live | paused
  accent      text default '#E8410A',
  accent2     text default '#FF6B3D',
  bg          text default '#F7F4EF',
  ink         text default '#1A1714',
  font_title  text default 'DM Serif Display',
  font_body   text default 'Outfit',
  sheet_csv_url text,
  analytics_id  text,
  seo_year    int default 2026,
  template_id uuid,
  pages_count int default 0,
  last_built  timestamptz,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── PRODUCTS ─────────────────────────────────────────────────
create table products (
  id           uuid primary key default uuid_generate_v4(),
  site_id      uuid references sites(id) on delete cascade,
  slug         text not null,
  nom          text not null,
  marque       text not null,
  type         text not null,               -- citadine | compact | trio | premium
  prix         int not null,
  poids        numeric(4,1),
  format_pliage text,
  age          text,
  note_manip   int check (note_manip between 1 and 5),
  note_confort int check (note_confort between 1 and 5),
  note_pliage  int check (note_pliage between 1 and 5),
  siege_auto   boolean default true,
  note_amazon  numeric(2,1),
  description  text,
  points_forts text[],
  points_faibles text[],
  verdict_si   text[],
  -- Données live depuis Google Sheets (sync)
  prix_live    int,
  promo_live   int,
  url_amazon   text,
  photo_url    text,
  disponible   boolean default true,
  active       boolean default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(site_id, slug)
);

-- ── TEMPLATES ────────────────────────────────────────────────
create table templates (
  id          uuid primary key default uuid_generate_v4(),
  slug        text unique not null,          -- ex: comparatif-vs
  name        text not null,
  filename    text not null,                 -- ex: comparatif-vs.html.j2
  description text,
  status      text default 'active',         -- active | draft | archived
  content     text,                          -- contenu Jinja2 complet
  sections    jsonb default '[]',            -- ordre et état des sections
  version     int default 1,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── TEMPLATE HISTORY ─────────────────────────────────────────
create table template_history (
  id          uuid primary key default uuid_generate_v4(),
  template_id uuid references templates(id) on delete cascade,
  version     int not null,
  content     text,
  message     text,
  created_at  timestamptz default now()
);

-- ── BUILDS ───────────────────────────────────────────────────
create table builds (
  id          uuid primary key default uuid_generate_v4(),
  site_id     uuid references sites(id) on delete cascade,
  status      text default 'pending',       -- pending | running | success | error
  trigger     text default 'manual',        -- manual | push | schedule | product_added
  pages_built int default 0,
  duration_ms int,
  log         text,
  gh_run_id   text,
  created_at  timestamptz default now(),
  finished_at timestamptz
);

-- ── NICHES (catalogue des niches disponibles) ─────────────────
create table niches (
  id          uuid primary key default uuid_generate_v4(),
  slug        text unique not null,
  name        text not null,
  icon        text,
  description text,
  criteria    jsonb,                         -- critères spécifiques à la niche
  status      text default 'available',      -- available | in_progress | live
  created_at  timestamptz default now()
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
alter table sites            enable row level security;
alter table products         enable row level security;
alter table templates        enable row level security;
alter table template_history enable row level security;
alter table builds           enable row level security;
alter table niches           enable row level security;

-- Policies : accès complet pour les utilisateurs authentifiés
create policy "auth_all" on sites            for all using (auth.role() = 'authenticated');
create policy "auth_all" on products         for all using (auth.role() = 'authenticated');
create policy "auth_all" on templates        for all using (auth.role() = 'authenticated');
create policy "auth_all" on template_history for all using (auth.role() = 'authenticated');
create policy "auth_all" on builds           for all using (auth.role() = 'authenticated');
create policy "auth_all" on niches           for all using (auth.role() = 'authenticated');

-- ── TRIGGERS updated_at ───────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_sites     before update on sites     for each row execute function update_updated_at();
create trigger trg_products  before update on products  for each row execute function update_updated_at();
create trigger trg_templates before update on templates for each row execute function update_updated_at();

-- ── DONNÉES INITIALES ─────────────────────────────────────────
insert into niches (slug, name, icon, description, status) values
  ('poussettes',   'Poussettes',        '🍼', 'Poussettes bébé toutes catégories', 'live'),
  ('matelas',      'Matelas',           '🛏️', 'Matelas mousse, latex, ressorts',   'available'),
  ('aspirateurs',  'Aspirateurs robots','🤖', 'Aspirateurs robots et balais',      'available'),
  ('velos',        'Vélos électriques', '🚲', 'VAE urbains et VTT électriques',    'available'),
  ('cafe',         'Robots café',       '☕', 'Machines expresso et dosettes',     'available');

insert into templates (slug, name, filename, description, status, version) values
  ('comparatif-vs', 'Comparatif VS', 'comparatif-vs.html.j2', 'Page comparatif A vs B avec tableau, cards, verdict, FAQ', 'active', 12),
  ('index',         'Index',         'index.html.j2',          'Page d''accueil avec comparateur interactif',               'draft',  1),
  ('produit',       'Fiche produit', 'produit.html.j2',        'Fiche produit individuelle avec schema Product',            'draft',  1);
