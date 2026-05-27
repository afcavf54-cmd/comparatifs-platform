"""
Synchronise le menu Outils dans config.yaml depuis outils.json.

Lit platform/sites/<site>/outils.json et MET À JOUR
platform/sites/<site>/config.yaml pour que la clé `site.outils_menu`
reflète les outils actifs (active=true).

Doit tourner AVANT generate.py dans le pipeline GitHub Actions,
pour que generate.py voie la nouvelle valeur et la passe aux templates.

Usage :
    python platform/scripts/_sync_outils_menu.py <site_slug>
    # Ex : python platform/scripts/_sync_outils_menu.py digicube-fr

Effet :
    - Si outils.json contient des outils actifs → écrit la clé
      site.outils_menu = [{label, url}, ...]
    - Si aucun outil actif → retire la clé site.outils_menu
    - Si déjà à jour → ne touche pas au fichier (idempotent)

Préserve les commentaires et la mise en forme du YAML grâce à
ruamel.yaml.
"""

from __future__ import annotations
import sys
import json
from pathlib import Path

try:
    from ruamel.yaml import YAML
except ImportError:
    print("❌ ruamel.yaml manquant. Installer avec : pip install ruamel.yaml", file=sys.stderr)
    sys.exit(1)



def slugify(s: str) -> str:
    """Convertit un label en slug d'URL.
    Ex : 'Outils' → 'outils', 'Mes outils gratuits' → 'mes-outils-gratuits',
         'Calculateurs & convertisseurs' → 'calculateurs-convertisseurs'.
    """
    import unicodedata
    import re
    if not s:
        return "outils"
    s = s.strip().lower()
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "outils"


def build_menu_from_outils_json(outils_path: Path) -> list[dict]:
    """Construit la liste menu depuis outils.json.

    Stratégie : si au moins 1 outil est actif, on expose UN seul lien
    dans le menu, pointant vers la page d'index /outils (générée par
    _outils.py). La page /outils liste tous les outils actifs avec
    leur icône, nom et description.

    Retourne [] si aucun outil n'est actif (=> pas de lien dans le menu).
    """
    if not outils_path.is_file():
        return []

    try:
        outils_data = json.loads(outils_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"⚠ outils.json invalide : {e}", file=sys.stderr)
        return []

    menu_label = (outils_data.get("menu_label") or "Outils").strip()
    outils = outils_data.get("outils") or {}

    # Compter les outils actifs
    nb_actifs = sum(1 for o in outils.values() if o.get("active"))
    if nb_actifs == 0:
        return []

    # Un seul lien menu, pointe vers la page d'index dont le slug
    # est dérivé du menu_label (Outils → /outils, Calculateurs → /calculateurs).
    index_slug = slugify(menu_label)
    return [{"label": menu_label, "url": "/" + index_slug}]


def main(site_slug: str) -> int:
    here = Path(__file__).resolve()
    # Le script est à platform/scripts/_sync_outils_menu.py
    platform_dir = here.parent.parent
    site_dir = platform_dir / "sites" / site_slug
    config_path = site_dir / "config.yaml"
    outils_path = site_dir / "outils.json"

    if not config_path.is_file():
        print(f"❌ config.yaml introuvable : {config_path}", file=sys.stderr)
        return 1

    # 1) Lire outils.json et construire le menu cible
    target_menu = build_menu_from_outils_json(outils_path)
    print(f"🔧 Sync outils_menu pour {site_slug}")
    print(f"   {len(target_menu)} outil(s) actif(s) à exposer dans le menu")

    # 2) Lire config.yaml (en préservant commentaires et structure)
    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.indent(mapping=2, sequence=4, offset=2)
    yaml.width = 4096  # éviter le wrap automatique

    with config_path.open("r", encoding="utf-8") as f:
        config = yaml.load(f)

    if config is None or "site" not in config:
        print(f"❌ section 'site:' absente dans {config_path}", file=sys.stderr)
        return 1

    # 3) Comparer avec l'existant pour rester idempotent
    # ruamel.yaml retourne des CommentedMap/Seq, qu'on convertit en
    # dict/list standards pour la comparaison.
    current = config["site"].get("outils_menu") or []
    current_normalized = [
        {"label": str(e.get("label", "")), "url": str(e.get("url", ""))}
        for e in current
    ]

    if current_normalized == target_menu:
        print(f"✓ Déjà à jour, rien à écrire.")
        return 0

    # 4) Mettre à jour la clé site.outils_menu
    if target_menu:
        config["site"]["outils_menu"] = target_menu
        print(f"✓ Mise à jour : {len(target_menu)} entrée(s)")
        for entry in target_menu:
            print(f"   • {entry['label']} → {entry['url']}")
    else:
        if "outils_menu" in config["site"]:
            del config["site"]["outils_menu"]
            print(f"✓ Section retirée (aucun outil actif)")
        else:
            # Cas improbable : current existait mais était vide. On a rien à faire.
            print(f"✓ Rien à faire.")
            return 0

    # 5) Réécrire config.yaml
    with config_path.open("w", encoding="utf-8") as f:
        yaml.dump(config, f)

    print(f"✓ {config_path} mis à jour")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python _sync_outils_menu.py <site_slug>", file=sys.stderr)
        print("Exemple: python platform/scripts/_sync_outils_menu.py digicube-fr", file=sys.stderr)
        sys.exit(1)
    sys.exit(main(sys.argv[1]))
