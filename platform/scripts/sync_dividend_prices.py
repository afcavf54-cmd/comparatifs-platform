#!/usr/bin/env python3
"""
sync_dividend_prices.py — Synchronise les PRIX des actions du simulateur de
dividendes depuis une API financière (Financial Modeling Prep par défaut).

Principe :
    - Lit platform/sites/<site>/dividendes-actions.json
    - Pour chaque action ACTIVE, récupère le prix courant via l'API
      (symbole = `fmp_symbol` si présent, sinon `ticker`).
    - Met à jour `price` et `price_updated_at` (ISO 8601).
    - En cas d'erreur sur une action : la loggue et CONTINUE avec les suivantes.
    - N'écrit le fichier QUE si au moins un prix a changé (idempotent).

Le dividende (`dividend`) N'EST JAMAIS touché : il est saisi manuellement.
L'API n'est appelée QUE depuis ce script serveur, jamais depuis le navigateur.

Env :
    FMP_API_KEY   clé Financial Modeling Prep (obligatoire)
    FMP_BASE      (optionnel) surcharge de l'URL de base de l'endpoint quote-short

Usage :
    python platform/scripts/sync_dividend_prices.py <site_slug>
    # ex : python platform/scripts/sync_dividend_prices.py monelor-com

Sortie :
    - Journalise chaque action (OK / erreur) sur stdout.
    - Code retour 0 si au moins une action traitée, 1 si erreur bloquante
      (clé absente, fichier introuvable). Les erreurs par action ne bloquent pas.
"""
from __future__ import annotations
import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

FMP_API_KEY = os.environ.get("FMP_API_KEY", "").strip()
# Endpoint "quote-short" : léger, renvoie [{symbol, price, volume}].
FMP_BASE = os.environ.get("FMP_BASE", "https://financialmodelingprep.com/api/v3/quote-short").rstrip("/")


def _log(msg: str) -> None:
    print(msg, flush=True)


def fetch_price(symbol: str) -> float:
    """Récupère le dernier prix pour un symbole. Lève une exception si indisponible."""
    if not symbol:
        raise ValueError("symbole vide")
    url = f"{FMP_BASE}/{urllib.parse.quote(symbol)}?apikey={FMP_API_KEY}"
    req = urllib.request.Request(url, headers={"User-Agent": "Monelor-DividendSync/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read().decode("utf-8", "ignore")
    data = json.loads(raw)
    if isinstance(data, dict) and data.get("Error Message"):
        raise ValueError(f"API : {data['Error Message'][:120]}")
    if isinstance(data, list) and data:
        price = data[0].get("price")
        if price is not None:
            return float(price)
    raise ValueError(f"prix absent dans la réponse ({raw[:100]})")


def main(site_slug: str) -> int:
    if not FMP_API_KEY:
        _log("❌ FMP_API_KEY manquante (secret non défini). Abandon.")
        return 1

    here = Path(__file__).resolve()
    platform_dir = here.parent.parent
    json_path = platform_dir / "sites" / site_slug / "dividendes-actions.json"
    if not json_path.is_file():
        _log(f"❌ Fichier introuvable : {json_path}")
        return 1

    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        _log(f"❌ JSON invalide : {e}")
        return 1

    actions = data.get("actions", [])
    active = [a for a in actions if a.get("active", True)]
    _log(f"🔄 Sync prix — {site_slug} : {len(active)} action(s) active(s) sur {len(actions)}")

    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    changed = 0
    errors = 0

    for a in active:
        symbol = (a.get("fmp_symbol") or a.get("ticker") or "").strip()
        name = a.get("name", "?")
        if not symbol:
            _log(f"  ⏭  {name} : aucun symbole (fmp_symbol/ticker vide) — ignoré")
            continue
        try:
            price = fetch_price(symbol)
            old = a.get("price")
            a["price"] = round(price, 4)
            a["price_updated_at"] = now_iso
            if old != a["price"]:
                changed += 1
            _log(f"  ✓ {name} ({symbol}) : {price}")
            time.sleep(0.25)  # politesse envers l'API (quota gratuit)
        except Exception as e:
            errors += 1
            _log(f"  ⚠ {name} ({symbol}) : ERREUR — {e}")
            continue

    # On réécrit toujours si au moins une action a été mise à jour (dates incluses).
    if changed or any(a.get("price_updated_at") == now_iso for a in active):
        data["prices_synced_at"] = now_iso
        json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        _log(f"💾 Écrit : {changed} prix modifié(s), {errors} erreur(s).")
    else:
        _log(f"✓ Aucun changement ({errors} erreur(s)).")

    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sync_dividend_prices.py <site_slug>", file=sys.stderr)
        sys.exit(1)
    sys.exit(main(sys.argv[1]))
