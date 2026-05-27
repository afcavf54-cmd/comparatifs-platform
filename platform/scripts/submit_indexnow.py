#!/usr/bin/env python3
"""
Soumet toutes les URLs d'un site à IndexNow (Bing, Yandex, Naver, Seznam).

Usage:
    python platform/scripts/submit_indexnow.py --site digicube-fr

Requiert :
- Variable d'env INDEXNOW_KEY (clé IndexNow, 8-128 chars hex)
- sitemap.xml généré dans platform/sites/<site>/output/

Met à jour :
- platform/sites/<site>/indexation.json (état historique des soumissions
  par URL, lu ensuite par l'onglet Indexation du HUB)
"""

import argparse
import json
import os
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import requests
import yaml


INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
BATCH_SIZE = 10000  # Max par requête IndexNow (limite officielle)


def load_yaml(path: Path) -> dict:
    with open(path, encoding='utf-8') as f:
        return yaml.safe_load(f)


def extract_urls_from_sitemap(sitemap_path: Path) -> list:
    """Extrait toutes les URLs <loc> d'un sitemap.xml."""
    if not sitemap_path.exists():
        return []
    tree = ET.parse(sitemap_path)
    root = tree.getroot()
    ns = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    return [loc.text.strip() for loc in root.findall('.//sm:loc', ns) if loc.text]


def load_indexation_state(state_path: Path) -> dict:
    """Charge l'état d'indexation (ou retourne un état vide)."""
    if not state_path.exists():
        return {'site': '', 'last_submitted_at': None, 'urls': {}}
    try:
        return json.loads(state_path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError):
        return {'site': '', 'last_submitted_at': None, 'urls': {}}


def save_indexation_state(state_path: Path, state: dict):
    """Sauvegarde l'état d'indexation en JSON."""
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(
        json.dumps(state, indent=2, ensure_ascii=False),
        encoding='utf-8'
    )


def submit_batch(host: str, key: str, key_location: str, urls: list) -> int:
    """Soumet un batch d'URLs à IndexNow. Retourne le code HTTP (0 si erreur réseau)."""
    payload = {
        "host": host,
        "key": key,
        "keyLocation": key_location,
        "urlList": urls,
    }
    headers = {"Content-Type": "application/json; charset=utf-8"}
    try:
        r = requests.post(INDEXNOW_ENDPOINT, json=payload, headers=headers, timeout=30)
        return r.status_code
    except requests.exceptions.RequestException as e:
        print(f"  ❌ Erreur réseau : {e}")
        return 0


def main():
    parser = argparse.ArgumentParser(description="Soumet URLs d'un site à IndexNow.")
    parser.add_argument('--site', required=True, help='Slug du site (ex: digicube-fr)')
    parser.add_argument('--key', help='Clé IndexNow (sinon variable INDEXNOW_KEY)')
    parser.add_argument('--dry-run', action='store_true', help='Affiche les URLs sans soumettre')
    args = parser.parse_args()

    # 1) Récupérer la clé
    key = args.key or os.environ.get('INDEXNOW_KEY')
    if not key:
        print("❌ INDEXNOW_KEY non définie (--key ou variable d'env)")
        sys.exit(1)

    # 2) Localiser le site
    script_dir = Path(__file__).resolve().parent
    platform_dir = script_dir.parent
    site_dir = platform_dir / 'sites' / args.site
    if not site_dir.exists():
        print(f"❌ Site introuvable : {site_dir}")
        sys.exit(1)

    # 3) Lire config.yaml pour le domaine
    config = load_yaml(site_dir / 'config.yaml')
    site_cfg = (config.get('site') or {})
    domain_raw = site_cfg.get('domain', '').rstrip('/')
    if not domain_raw:
        print("❌ site.domain manquant dans config.yaml")
        sys.exit(1)

    host = domain_raw.replace('https://', '').replace('http://', '').rstrip('/')
    www_pref = site_cfg.get('www_preference', 'www')
    if www_pref == 'www' and not host.startswith('www.'):
        host = 'www.' + host

    key_location = f"https://{host}/{key}.txt"

    # 4) Extraire URLs du sitemap
    sitemap_path = site_dir / 'output' / 'sitemap.xml'
    all_urls = extract_urls_from_sitemap(sitemap_path)
    if not all_urls:
        print(f"⚠ Aucune URL dans {sitemap_path}")
        sys.exit(0)

    # 5) Filtrer aux URLs du bon host (sécurité : un sitemap externe ne peut
    #    pas faire soumettre n'importe quel domaine via notre clé)
    urls = [u for u in all_urls if host in u]

    print(f"🔍 IndexNow — site : {args.site}")
    print(f"   host         : {host}")
    print(f"   keyLocation  : {key_location}")
    print(f"   URLs trouvées : {len(urls)}")

    if args.dry_run:
        print("\n[DRY-RUN] 10 premières URLs :")
        for u in urls[:10]:
            print(f"   - {u}")
        sys.exit(0)

    # 6) Charger l'état d'indexation
    state_path = site_dir / 'indexation.json'
    state = load_indexation_state(state_path)
    state['site'] = args.site
    state['endpoint'] = INDEXNOW_ENDPOINT
    state['key_location'] = key_location

    now_iso = datetime.now(timezone.utc).isoformat()

    # 7) Soumettre par batches
    submitted = 0
    last_code = 0
    nb_batches = (len(urls) - 1) // BATCH_SIZE + 1

    for i in range(0, len(urls), BATCH_SIZE):
        batch = urls[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        print(f"\n→ Batch {batch_num}/{nb_batches} : {len(batch)} URLs...")

        code = submit_batch(host, key, key_location, batch)
        last_code = code

        if code in (200, 202):
            print(f"  ✓ HTTP {code} — accepté")
            submitted += len(batch)
            status = 'submitted'
        else:
            print(f"  ⚠ HTTP {code} — non accepté (voir documentation IndexNow)")
            status = 'error'

        # Tracker chaque URL individuellement
        for u in batch:
            entry = state['urls'].get(u, {
                'first_submitted_at': now_iso,
                'submitted_count': 0,
            })
            entry['last_submitted_at'] = now_iso
            entry['last_response_code'] = code
            entry['submitted_count'] = entry.get('submitted_count', 0) + 1
            entry['status'] = status
            state['urls'][u] = entry

    state['last_submitted_at'] = now_iso
    state['last_response_code'] = last_code
    state['total_urls'] = len(urls)
    state['total_submitted'] = submitted

    # 8) Sauver l'état
    save_indexation_state(state_path, state)
    print(f"\n✅ {submitted}/{len(urls)} URLs soumises à IndexNow")
    print(f"   État sauvegardé : {state_path}")


if __name__ == '__main__':
    main()
