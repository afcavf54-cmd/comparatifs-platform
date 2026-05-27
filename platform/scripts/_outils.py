"""
Génération des pages d'outils interactifs (convertisseurs, calculateurs…)
pour un site donné.

Script autonome : à exécuter APRÈS generate.py dans le pipeline.
Ne touche pas à generate.py, pour limiter les risques.

Usage :
    python platform/scripts/_outils.py <site_slug>
    # Ex : python platform/scripts/_outils.py digicube-fr

Lit :
    platform/sites/<site>/config.yaml
    platform/sites/<site>/outils.json
    platform/templates/outils/<outil_id>.html.j2

Écrit :
    platform/sites/<site>/output/<slug>.html (1 par outil "active":true)

Retour terminal :
    Liste des URLs publiques générées (1 par ligne)
    pour faciliter l'ajout au sitemap.xml plus tard si besoin.
"""

from __future__ import annotations
import sys
import json
from pathlib import Path

try:
    import yaml
except ImportError:
    print("❌ pyyaml manquant. Installer avec : pip install pyyaml", file=sys.stderr)
    sys.exit(1)

try:
    from jinja2 import Environment, FileSystemLoader, TemplateNotFound
except ImportError:
    print("❌ jinja2 manquant. Installer avec : pip install jinja2", file=sys.stderr)
    sys.exit(1)


def find_platform_dir() -> Path:
    """Remonte depuis ce script pour trouver platform/."""
    here = Path(__file__).resolve()
    # Le script est dans platform/scripts/_outils.py → on remonte de 2 cran
    if here.parent.name == "scripts" and here.parent.parent.name == "platform":
        return here.parent.parent
    # Fallback : chercher un dossier 'platform' en remontant
    p = here
    for _ in range(6):
        p = p.parent
        if (p / "platform").is_dir():
            return p / "platform"
    raise SystemExit("❌ Impossible de localiser le dossier 'platform/'.")


def main(site_slug: str) -> int:
    platform_dir = find_platform_dir()
    site_dir = platform_dir / "sites" / site_slug
    templates_dir = platform_dir / "templates"
    output_dir = site_dir / "output"

    if not site_dir.is_dir():
        print(f"❌ Site introuvable : {site_dir}", file=sys.stderr)
        return 1

    # ── 1) Charger config.yaml du site ──────────────────────────
    config_path = site_dir / "config.yaml"
    if not config_path.exists():
        print(f"❌ config.yaml introuvable : {config_path}", file=sys.stderr)
        return 1

    with config_path.open(encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}

    site_cfg = config.get("site", {}) or {}
    theme_cfg = config.get("theme", {}) or {}

    # ── 2) Charger outils.json (skip si absent) ─────────────────
    outils_path = site_dir / "outils.json"
    if not outils_path.exists():
        print(f"⏭  Pas d'outils.json pour {site_slug} — rien à générer.")
        return 0

    try:
        outils_config = json.loads(outils_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"❌ outils.json invalide : {e}", file=sys.stderr)
        return 1

    outils = outils_config.get("outils", {}) or {}
    if not outils:
        print(f"⏭  Aucun outil défini dans outils.json pour {site_slug}.")
        return 0

    # ── 3) Setup Jinja2 ─────────────────────────────────────────
    if not templates_dir.is_dir():
        print(f"❌ Dossier templates introuvable : {templates_dir}", file=sys.stderr)
        return 1

    env = Environment(
        loader=FileSystemLoader(str(templates_dir)),
        autoescape=False,
        keep_trailing_newline=True,
    )

    # ── Filtres et globals custom (compat avec generate.py) ─────
    # Le footer (et potentiellement d'autres includes) utilise des
    # filtres custom définis par generate.py. On les recopie ici
    # pour que le rendu ne plante pas en standalone.
    import datetime as _dt

    _MOIS_FR = [
        "janvier", "février", "mars", "avril", "mai", "juin",
        "juillet", "août", "septembre", "octobre", "novembre", "décembre",
    ]

    def _fr_date(value, fmt: str = "long"):
        if value is None:
            value = _dt.date.today()
        if isinstance(value, str):
            try:
                value = _dt.datetime.fromisoformat(value)
            except ValueError:
                return value
        if not isinstance(value, (_dt.date, _dt.datetime)):
            return str(value)
        return f"{value.day} {_MOIS_FR[value.month - 1]} {value.year}"

    env.filters["fr_date"] = _fr_date
    env.globals["today"] = _dt.date.today()
    env.globals["now"] = _dt.datetime.now()
    env.globals["build_date"] = _fr_date(_dt.date.today())
    env.globals["year"] = _dt.date.today().year

    # ── 4) Domaine pour URLs publiques ──────────────────────────
    domain = (site_cfg.get("domain") or "").rstrip("/")

    # S'assurer que le dossier output existe
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── 5) Générer chaque outil actif ───────────────────────────
    nb_generated = 0
    nb_skipped = 0
    nb_errors = 0
    generated_urls: list[str] = []

    print(f"\n🧰 Génération des outils pour {site_slug}")
    print("─" * 50)

    for outil_id, outil_state in outils.items():
        if not outil_state.get("active"):
            nb_skipped += 1
            print(f"  ⏭  {outil_id} (hors ligne)")
            continue

        slug = (outil_state.get("slug") or outil_id).strip().strip("/")
        if not slug:
            print(f"  ⚠ {outil_id} : slug vide, skip")
            nb_errors += 1
            continue

        # Charger le template Jinja2 de l'outil
        template_name = f"outils/{outil_id}.html.j2"
        try:
            template = env.get_template(template_name)
        except TemplateNotFound:
            print(f"  ⚠ {outil_id} : template introuvable ({template_name})")
            nb_errors += 1
            continue

        # Données à passer au template
        outil_data = {
            "id": outil_id,
            "slug": slug,
            "title": outil_state.get("title", ""),
            "meta_description": outil_state.get("meta_description", ""),
            "h1": outil_state.get("h1", ""),
            "contenu_genere": outil_state.get("contenu_genere", ""),
            "faq": outil_state.get("faq", []) or [],
            "nb_mots": outil_state.get("nb_mots", 0),
        }

        # Rendu
        try:
            html = template.render(
                outil=outil_data,
                site=site_cfg,
                theme=theme_cfg,
                config=config,
            )
        except Exception as e:
            print(f"  ❌ {outil_id} : erreur de rendu — {e}")
            nb_errors += 1
            continue

        # Écriture
        output_path = output_dir / f"{slug}.html"
        try:
            output_path.write_text(html, encoding="utf-8")
        except OSError as e:
            print(f"  ❌ {outil_id} : erreur d'écriture — {e}")
            nb_errors += 1
            continue

        public_url = f"{domain}/{slug}" if domain else f"/{slug}"
        generated_urls.append(public_url)
        nb_generated += 1
        print(f"  ✓ {slug}.html → {public_url}")

    # ── 6) Résumé final ─────────────────────────────────────────
    print("─" * 50)
    print(f"✅ {nb_generated} outil(s) publié(s), {nb_skipped} hors ligne, {nb_errors} erreur(s)")

    if generated_urls:
        print(f"\nURLs publiées :")
        for url in generated_urls:
            print(f"  {url}")

    return 0 if nb_errors == 0 else 2


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python _outils.py <site_slug>", file=sys.stderr)
        print("Exemple: python platform/scripts/_outils.py digicube-fr", file=sys.stderr)
        sys.exit(1)
    sys.exit(main(sys.argv[1]))
