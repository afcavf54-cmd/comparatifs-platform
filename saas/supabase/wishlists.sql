-- ════════════════════════════════════════════════════════════════════════
-- cadeauclic /mes-cadeaux — sauvegarde des listes de souhaits
-- À exécuter UNE FOIS dans le SQL editor du projet Supabase PRINCIPAL (HUB).
--
-- Une ligne = un espace de listes, identifié par une clé secrète longue
-- générée par la page (lien de synchronisation). Le contenu complet
-- (événements, listes, acheteurs, cadeaux) est stocké en JSON.
--
-- Lecture / écriture UNIQUEMENT côté serveur (service_role) via la route
-- HUB /api/wishlist. RLS activée sans policy → aucun accès public direct.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.wishlists (
  id          text primary key,                 -- clé secrète (≥ 24 caractères)
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table public.wishlists enable row level security;
-- Aucune policy : seul le service_role (serveur) accède à la table.
