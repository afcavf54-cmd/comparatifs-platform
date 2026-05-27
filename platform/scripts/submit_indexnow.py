#!/usr/bin/env python3
"""
Soumet à IndexNow (Bing, Yandex, Naver, Seznam) UNIQUEMENT les URLs
nouvelles ou modifiées depuis la dernière soumission.

Stratégie (option 3 choisie par Julien le 27/05/2026) :
- 1ère exécution (indexation.json absent)   → soumet TOUTES les URLs
- Exécutions suivantes (incrémental)        → soumet uniquement :
    * URLs nouvelles (jamais soumises)
    * URLs modifiées (sitemap.xml <lastmod> > last_submitted_at)
    * URLs déjà soumises mais en erreur HTTP la dernière fois (retry)

Usage:
    python platform/scripts/submit_indexnow.py --site digicube-fr

Requiert :
- Variable d'env INDEXNOW_KEY (clé IndexNow, 8-128 chars hex)
- sitemap.xml généré dans platform/sites/<site>/output/

Met à jour :
- platform/sites/<site>/indexation.json (état historique par URL,
  lu ensuite par l'onglet Indexation du HUB)
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


# ────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────

def load_yaml(path: Path) -> dict:
    with open(path, encoding='utf-8') as f:
        return yaml.safe_load(f)


def parse_iso(s):
    """Parse une date ISO 8601 en datetime aware UTC, ou None."""
    if not s:
        return None
    try:
        s = s.replace('Z', '+00:00')
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def extract_url_dates_from_sitemap(sitemap_path: Path) -> dict:
    """
    Extrait toutes les URLs et leur <lastmod> du sitemap.xml.
    Retourne un dict {url: lastmod_iso or None}.
    """
    if not sitemap_path.exists():
        return {}
    tree = ET.parse(sitemap_path)
    root = tree.getroot()
    ns = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    result = {}
    for url_elem in root.findall('.//sm:url', ns):
        loc = url_elem.find('sm:loc', ns)
        lastmod = url_elem.find('sm:lastmod', ns)
        if loc is not None and loc.text:
            url = loc.text.strip()
            lastmod_text = lastmod.text.strip() if (lastmod is not None and lastmod.text) else None
            result[url] = lastmod_text
    return result


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


# ────────────────────────────────────────────────────────────────────────
# Logique principale : décider quelles URLs soumettre
# ────────────────────────────────────────────────────────────────────────

def classify_urls(state: dict, url_dates: dict, is_first_run: bool):
    """
    Décide quelles URLs soumettre en mode incrémental.

    Retourne 4 listes :
        - new_urls         : URLs jamais soumises (status absent du state)
        - modified_urls    : URLs déjà soumises mais <lastmod> plus récent
        - retry_urls       : URLs en erreur HTTP la dernière fois (à retenter)
        - skipped_urls     : URLs déjà OK et inchangées (on n'envoie pas)

    Si is_first_run == True, TOUTES les URLs vont dans `new_urls`.
    """
    new_urls = []
    modified_urls = []
    retry_urls = []
    skipped_urls = []

    state_urls = state.get('urls', {})

    for url, lastmod_iso in url_dates.items():
        if is_first_run:
            new_urls.append(url)
            continue

        entry = state_urls.get(url)
        if entry is None:
            # Jamais vue avant → nouvelle
            new_urls.append(url)
            continue

        last_code = entry.get('last_response_code', 0)
        if last_code not in (200, 202):
            # Erreur la dernière fois → retry
            retry_urls.append(url)
            continue

        # URL déjà soumise avec succès. Modifiée ?
        if not lastmod_iso:
            # Pas de lastmod dans sitemap → on ne sait pas, on skip pour ne
            # pas spammer Bing avec des URLs inchangées.
            skipped_urls.append(url)
            continue

        last_sub_iso = entry.get('last_submitted_at')
        lastmod_dt = parse_iso(lastmod_iso)
        last_sub_dt = parse_iso(last_sub_iso)

        if lastmod_dt and last_sub_dt and lastmod_dt > last_sub_dt:
            modified_urls.append(url)
        else:
            skipped_urls.append(url)

    return new_urls, modified_urls, retry_urls, skipped_urls


# ────────────────────────────────────────────────────────────────────────
# main()
# ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Soumet URLs d'un site à IndexNow.")
    parser.add_argument('--site', required=True, help='Slug du site (ex: digicube-fr)')
    parser.add_argument('--key', help='Clé IndexNow (sinon variable INDEXNOW_KEY)')
    parser.add_argument('--dry-run', action='store_true', help='Affiche les URLs sans soumettre')
    parser.add_argument('--force-all', action='store_true', help='Force la soumission de toutes les URLs (bypass le mode incrémental)')
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

    # 4) Extraire URLs + lastmod du sitemap
    sitemap_path = site_dir / 'output' / 'sitemap.xml'
    url_dates = extract_url_dates_from_sitemap(sitemap_path)
    if not url_dates:
        print(f"⚠ Aucune URL dans {sitemap_path}")
        sys.exit(0)

    # Filtre sécurité : seules les URLs du bon host
    url_dates = {u: d for u, d in url_dates.items() if host in u}

    # 5) Charger l'état d'indexation
    state_path = site_dir / 'indexation.json'
    is_first_run = (not state_path.exists()) or args.force_all
    state = load_indexation_state(state_path)
    state['site'] = args.site
    state['endpoint'] = INDEXNOW_ENDPOINT
    state['key_location'] = key_location

    now_iso = datetime.now(timezone.utc).isoformat()

    # 6) Classifier les URLs
    new_urls, modified_urls, retry_urls, skipped_urls = classify_urls(
        state, url_dates, is_first_run
    )
    urls_to_submit = new_urls + modified_urls + retry_urls

    mode = "1ère soumission (toutes les URLs)" if is_first_run else "incrémental"
    nb_with_lastmod = sum(1 for d in url_dates.values() if d)
    print(f"🔍 IndexNow — site : {args.site}")
    print(f"   host         : {host}")
    print(f"   keyLocation  : {key_location}")
    print(f"   mode         : {mode}")
    print(f"   URLs sitemap : {len(url_dates)} ({nb_with_lastmod} avec <lastmod>)")
    print(f"   → nouvelles  : {len(new_urls)}")
    print(f"   → modifiées  : {len(modified_urls)}")
    print(f"   → à retenter : {len(retry_urls)}")
    print(f"   → skip       : {len(skipped_urls)}")
    print(f"   = à soumettre : {len(urls_to_submit)}")

    if args.dry_run:
        print("\n[DRY-RUN] 10 premières URLs à soumettre :")
        for u in urls_to_submit[:10]:
            print(f"   - {u}")
        sys.exit(0)

    if not urls_to_submit:
        print("\n✓ Rien à soumettre — toutes les URLs sont à jour")
        # On met quand même à jour le state pour tracer ce run
        state['last_run_at'] = now_iso
        save_indexation_state(state_path, state)
        sys.exit(0)

    # 7) Soumettre par batches
    submitted_ok = 0
    submitted_err = 0
    last_code = 0
    nb_batches = (len(urls_to_submit) - 1) // BATCH_SIZE + 1

    for i in range(0, len(urls_to_submit), BATCH_SIZE):
        batch = urls_to_submit[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        print(f"\n→ Batch {batch_num}/{nb_batches} : {len(batch)} URLs...")

        code = submit_batch(host, key, key_location, batch)
        last_code = code

        if code in (200, 202):
            print(f"  ✓ HTTP {code} — accepté")
            submitted_ok += len(batch)
            status = 'submitted'
        else:
            print(f"  ⚠ HTTP {code} — non accepté (voir documentation IndexNow)")
            submitted_err += len(batch)
            status = 'error'

        # Tracker chaque URL individuellement
        for u in batch:
            entry = state['urls'].get(u, {
                'first_submitted_at': now_iso,
                'submitted_count': 0,
            })
            entry['last_submitted_at'] = now_iso
            entry['last_response_code'] = code
            entry['last_sitemap_lastmod'] = url_dates.get(u)
            entry['submitted_count'] = entry.get('submitted_count', 0) + 1
            entry['status'] = status
            state['urls'][u] = entry

    state['last_submitted_at'] = now_iso
    state['last_response_code'] = last_code
    state['last_run_at'] = now_iso
    state['total_urls_in_sitemap'] = len(url_dates)
    state['last_run_submitted_count'] = submitted_ok + submitted_err
    state['last_run_mode'] = mode

    # 8) Sauver l'état
    save_indexation_state(state_path, state)
    print(f"\n✅ {submitted_ok} URLs soumises avec succès"
          f"{', ' + str(submitted_err) + ' en erreur' if submitted_err else ''}")
    print(f"   État sauvegardé : {state_path}")


if __name__ == '__main__':
    main()
