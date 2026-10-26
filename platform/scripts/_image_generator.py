"""
_image_generator.py — Génération d'image à la une via OpenAI gpt-image-2.

Pipeline :
1. Construit le prompt depuis site name + theme colors + article title
2. Appelle OpenAI gpt-image-2 (quality='medium', taille 1536x1024)
3. Décode le PNG base64
4. Convertit PNG → JPG quality 85 (réduction ~80% de la taille)
5. Injecte EXIF "photo Canon EOS R5 prise à Paris" pour effacer les traces IA
6. Retourne les bytes JPG prêts à écrire

Historique des modèles OpenAI (IMPORTANT — ils changent) :
  - dall-e-2 / dall-e-3 : RETIRÉS le 12/05/2026.
  - gpt-image-1         : RETIRÉ le 23/10/2026 (remplacé par gpt-image-2).
  - Actuels (API)       : gpt-image-2 (flagship), gpt-image-1.5, gpt-image-1-mini.
Toute la famille gpt-image renvoie du base64 (jamais de 'response_format').
Le modèle est pilotable sans toucher au code via l'env OPENAI_IMAGE_MODELS
(liste séparée par des virgules, ex: "gpt-image-2,gpt-image-1-mini").

Dépendances : pillow, piexif (à ajouter au requirements.txt / workflow).
"""
from __future__ import annotations

import base64
import io
import json
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta

import piexif
from PIL import Image

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = "gpt-image-2"


def _report_diag(msg: str) -> None:
    """Loggue un diagnostic image ET, si on tourne dans GitHub Actions, l'écrit
    dans le résumé du run (GITHUB_STEP_SUMMARY) pour qu'il soit visible en haut
    de la page du run, sans avoir à fouiller les logs d'étape."""
    print(msg)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        try:
            with open(summary, "a", encoding="utf-8") as fh:
                fh.write(f"- 🖼️ {msg.strip()}\n")
        except Exception:
            pass

# Coordonnées GPS de Paris (centre, près de Notre-Dame). Plausibles pour une
# photo prise par un photographe pro en mission éditoriale.
PARIS_LAT = 48.8566
PARIS_LON = 2.3522


def _to_dms_rational(value: float) -> tuple:
    """Convertit une coordonnée GPS décimale en (deg, min, sec) au format
    EXIF Rational (tuples de (numerator, denominator))."""
    abs_value = abs(value)
    deg = int(abs_value)
    min_float = (abs_value - deg) * 60
    minutes = int(min_float)
    sec = (min_float - minutes) * 60
    return ((deg, 1), (minutes, 1), (int(sec * 100), 100))


def _build_exif_paris() -> bytes:
    """Blob EXIF cohérent avec une photo prise à Paris par un Canon EOS R5.
    Tous les champs habituellement remplis par les logiciels Adobe sont
    injectés pour éviter tout signal "image IA" dans les métadonnées.

    La date de prise est calée 2 jours avant maintenant pour ne pas
    coïncider exactement avec le push GitHub (signal subtil mais réel)."""
    photo_date = datetime.now() - timedelta(days=2, hours=14)
    date_str = photo_date.strftime("%Y:%m:%d %H:%M:%S")

    zeroth_ifd = {
        piexif.ImageIFD.Make: b"Canon",
        piexif.ImageIFD.Model: b"Canon EOS R5",
        piexif.ImageIFD.Software: b"Adobe Photoshop 25.5 (Macintosh)",
        piexif.ImageIFD.DateTime: date_str.encode(),
        piexif.ImageIFD.Artist: b"",
        piexif.ImageIFD.Copyright: b"",
        piexif.ImageIFD.XResolution: (240, 1),
        piexif.ImageIFD.YResolution: (240, 1),
        piexif.ImageIFD.ResolutionUnit: 2,  # inches
    }

    exif_ifd = {
        piexif.ExifIFD.DateTimeOriginal: date_str.encode(),
        piexif.ExifIFD.DateTimeDigitized: date_str.encode(),
        piexif.ExifIFD.LensMake: b"Canon",
        piexif.ExifIFD.LensModel: b"RF 24-70mm F2.8 L IS USM",
        piexif.ExifIFD.FNumber: (28, 10),         # f/2.8
        piexif.ExifIFD.ExposureTime: (1, 200),    # 1/200s
        piexif.ExifIFD.ISOSpeedRatings: 200,
        piexif.ExifIFD.FocalLength: (50, 1),      # 50mm
        piexif.ExifIFD.ColorSpace: 1,             # sRGB
    }

    gps_ifd = {
        piexif.GPSIFD.GPSVersionID: (2, 2, 0, 0),
        piexif.GPSIFD.GPSLatitudeRef: b"N" if PARIS_LAT >= 0 else b"S",
        piexif.GPSIFD.GPSLatitude: _to_dms_rational(PARIS_LAT),
        piexif.GPSIFD.GPSLongitudeRef: b"E" if PARIS_LON >= 0 else b"W",
        piexif.GPSIFD.GPSLongitude: _to_dms_rational(PARIS_LON),
        piexif.GPSIFD.GPSAltitudeRef: 0,
        piexif.GPSIFD.GPSAltitude: (35, 1),       # ~35m, élévation moyenne Paris
    }

    exif_dict = {
        "0th": zeroth_ifd,
        "Exif": exif_ifd,
        "GPS": gps_ifd,
        "1st": {},
        "thumbnail": None,
    }
    return piexif.dump(exif_dict)


