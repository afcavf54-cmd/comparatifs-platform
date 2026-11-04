-- ════════════════════════════════════════════════════════════════════════
-- mon-credit-facile — table LEADS (abonnés du simulateur)
-- À exécuter dans le SQL editor du projet Supabase DÉDIÉ mon-credit-facile.
--
-- Stocke les infos propres au simulateur qui n'existent pas dans la newsletter
-- centrale (HUB) : type de crédit choisi, montant emprunté, situation pro.
-- Les tags / le statut d'abonnement restent gérés par la newsletter centrale
-- (même principe que monelor) ; on rapproche les deux par email dans le dashboard.
--
-- Écrit UNIQUEMENT côté serveur (service_role) depuis la route /recap.
-- Pas de policy anon → le public ne peut ni lire ni écrire cette table.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  project       text,                       -- type de crédit choisi (clé : auto, travaux, regroupement…)
  amount        integer,                    -- somme empruntée (€)
  situation     text,                       -- situation pro (cdi, cdd, indep, retraite, autre)
  duration      text,                       -- durée de remboursement choisie
  optin         boolean not null default false,  -- a accepté de recevoir les offres marketing
  n_simulations integer not null default 1,      -- nb de simulations faites avec cet email
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists leads_created_idx on public.leads (created_at desc);

alter table public.leads enable row level security;
-- Aucune policy : seul le service_role (serveur) accède à la table. RLS bloque l'anon.

-- ── Upsert atomique appelé par la route /recap ──────────────────────────────
-- Met à jour la dernière simulation, garde l'opt-in « collant » (ne le repasse
-- jamais à false), et incrémente le compteur de simulations.
create or replace function public.upsert_lead(
  p_email     text,
  p_project   text,
  p_amount    integer,
  p_situation text,
  p_duration  text,
  p_optin     boolean
) returns void
language sql
security definer
as $$
  insert into public.leads (email, project, amount, situation, duration, optin)
  values (lower(p_email), p_project, p_amount, p_situation, p_duration, coalesce(p_optin, false))
  on conflict (email) do update set
    project       = excluded.project,
    amount        = excluded.amount,
    situation     = excluded.situation,
    duration      = excluded.duration,
    optin         = leads.optin or excluded.optin,
    n_simulations = leads.n_simulations + 1,
    updated_at    = now();
$$;
