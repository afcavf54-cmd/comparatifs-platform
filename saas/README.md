# Setup — Plateforme Comparatifs Automatisés
## Stack : Next.js · Supabase · GitHub Actions · Cloudflare Pages

---

## Vue d'ensemble

```
Toi (1 NDD) → Dashboard Next.js (Vercel)
                    ↓ API GitHub dispatch
              GitHub Actions → generate.py
                    ↓ git push output/
              Cloudflare Pages → site statique live
                    ↑ prix live
              Google Sheets CSV
```

---

## Étape 1 — GitHub

1. Crée un repo GitHub (privé) : `comparatifs-platform`
2. Clone et pousse le code fourni
3. Crée un **Personal Access Token** :
   - GitHub > Settings > Developer Settings > Personal Access Tokens > Fine-grained
   - Permissions : `Contents: Read & Write`, `Actions: Read & Write`
   - Garde le token, tu en auras besoin

---

## Étape 2 — Supabase

1. Crée un compte sur [supabase.com](https://supabase.com) (gratuit)
2. Nouveau projet → note l'URL et la `anon key` (Settings > API)
3. SQL Editor → coller et exécuter `supabase/schema.sql`
4. Vérifie que les tables sont créées : `sites`, `products`, `templates`, `builds`

---

## Étape 3 — Dashboard Next.js sur Vercel

1. [vercel.com](https://vercel.com) → Import Git Repository → `comparatifs-platform`
2. Framework : Next.js (auto-détecté)
3. Root directory : `dashboard/`
4. Variables d'environnement (copier depuis `.env.example`) :
   ```
   NEXT_PUBLIC_SUPABASE_URL        = https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY   = eyJ...
   GITHUB_TOKEN                    = ghp_...
   GITHUB_OWNER                    = ton-username
   GITHUB_REPO                     = comparatifs-platform
   NEXTAUTH_SECRET                 = (openssl rand -base64 32)
   NEXTAUTH_URL                    = https://dashboard.ton-domaine.com
   GITHUB_CLIENT_ID                = Iv1...
   GITHUB_CLIENT_SECRET            = ...
   ```
5. Deploy → ton dashboard est en ligne

---

## Étape 4 — GitHub Secrets (pour la GitHub Action)

Dans le repo GitHub > Settings > Secrets > Actions :

```
SUPABASE_URL        = https://xxx.supabase.co
SUPABASE_ANON_KEY   = eyJ...
```

---

## Étape 5 — Cloudflare Pages (sites statiques)

Pour chaque site niche :

1. [dash.cloudflare.com](https://dash.cloudflare.com) > Pages > Create a project
2. Connect to Git → ton repo → branche `main`
3. Build settings :
   - Build command : `echo "static"`  (Cloudflare ne build pas, juste déploie)
   - Build output directory : `sites/poussettes/output`
4. Domaine personnalisé : `comparatif-poussettes.ton-domaine.com`

Répète pour chaque nouvelle niche. Cloudflare Pages est **gratuit en illimité**.

---

## Étape 6 — Premier site (poussettes)

1. Dans le dashboard → Sites → Nouveau site
2. Remplis : slug=`poussettes`, domaine, couleur accent
3. Importe les produits (ou ils sont déjà en base si tu as migré le YAML)
4. Clic sur "Générer" → GitHub Action se déclenche → Cloudflare Pages déploie

---

## Workflow quotidien

### Ajouter un produit
Dashboard → Produits → "+ Ajouter" → Remplir → Sauvegarder → Générer

### Modifier un template
Dashboard → Templates → Éditeur → Modifier → Sauvegarder → Générer

### Créer un nouveau site
Dashboard → Sites → "+ Nouveau" → Configurer → Importer produits → Générer

### Mettre à jour depuis Claude
1. Demander l'amélioration ici
2. Récupérer les fichiers générés
3. `git add . && git commit -m "amélioration X" && git push`
4. Génération automatique déclenchée

---

## Coûts mensuels

| Service | Plan | Coût |
|---|---|---|
| Supabase | Free (< 500 Mo) | $0 |
| Vercel | Hobby | $0 |
| Cloudflare Pages | Free | $0 |
| GitHub | Free (public) ou Team | $0–$4 |
| **Total démarrage** | | **$0–$4/mois** |
| **À 100 sites** | Plans payants | ~$50/mois |

---

## Structure du repo

```
comparatifs-platform/
├── .github/
│   └── workflows/
│       └── generate.yml        ← GitHub Action
├── dashboard/                  ← App Next.js (déployée sur Vercel)
│   ├── app/
│   │   ├── api/
│   │   │   ├── generate/route.ts
│   │   │   ├── sites/route.ts
│   │   │   └── products/route.ts
│   ├── lib/
│   │   └── supabase.ts
│   ├── .env.example
│   └── package.json
├── scripts/
│   └── generate.py             ← Générateur (lit Supabase ou YAML)
├── templates/
│   └── comparatif-vs.html.j2
├── sites/
│   ├── _shared/
│   │   └── sheets.js
│   └── poussettes/
│       ├── config.yaml         ← Backup local (fallback)
│       ├── products.yaml       ← Backup local (fallback)
│       └── output/             ← HTML généré → Cloudflare Pages
└── supabase/
    └── schema.sql
```
