#!/usr/bin/env python3
"""
Génération de screenshots de sites de marques (comparateurs en masse).

Principe anti-duplicate :
  - 1 capture "MASTER" par marque, prise UNE SEULE fois via une API de
    screenshot, mise en cache dans platform/_screenshot_cache/<slug>.png
    (commitée au repo → réutilisée à chaque build, pas de re-capture).
  - Pour CHAQUE site, on recadre le master avec un DÉCALAGE de pixels propre
    au site (croissant : site #0 → 15px, #1 → 30px, #2 → 45px...). Deux sites
    n'obtiennent jamais le même recadrage → images visuellement différentes
    (pixels/octets différents) tout en partant de la même capture.
  - Si la marque n'a pas d'URL connue → aucune image (on ignore).

Providers (clé via env SCREENSHOT_API_KEY, provider via env SCREENSHOT_PROVIDER) :
  screenshotone (défaut) · apiflash · urlbox · thumio (sans clé, qualité moindre)
"""
import os
import io
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

# Nombre de tentatives de capture (ScreenshotOne renvoie parfois un HTTP 500/502
# transitoire sur un site lourd ou lent ; un retry suffit souvent). Réglable.
try:
    SHOT_RETRIES = max(1, int(os.environ.get("SCREENSHOT_RETRIES", "3")))
except (TypeError, ValueError):
    SHOT_RETRIES = 3

try:
    import requests
except Exception:
    requests = None
try:
    from PIL import Image
except Exception:
    Image = None

# ── Dimensions ─────────────────────────────────────────────────────────────
# Master volontairement plus grand que le crop final pour laisser de la marge
# de décalage (≈ (MASTER-CROP)/OFFSET_STEP sites avant de borner).
MASTER_W, MASTER_H = 1680, 1050
CROP_W, CROP_H = 1368, 683          # ratio ≈ celui de .logiciel-screenshot
OFFSET_STEP = 15                    # px de décalage par index de site

CACHE_DIR = Path(__file__).resolve().parent.parent / "_screenshot_cache"


def slugify(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s


def _api_url(provider: str, key: str, url: str) -> str | None:
    u = quote(url, safe="")
    if provider == "screenshotone":
        return (f"https://api.screenshotone.com/take?access_key={key}&url={u}"
                f"&viewport_width={MASTER_W}&viewport_height={MASTER_H}"
                f"&format=png&block_cookie_banners=true&block_ads=true"
                f"&block_banners_by_heuristics=true&cache=true&cache_ttl=2592000")
    if provider == "apiflash":
        return (f"https://api.apiflash.com/v1/urltoimage?access_key={key}&url={u}"
                f"&width={MASTER_W}&height={MASTER_H}&format=png"
                f"&no_cookie_banners=true&no_ads=true&response_type=image")
    if provider == "urlbox":
        return (f"https://api.urlbox.io/v1/{key}/png?url={u}"
                f"&width={MASTER_W}&height={MASTER_H}&block_cookies=true&retina=false")
    if provider == "thumio":
        return f"https://image.thum.io/get/width/{MASTER_W}/crop/{MASTER_H}/{url}"
    return None


def get_master(brand_slug: str, url: str, provider: str, key: str) -> Path | None:
    """Capture master de la marque (cache). None si échec / pas capturable."""
    if Image is None or requests is None:
        print("  ⚠ Pillow/requests manquant — screenshots désactivés")
        return None
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    master = CACHE_DIR / f"{brand_slug}.png"
    if master.exists() and master.stat().st_size > 1000:
        return master
    api_url = _api_url(provider, key, url)
    if not api_url:
        print(f"  ⚠ provider screenshot inconnu : {provider!r}")
        return None
    # Retry : un HTTP 500/502/503/429 ou un timeout ScreenshotOne est souvent
    # transitoire. On réessaie SHOT_RETRIES fois avec une petite pause.
    for attempt in range(SHOT_RETRIES):
        _last = ""
        try:
            r = requests.get(api_url, timeout=90)
            if r.status_code == 200 and r.content:
                img = Image.open(io.BytesIO(r.content)).convert("RGB")
                # Master au moins aussi grand que le crop + marge.
                if img.width < CROP_W or img.height < CROP_H:
                    img = img.resize((max(MASTER_W, img.width), max(MASTER_H, img.height)), Image.LANCZOS)
                img.save(master, "PNG")
                print(f"  ✓ master capturé : {brand_slug}"
                      + (f" (tentative {attempt+1})" if attempt else ""))
                return master
            _last = f"HTTP {r.status_code}"
        except Exception as e:
            _last = str(e)
        if attempt < SHOT_RETRIES - 1:
            print(f"  ⚠ screenshot {brand_slug}: {_last} — nouvelle tentative {attempt+2}/{SHOT_RETRIES}")
            time.sleep([3, 8, 15][attempt] if attempt < 3 else 15)
        else:
            print(f"  ⚠ screenshot {brand_slug}: {_last} — échec après {SHOT_RETRIES} tentative(s)")
    return None


def site_screenshot(brand_slug: str, url: str, site_index: int,
                    out_dir: Path, provider: str = None, key: str = None) -> str | None:
    """
    Produit l'image décalée de la marque pour CE site.
    Retourne le nom de fichier (<slug>-screenshot.png) relatif à out_dir, ou None.
    """
    if not url:
        return None
    provider = (provider or os.environ.get("SCREENSHOT_PROVIDER") or "screenshotone").strip()
    key = (key or os.environ.get("SCREENSHOT_API_KEY") or "").strip()
    if provider != "thumio" and not key:
        print("  ⚠ SCREENSHOT_API_KEY absente — screenshots ignorés")
        return None

    master = get_master(brand_slug, url, provider, key)
    if not master or Image is None:
        return None

    offset = (int(site_index) + 1) * OFFSET_STEP   # 15, 30, 45, ...
    try:
        img = Image.open(master).convert("RGB")
        w, h = img.size
        max_x = max(0, w - CROP_W)
        max_y = max(0, h - CROP_H)
        # décalage diagonal, borné par la taille du master
        x = min(offset, max_x)
        y = min(offset, max_y)
        crop = img.crop((x, y, x + CROP_W, y + CROP_H))
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        out_name = f"{brand_slug}-screenshot.png"
        crop.save(out_dir / out_name, "PNG")
        return out_name
    except Exception as e:
        print(f"  ⚠ recadrage {brand_slug}: {e}")
        return None


# ── Test CLI : python screenshot_gen.py <brand> <url> <site_index> <out_dir> ──
if __name__ == "__main__":
    if len(sys.argv) >= 4:
        b, u, i = sys.argv[1], sys.argv[2], int(sys.argv[3])
        out = Path(sys.argv[4]) if len(sys.argv) > 4 else Path(".")
        print(site_screenshot(slugify(b), u, i, out))
