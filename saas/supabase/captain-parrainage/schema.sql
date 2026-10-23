-- ============================================================================
-- Captain Parrainage — Schéma Supabase
-- ----------------------------------------------------------------------------
-- À exécuter dans le SQL Editor d'un PROJET SUPABASE DÉDIÉ à captain-parrainage
-- (⚠ PAS le projet du HUB Viseoweb : ses tables ont des policies « authenticated »
--  larges — mélanger les membres du site public avec l'admin exposerait les
--  données du HUB. Crée un nouveau projet Supabase pour ce site.)
--
-- Modèle :
--   • parrainages        : les offres (gérées depuis le dashboard, service_role)
--   • profiles           : 1 ligne par membre (newsletter opt-in, consentement)
--   • newsletter_envois  : journal des campagnes envoyées
--   • stats agrégées     : fonction SECURITY DEFINER lisible par anon (pour la
--                          home : totaux, nb offres, montants sans dépôt…) SANS
--                          exposer le détail des offres verrouillées.
--
-- Règle d'accès :
--   anon          → ne voit que les offres `acces_libre` (les tease gratuits)
--                   + les agrégats via get_parrainages_stats()
--   authenticated → voit TOUTES les offres actives (membre inscrit/confirmé)
--   writes        → service_role uniquement (dashboard) — aucune policy anon/auth
-- ============================================================================

-- extensions utiles (présentes par défaut sur Supabase)
create extension if not exists "pgcrypto";

-- ── updated_at auto ─────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================================
-- 1. OFFRES DE PARRAINAGE
-- ============================================================================
create table if not exists public.parrainages (
  id                  uuid primary key default gen_random_uuid(),
  marque              text not null,                 -- "BoursoBank"
  slug                text unique not null,          -- "boursobank"
  categorie           text,                          -- "Banque", "Néobanque", "Bourse", "Assurance-vie"…
  type_prime          text,                          -- "Cash", "Carte cadeau", "Cashback", "Crypto"…
  montant             numeric(10,2),                 -- prime max en €
  sans_depot          boolean not null default false,
  montant_sans_depot  numeric(10,2),                 -- part récupérable sans dépôt (optionnel)
  conditions          text,                          -- conditions courtes (affichées)
  lien                text not null,                 -- lien d'affiliation (⚠ sensible → gated)
  code_parrainage     text,                          -- code éventuel (⚠ sensible → gated)
  logo_url            text,
  couleur             text,                          -- couleur marque (#hex) pour la carte
  nouveau             boolean not null default false,
  en_avant            boolean not null default false,-- mis en avant
  acces_libre         boolean not null default false,-- visible SANS inscription (tease gratuit)
  ordre               int not null default 0,
  actif               boolean not null default true,
  verifie_le          date not null default current_date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists parrainages_actif_idx     on public.parrainages (actif);
create index if not exists parrainages_categorie_idx on public.parrainages (categorie);
create index if not exists parrainages_ordre_idx     on public.parrainages (ordre);

drop trigger if exists trg_parrainages_updated on public.parrainages;
create trigger trg_parrainages_updated before update on public.parrainages
  for each row execute function public.set_updated_at();

alter table public.parrainages enable row level security;

-- anon : uniquement les offres en accès libre et actives (les tease)
drop policy if exists "anon_read_free" on public.parrainages;
create policy "anon_read_free" on public.parrainages
  for select to anon
  using (actif and acces_libre);

-- authenticated (membre) : toutes les offres actives
drop policy if exists "auth_read_active" on public.parrainages;
create policy "auth_read_active" on public.parrainages
  for select to authenticated
  using (actif);

-- (aucune policy insert/update/delete → réservé au service_role, qui bypass RLS)

-- ============================================================================
-- 2. PROFILS MEMBRES  (1:1 avec auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text,
  newsletter_opt_in  boolean not null default true,
  consent_at         timestamptz,
  created_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- le membre lit / met à jour SON profil uniquement
drop policy if exists "own_select" on public.profiles;
create policy "own_select" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "own_update" on public.profiles;
create policy "own_update" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- création auto du profil à l'inscription (metadata: newsletter_opt_in)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, newsletter_opt_in, consent_at)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data ->> 'newsletter_opt_in')::boolean, true),
    now()
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 3. JOURNAL DES ENVOIS NEWSLETTER
-- ============================================================================
create table if not exists public.newsletter_envois (
  id              uuid primary key default gen_random_uuid(),
  sujet           text,
  contenu         text,
  nb_destinataires int,
  parrainage_ids  uuid[],           -- offres incluses dans l'envoi
  envoye_le       timestamptz not null default now(),
  envoye_par      text
);
alter table public.newsletter_envois enable row level security;
-- aucune policy → lecture/écriture réservées au service_role (dashboard + edge fn)

-- ============================================================================
-- 4. STATS AGRÉGÉES POUR LA HOME  (lisibles par anon, sans fuite du détail)
-- ----------------------------------------------------------------------------
-- Renvoie un JSON :
--   total_offres, total_montant, total_sans_depot_offres, total_sans_depot_montant,
--   acces_libre_offres (= preview), verrouillees (= lockedTotal),
--   categories [{categorie, n}]
-- SECURITY DEFINER : contourne la RLS pour agréger TOUTES les offres actives,
-- mais ne retourne QUE des agrégats (jamais marque/lien).
-- ============================================================================
create or replace function public.get_parrainages_stats()
returns json
language sql
security definer set search_path = public
stable
as $$
  select json_build_object(
    'total_offres',               count(*),
    'total_montant',              coalesce(sum(montant), 0),
    'total_sans_depot_offres',    count(*) filter (where sans_depot),
    'total_sans_depot_montant',   coalesce(sum(coalesce(montant_sans_depot, montant)) filter (where sans_depot), 0),
    'acces_libre_offres',         count(*) filter (where acces_libre),
    'verrouillees',               count(*) filter (where not acces_libre),
    'categories', coalesce((
      select json_agg(json_build_object('categorie', categorie, 'n', n) order by n desc)
      from (
        select coalesce(categorie, 'Autres') as categorie, count(*) as n
        from public.parrainages where actif
        group by coalesce(categorie, 'Autres')
      ) c
    ), '[]'::json)
  )
  from public.parrainages
  where actif;
$$;

-- accessible sans être connecté (pour les chiffres de la home)
grant execute on function public.get_parrainages_stats() to anon, authenticated;

-- ── Offres « teaser » pour anon : montant/catégorie visibles, marque+lien MASQUÉS
-- (mécanique de frustration : on voit qu'il existe une prime de 120 € « Banque »
--  mais pas de quelle banque ni le lien, tant qu'on n'est pas inscrit).
create or replace function public.get_offers_public()
returns table (categorie text, type_prime text, montant numeric, sans_depot boolean,
               montant_sans_depot numeric, nouveau boolean, acces_libre boolean, verifie_le date)
language sql security definer set search_path = public stable
as $$
  select categorie, type_prime, montant, sans_depot, montant_sans_depot, nouveau, acces_libre, verifie_le
  from public.parrainages
  where actif
  order by en_avant desc, ordre asc, montant desc nulls last;
$$;
grant execute on function public.get_offers_public() to anon, authenticated;

-- ============================================================================
-- FIN
-- ============================================================================
