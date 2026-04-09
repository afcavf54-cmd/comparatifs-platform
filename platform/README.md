# Plateforme Comparatifs Automatisés

Générateur de sites comparatifs statiques avec affiliation Amazon.  
Architecture : **GitHub + Netlify + Python/Jinja2 + Google Sheets**

---

## Structure du projet

```
platform/
├── scripts/
│   └── generate.py          # Générateur principal
├── templates/
│   └── comparatif-vs.html.j2  # Template partagé (Jinja2)
├── sites/
│   ├── _shared/
│   │   └── sheets.js        # Sync Google Sheets (partagé)
│   └── poussettes/          # ← Premier site
│       ├── config.yaml      # Config site, thème CSS, SEO
│       ├── products.yaml    # Catalogue produits
│       └── output/          # HTML généré (gitignore ou Netlify publish)
├── netlify.toml
├── requirements.txt
└── README.md
```

---

## Démarrage rapide

### 1. Installer les dépendances

```bash
pip install -r requirements.txt
```

### 2. Générer un site

```bash
# Toutes les pages
python scripts/generate.py --site poussettes

# Dry-run (sans écrire)
python scripts/generate.py --site poussettes --dry-run

# Une seule paire
python scripts/generate.py --site poussettes --pair yoyo-2,cybex-balios-s

# Tous les sites
python scripts/generate.py --all
```

### 3. Tester en local

```bash
cd sites/poussettes/output
python -m http.server 8080
# → http://localhost:8080
```

---

## Ajouter un nouveau site (nouvelle niche)

### Étape 1 — Créer le dossier site

```bash
mkdir -p sites/matelas
```

### Étape 2 — Copier et adapter config.yaml

```bash
cp sites/poussettes/config.yaml sites/matelas/config.yaml
# Modifier : slug, name, domain, base_path, sheet_csv_url, theme.accent, criteria
```

### Étape 3 — Créer products.yaml

Renseigner les produits de la niche avec tous les champs définis dans `criteria`.

### Étape 4 — Générer

```bash
python scripts/generate.py --site matelas
```

### Étape 5 — Configurer Netlify

Créer un second site Netlify (même repo GitHub) avec :
- **Build command** : `pip install jinja2 pyyaml && python scripts/generate.py --site matelas`  
- **Publish directory** : `sites/matelas/output`

---

## Google Sheets — structure attendue

Le Sheet doit être **publié en CSV** (Fichier → Partager → Publier sur le Web → CSV).

### Colonnes obligatoires

| Colonne | Description | Exemple |
|---|---|---|
| `slug` | Identifiant unique | `yoyo-2` |
| `prix` | Prix actuel (€) | `549` |
| `promo` | Ancien prix barré (optionnel) | `599` |
| `url_amazon` | Lien affilié complet | `https://amzn.to/xxx` |
| `photo_url` | URL image produit | `https://...` |
| `note_amazon` | Note /5 | `4.6` |
| `disponible` | 1=dispo, 0=indispo | `1` |

Les colonnes `prix`, `url_amazon`, `photo_url`, `note_amazon` **écrasent les valeurs statiques** du YAML côté client via `sheets.js`.

---

## Template comparatif-vs — sections générées

Chaque page `{A}-vs-{B}.html` contient :

1. **SEO head** — title, meta description, canonical, OG, schema Article
2. **Breadcrumb** — maillage sémantique
3. **Hero H1** — avec les deux noms en italique coloré
4. **Tableau comparatif** — 10 critères (configurables dans config.yaml)
5. **Model cards A + B** — photo, prix live, description, pros/cons, CTA Amazon
6. **Analyse par section** — confort, poids, usage, prix
7. **Avis Amazon** — notes dynamiques via Sheets
8. **FAQ + schema FAQPage** — 3 questions pour les rich snippets Google
9. **Verdict** — deux colonnes "choisissez si..."
10. **Maillage interne** — liens vers les comparatifs similaires
11. **Notice affilié** — mention légale Amazon

---

## Personnalisation thème CSS

Dans `config.yaml`, section `theme` :

```yaml
theme:
  accent: "#E8410A"      # Couleur principale (boutons, étoiles, prix)
  accent2: "#FF6B3D"     # Hover état
  bg: "#F7F4EF"          # Fond page (warm off-white)
  ink: "#1A1714"         # Texte principal + nav
  font_title: "DM Serif Display"
  font_body: "Outfit"
```

Changer `accent` et `bg` suffit pour un look différent par niche.

---

## Performances

| Métrique | Valeur |
|---|---|
| Pages générées | 190 (20 produits) |
| Temps de génération | ~3 secondes |
| Taille moyenne page | ~30 Ko |
| Backend requis | Aucun |
| Mise à jour prix | Temps réel (Google Sheets) |
| Deploy Netlify | ~15 secondes |

---

## Roadmap

- [ ] Template `index.html.j2` (comparateur interactif)
- [ ] Template `produit.html.j2` (fiche produit individuelle)
- [ ] Schema `Product` + `ItemList` JSON-LD
- [ ] Script `add_product.py` — ajout rapide d'un produit
- [ ] Script `check_amazon.py` — vérification des liens affiliés
- [ ] Niches : matelas, aspirateurs, robots café, vélos électriques