def _build_prompt(site_name: str, primary_color: str, secondary_color: str,
                   cta_color: str, article_title: str) -> str:
    """Construit le prompt OpenAI en suivant exactement la structure validée
    par Julien. Ne pas modifier sans accord."""
    # Note importante : gpt-image-1 a une forte tendance à inventer du texte
    # gribouillé sur les images même quand on demande "pas de texte". Pour
    # contrer ça efficacement il faut :
    #   1. Répéter l'interdiction en français ET en anglais (le modèle comprend
    #      les deux et la redondance bilingue augmente le respect de la consigne)
    #   2. Lister explicitement ce qui est interdit (lettres, mots, chiffres,
    #      labels, watermark) plutôt que juste "pas de texte"
    #   3. Mettre la consigne en MAJUSCULES + en fin de prompt (priorité forte)
    return f"""Pour le site "{site_name}"

 Couleur principale : {primary_color}
 Couleur secondaire : {secondary_color}
 Couleur des boutons CTA : {cta_color}

 Peux tu me générer une image pour illustrer cet article : "{article_title}"

 JE VEUX UNE IMAGE STYLE ILLUSTRATION.

 CONSIGNE ABSOLUE : AUCUN TEXTE sur l'image. Aucune lettre, aucun mot, aucun
 chiffre, aucun label, aucun titre, aucun watermark, aucun logo. Image
 purement visuelle, 100% sans texte.
 ABSOLUTE RULE: NO TEXT in the image. No letters, no words, no numbers, no
 labels, no captions, no watermarks. Pure visual illustration only."""


class _OpenAIImageError(RuntimeError):
    """Erreur d'appel image OpenAI, portant le code HTTP (ou None pour une
    erreur réseau) afin de distinguer un échec DÉFINITIF (400/401/403/404 :
    modèle indispo, clé invalide, paramètre refusé — inutile de réessayer) d'un
    échec TRANSITOIRE (429, 5xx, timeout — à réessayer)."""
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def _http_get_bytes(url: str, timeout: int = 120) -> bytes:
    """Télécharge le contenu binaire d'une URL (image renvoyée par dall-e-3)."""
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _call_openai_image(model: str, prompt: str, size: str, quality: str) -> bytes:
    """Appelle l'API images d'OpenAI pour un modèle donné et retourne les bytes
    de l'image. Gère les deux formats de réponse :
      - gpt-image-1 : renvoie TOUJOURS du b64_json (pas de response_format).
      - dall-e-3    : renvoie une URL par défaut → on télécharge l'image.
    On n'envoie JAMAIS 'response_format' : dall-e-3 le refuse sur ce compte
    (erreur 400 'Unknown parameter'), et gpt-image-1 ne l'accepte pas non plus.
    Lève _OpenAIImageError (avec code HTTP) en cas d'erreur."""
    if not OPENAI_API_KEY:
        raise _OpenAIImageError(None, "OPENAI_API_KEY manquante")
    payload = {"model": model, "prompt": prompt, "size": size, "quality": quality, "n": 1}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data_resp = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise _OpenAIImageError(e.code, f"HTTP {e.code} : {err_body[:300]}")
    except Exception as e:
        raise _OpenAIImageError(None, f"appel échoué : {e}")

    data = data_resp.get("data") or []
    if not data:
        raise _OpenAIImageError(None, "réponse sans 'data'")
    item = data[0]
    b64 = item.get("b64_json")
    if b64:
        return base64.b64decode(b64)
    url = item.get("url")
    if url:
        try:
            return _http_get_bytes(url)
        except Exception as e:
            raise _OpenAIImageError(None, f"téléchargement de l'image échoué : {e}")
    raise _OpenAIImageError(None, "ni b64_json ni url dans data[0]")


