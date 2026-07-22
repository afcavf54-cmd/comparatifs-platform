#!/usr/bin/env python3
"""
setup_domain.py — Associe les domaines custom au projet Cloudflare Pages
et crée la règle de redirection 301 www ↔ naked.

Usage: python platform/scripts/setup_domain.py <site_slug> <account_id> <api_token>
"""
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path
import yaml

def cf_request(method, url, api_token, data=None):
    payload = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url, data=payload, method=method,
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())
    except Exception as e:
        return {"success": False, "errors": [{"message": str(e)}]}


def main():
    if len(sys.argv) < 4:
        print("Usage: setup_domain.py <site_slug> <account_id> <api_token>")
        sys.exit(1)

    site_slug   = sys.argv[1]
    account_id  = sys.argv[2]
    api_token   = sys.argv[3]

    # Charge le config
    config_path = Path(f"platform/sites/{site_slug}/config.yaml")
    if not config_path.exists():
        print(f"⚠ Config introuvable : {config_path}")
        sys.exit(0)

    with open(config_path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    site_cfg = cfg.get("site", {})
    raw_domain = site_cfg.get("domain", "")
    raw_domain = (raw_domain
                  .replace("https://www.", "")
                  .replace("https://", "")
                  .replace("http://", "")
                  .strip("/"))

    if not raw_domain:
        print("⚠ Aucun domaine configuré")
        sys.exit(0)

    www_pref = site_cfg.get("www_preference", "www")
    base = f"https://api.cloudflare.com/client/v4"

    # ── 1. Associe les deux versions du domaine au projet Pages ──────────────
    for variant in [raw_domain, f"www.{raw_domain}"]:
        result = cf_request(
            "POST",
            f"{base}/accounts/{account_id}/pages/projects/{site_slug}/domains",
            api_token,
            {"name": variant}
        )
        if result.get("success"):
            print(f"  ✓ Domaine associé : {variant}")
        elif any(e.get("code") == 8000037 for e in result.get("errors", [])):
            print(f"  ✓ Domaine déjà associé : {variant}")
        else:
            print(f"  ⚠ {variant} : {result.get('errors', '')}")

    # ── 2. Récupère le Zone ID ────────────────────────────────────────────────
    zone_result = cf_request(
        "GET",
        f"{base}/zones?name={raw_domain}",
        api_token
    )
    zones = zone_result.get("result", [])
    if not zones:
        print(f"  ⚠ Zone introuvable pour {raw_domain} — règle 301 ignorée")
        sys.exit(0)

    zone_id = zones[0]["id"]

    # ── 3. Crée la règle de redirection 301 via Page Rules ───────────────────
    if www_pref == "www":
        match_url  = f"http://{raw_domain}/*"
        target_url = f"https://www.{raw_domain}/$1"
        match_https = f"https://{raw_domain}/*"
    else:
        match_url  = f"http://www.{raw_domain}/*"
        target_url = f"https://{raw_domain}/$1"
        match_https = f"https://www.{raw_domain}/*"

    for pattern in [match_url, match_https]:
        rule_payload = {
            "targets": [{"target": "url", "constraint": {"operator": "matches", "value": pattern}}],
            "actions": [{"id": "forwarding_url", "value": {"url": target_url, "status_code": 301}}],
            "status": "active",
            "priority": 1
        }
        rule_result = cf_request(
            "POST",
            f"{base}/zones/{zone_id}/pagerules",
            api_token,
            rule_payload
        )
        if rule_result.get("success"):
            print(f"  ✓ Page Rule 301 : {pattern} → {target_url}")
        elif any("already exists" in str(e) for e in rule_result.get("errors", [])):
            print(f"  ✓ Page Rule déjà existante : {pattern}")
        else:
            print(f"  ⚠ Page Rule : {rule_result.get('errors', '')}")

    # ── 4. Purge le cache de la zone ─────────────────────────────────────────
    # Sans ça, les pages supprimées (articles, classements dépubliés…) restent
    # servies depuis le cache edge Cloudflare jusqu'à expiration de leur TTL.
    # On purge donc toute la zone après chaque déploiement pour que les
    # changements soient visibles immédiatement.
    purge = cf_request(
        "POST",
        f"{base}/zones/{zone_id}/purge_cache",
        api_token,
        {"purge_everything": True}
    )
    if purge.get("success"):
        print(f"  ✓ Cache Cloudflare purgé (zone {raw_domain})")
    else:
        print(f"  ⚠ Purge cache échouée : {purge.get('errors', '')}")
        print("    → le token CLOUDFLARE_API_TOKEN doit avoir la permission "
              "« Zone → Cache Purge → Purge ».")


if __name__ == "__main__":
    main()
