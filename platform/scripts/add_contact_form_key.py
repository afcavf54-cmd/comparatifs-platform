#!/usr/bin/env python3
"""
Script autonome : ajoute la clé Web3Forms (contact_form_key) à tous les
platform/sites/*/config.yaml qui ne l'ont pas encore.

Idempotent : si la clé est déjà présente sur un site, ne fait rien pour
celui-ci. Préserve commentaires + ordre + indentation grâce à ruamel.yaml.

Usage :
  python platform/scripts/add_contact_form_key.py

Peut aussi tourner via GitHub Actions (workflow add-contact-form-key.yml).
"""

import sys
from pathlib import Path

try:
    from ruamel.yaml import YAML
except ImportError:
    print("❌ ruamel.yaml requis. Installer avec: pip install ruamel.yaml", file=sys.stderr)
    sys.exit(1)


# Clé Web3Forms commune à tous les sites de Viseoweb.
# Les messages soumis sont envoyés à contact@viseoweb.fr.
CONTACT_FORM_KEY = "eabd63c5-1744-4172-b8c0-8984db488f10"


def find_platform_dir() -> Path:
    """Localiser le dossier platform/ que ce script soit lancé depuis la
    racine du repo, depuis platform/scripts/, ou depuis un workflow GH Actions.
    """
    here = Path(__file__).resolve()
    candidates = [
        Path.cwd() / "platform",
        here.parent.parent,                       # platform/scripts/<this>
        here.parent.parent.parent / "platform",   # script in subfolder
        Path("platform"),                          # CWD
    ]
    for c in candidates:
        if c.is_dir() and (c / "sites").is_dir():
            return c.resolve()
    print("❌ Dossier platform/sites/ introuvable", file=sys.stderr)
    sys.exit(1)


def main():
    platform_dir = find_platform_dir()
    sites_dir = platform_dir / "sites"
    print(f"📁 Dossier sites : {sites_dir}")
    print(f"🔑 Clé Web3Forms : {CONTACT_FORM_KEY}")
    print()

    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.indent(mapping=2, sequence=4, offset=2)

    updated = 0
    skipped = 0
    errors = 0
    no_config = 0

    for site_dir in sorted(sites_dir.iterdir()):
        if not site_dir.is_dir():
            continue

        config_file = site_dir / "config.yaml"
        if not config_file.exists():
            print(f"  ⚠ {site_dir.name:35s} → pas de config.yaml")
            no_config += 1
            continue

        try:
            with open(config_file, "r", encoding="utf-8") as f:
                config = yaml.load(f)

            if not config:
                print(f"  ⚠ {site_dir.name:35s} → config.yaml vide")
                errors += 1
                continue

            # Le template Jinja accède à `site.contact_form_key`, donc la clé
            # doit être DANS la section `site:` du YAML.
            if "site" not in config or not hasattr(config["site"], "get"):
                print(f"  ⚠ {site_dir.name:35s} → pas de section `site:` trouvée")
                errors += 1
                continue

            site_block = config["site"]

            existing = site_block.get("contact_form_key", "")
            if existing == CONTACT_FORM_KEY:
                print(f"  ✓ {site_dir.name:35s} → déjà OK")
                skipped += 1
                continue

            # Ajouter ou remplacer
            action = "remplacée" if existing else "ajoutée"
            site_block["contact_form_key"] = CONTACT_FORM_KEY

            with open(config_file, "w", encoding="utf-8") as f:
                yaml.dump(config, f)

            print(f"  ✅ {site_dir.name:35s} → clé {action}")
            updated += 1

        except Exception as e:
            print(f"  ❌ {site_dir.name:35s} → erreur : {e}")
            errors += 1

    print()
    print("═" * 50)
    print(f"  Mis à jour    : {updated}")
    print(f"  Déjà OK       : {skipped}")
    print(f"  Pas de config : {no_config}")
    print(f"  Erreurs       : {errors}")
    print("═" * 50)

    # Code de sortie non-zéro si erreurs (pour que le workflow GH échoue)
    sys.exit(0 if errors == 0 else 1)


if __name__ == "__main__":
    main()