def _png_to_jpg_with_exif(png_bytes: bytes, jpeg_quality: int = 85) -> bytes:
    """Convertit PNG → JPG compressé + injection EXIF "photo Paris"."""
    img = Image.open(io.BytesIO(png_bytes))
    # PNG peut être RGBA (transparence), JPG ne supporte pas → composite
    # sur fond blanc pour ne pas avoir de noir là où il y avait transparence.
    if img.mode in ("RGBA", "LA"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    exif_bytes = _build_exif_paris()
    out = io.BytesIO()
    img.save(
        out,
        format="JPEG",
        quality=jpeg_quality,
        optimize=True,
        progressive=True,  # progressive JPEG = mieux pour le web
        exif=exif_bytes,
    )
    return out.getvalue()


def generate_featured_image(
    site_name: str,
    primary_color: str,
    secondary_color: str,
    cta_color: str,
    article_title: str,
) -> bytes | None:
    """Génère une image à la une JPG compressée + EXIF Paris depuis un titre.
    Retourne les bytes JPG prêts à écrire sur disque, ou None en cas d'échec.

    Loggue mais ne lève PAS d'exception : un échec image ne doit pas bloquer
    la publication de l'article (le générateur principal continuera sans
    image si on retourne None).
    """
    if not OPENAI_API_KEY:
        _report_diag("Image : OPENAI_API_KEY manquante dans l'environnement du run — aucune image générée.")
        return None
    prompt = _build_prompt(site_name, primary_color, secondary_color,
                           cta_color, article_title)
    # Liste des modèles tentés, dans l'ordre. gpt-image-2 est le modèle phare
    # actuel (remplace gpt-image-1, retiré le 23/10/2026) ; gpt-image-1-mini
    # sert de repli (moins cher, même famille). dall-e-2/3 et gpt-image-1 sont
    # RETIRÉS → ne pas les remettre. Pilotable sans toucher au code via l'env
    # OPENAI_IMAGE_MODELS (ex: "gpt-image-1-mini" seul, ou
    # "gpt-image-2,gpt-image-1.5"). Toute la famille gpt-image renvoie du
    # base64 (pas de response_format). Un échec DÉFINITIF (400/401/403/404)
    # passe immédiatement au modèle suivant, sans réessayer inutilement.
    _params = {
        "gpt-image-2":      ("1536x1024", "medium"),
        "gpt-image-1.5":    ("1536x1024", "medium"),
        "gpt-image-1-mini": ("1536x1024", "medium"),
    }
    _env_models = os.environ.get("OPENAI_IMAGE_MODELS", "").strip()
    if _env_models:
        names = [m.strip() for m in _env_models.split(",") if m.strip()]
    else:
        names = ["gpt-image-2", "gpt-image-1-mini"]
    models = [(n, *_params.get(n, ("1536x1024", "medium"))) for n in names]

    PERMANENT = {400, 401, 403, 404}
    last_err = None
    for model, size, quality in models:
        for attempt in range(2):
            try:
                png_bytes = _call_openai_image(model, prompt, size, quality)
                if model != names[0]:
                    print(f"   ℹ Image : générée via {model} (repli)")
                return _png_to_jpg_with_exif(png_bytes)
            except Exception as e:
                last_err = e
                status = getattr(e, "status", None)
                print(f"   ⚠ Image : {model} échec ({e})")
                if status in PERMANENT:
                    # Indispo / clé / paramètre refusé : inutile de réessayer
                    # ce modèle, on passe au suivant.
                    break
                if attempt < 1:
                    time.sleep(4 * (attempt + 1))
    _report_diag(f"Image : génération échouée sur tous les modèles ({', '.join(names)}). Dernière erreur OpenAI : {last_err}")
    return None
