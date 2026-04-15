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

    # ── 3. Crée la règle de redirection 301 ──────────────────────────────────
    if www_pref == "www":
        expression = f'(http.host eq "{raw_domain}")'
        target     = f"https://www.{raw_domain}"
    else:
        expression = f'(http.host eq "www.{raw_domain}")'
        target     = f"https://{raw_domain}"

    rule_payload = {
        "rules": [{
            "description": "www redirect",
            "expression": expression,
            "action": "redirect",
            "action_parameters": {
                "from_value": {
                    "status_code": 301,
                    "target_url": {
                        "expression": f'concat("{target}", http.request.uri.path)'
                    },
                    "preserve_query_string": True
                }
            },
            "enabled": True
        }]
    }

    rule_result = cf_request(
        "PUT",
        f"{base}/zones/{zone_id}/rulesets/phases/http_request_redirect/entrypoint",
        api_token,
        rule_payload
    )

    if rule_result.get("success"):
        src = raw_domain if www_pref == "www" else f"www.{raw_domain}"
        dst = f"www.{raw_domain}" if www_pref == "www" else raw_domain
        print(f"  ✓ Règle 301 : {src} → {dst}")
    else:
        print(f"  ⚠ Règle 301 : {rule_result.get('errors', '')}")


if __name__ == "__main__":
    main()
