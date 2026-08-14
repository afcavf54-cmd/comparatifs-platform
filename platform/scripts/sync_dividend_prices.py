#!/usr/bin/env python3
"""
sync_dividend_prices.py — Synchronise les PRIX des actions du simulateur de
dividendes depuis une source gratuite SANS clé ni compte.

Sources (dans l'ordre, avec repli automatique) :
    1. Yahoo Finance  (endpoint chart, symbole type "TTE.PA")
    2. Stooq          (CSV libre, symbole dérivé du ticker : "tte.fr")

Aucune clé API, aucun compte : ni Yahoo ni Stooq n'en demandent pour ces
endpoints. Les appels ne sont faits QUE côté serveur (ce script), jamais
depuis le navigateur.

Principe :
    - Lit platform/sites/<site>/dividendes-actions.json
    - Pour chaque action ACTIVE : récupère le prix (symbole = `fmp_symbol`
      si présent, sinon `ticker`).
    - Met à jour `price` et `price_updated_at` (ISO 8601).
    - En cas d'erreur sur une action : la loggue et CONTINUE.
    - Le dividende (`dividend`) n'est JAMAIS touché (saisie manuelle).

Usage :
    python platform/scripts/sync_dividend_prices.py <site_slug>
"""
from __future__ import annotations
import json
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def _log(msg: str) -> None:
    print(msg, flush=True)


def _get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "ignore")


def _yahoo(symbol: str) -> float:
    """Prix via Yahoo Finance (endpoint chart). Symbole type 'TTE.PA'."""
    if not symbol:
        raise ValueError("symbole vide")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range=1d&interval=1d"
    data = json.loads(_get(url))
    chart = data.get("chart") or {}
    res = chart.get("result") or []
    if res:
        meta = res[0].get("meta") or {}
        p = meta.get("regularMarketPrice")
        if p is not None:
            return float(p)
    raise ValueError(f"Yahoo: prix absent (err={chart.get('error')})")


def _stooq(ticker: str) -> float:
    """Prix via Stooq (CSV). Euronext Paris = '<ticker>.fr' en minuscules."""
    if not ticker:
        raise ValueError("ticker vide")
    s = ticker.lower()
    if "." not in s:
        s = s + ".fr"   # Euronext Paris sur Stooq
    url = f"https://stooq.com/q/l/?s={urllib.parse.quote(s)}&f=sd2t2ohlcv&h&e=csv"
    csv = _get(url).strip().splitlines()
    if len(csv) >= 2:
        cols = csv[0].split(",")
        vals = csv[1].split(",")
        row = dict(zip(cols, vals))
        close = row.get("Close", "")
        if close and close.upper() not in ("N/D", "N/A", ""):
            return float(close)
    raise ValueError(f"Stooq: prix absent ({csv[:2]})")


# Suffixe de place Yahoo Finance dérivé du pays (si fmp_symbol non renseigné).
# Sans suffixe, "TTE" tape la cotation US (TotalEnergies NYSE) au lieu de Paris !
EXCHANGE_SUFFIX = {
    "france": ".PA",
    "allemagne": ".DE", "germany": ".DE",
    "pays-bas": ".AS", "netherlands": ".AS",
    "belgique": ".BR", "belgium": ".BR",
    "espagne": ".MC", "spain": ".MC",
    "italie": ".MI", "italy": ".MI",
    "portugal": ".LS",
    "royaume-uni": ".L", "uk": ".L", "united kingdom": ".L",
    "suisse": ".SW", "switzerland": ".SW",
    "états-unis": "", "etats-unis": "", "usa": "", "us": "", "": "",
}


def market_symbol(a: dict) -> str:
    """Symbole marché pour Yahoo : `fmp_symbol` si renseigné, sinon
    ticker + suffixe de place déduit du pays (ex. TTE + France => TTE.PA)."""
    sym = (a.get("fmp_symbol") or "").strip()
    if sym:
        return sym
    tk = (a.get("ticker") or "").strip()
    if not tk or "." in tk:
        return tk
    suf = EXCHANGE_SUFFIX.get((a.get("country") or "").strip().lower(), "")
    return tk + suf


def fetch_price(symbol: str, ticker: str) -> tuple[float, str]:
    """Essaie Yahoo puis Stooq. Retourne (prix, source)."""
    errs = []
    try:
        return _yahoo(symbol or ticker), "Yahoo"
    except Exception as e:
        errs.append(f"Yahoo: {e}")
    try:
        return _stooq(ticker or symbol), "Stooq"
    except Exception as e:
        errs.append(f"Stooq: {e}")
    raise ValueError(" | ".join(errs))


def main(site_slug: str) -> int:
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
    touched = False

    for a in active:
        symbol = market_symbol(a)
        ticker = (a.get("ticker") or "").strip()
        name = a.get("name", "?")
        if not symbol and not ticker:
            _log(f"  ⏭  {name} : aucun symbole/ticker — ignoré")
            continue
        try:
            price, source = fetch_price(symbol, ticker)
            old = a.get("price")
            a["price"] = round(price, 4)
            a["price_updated_at"] = now_iso
            touched = True
            if old != a["price"]:
                changed += 1
            _log(f"  ✓ {name} ({symbol or ticker}) : {price} [{source}]")
            time.sleep(0.3)
        except Exception as e:
            errors += 1
            _log(f"  ⚠ {name} ({symbol or ticker}) : ERREUR — {e}")
            continue

    if touched:
        data["prices_synced_at"] = now_iso
        json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        _log(f"💾 Écrit : {changed} prix modifié(s), {errors} erreur(s).")
    else:
        _log(f"✓ Aucun prix récupéré ({errors} erreur(s)) — fichier inchangé.")

    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sync_dividend_prices.py <site_slug>", file=sys.stderr)
        sys.exit(1)
    sys.exit(main(sys.argv[1]))
