#!/usr/bin/env python3
"""
Lance depuis le repo : python3 platform/scripts/clear_editorial.py --site entreprendrepourapprendre-org
Vide l'editorial.json du site pour forcer une régénération complète.
"""
import sys, json
from pathlib import Path

if '--site' not in sys.argv:
    print("Usage: python3 clear_editorial.py --site <site-slug>")
    sys.exit(1)

site_slug = sys.argv[sys.argv.index('--site') + 1]
site_dir = Path(__file__).parent.parent / 'sites' / site_slug
editorial_path = site_dir / 'editorial.json'

if editorial_path.exists():
    with open(editorial_path) as f:
        data = json.load(f)
    nb = len(data)
    # Vider uniquement les clés classement (garder les paires SCPI)
    keys_to_clear = [k for k in data if k.startswith('classement-')]
    for k in keys_to_clear:
        del data[k]
    with open(editorial_path, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✓ {len(keys_to_clear)} entrées classement supprimées sur {nb} total")
else:
    print(f"editorial.json introuvable : {editorial_path}")
