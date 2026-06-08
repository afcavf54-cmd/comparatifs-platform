"""
_image_generator.py — Génération d'image à la une via OpenAI gpt-image-1.

Pipeline :
1. Construit le prompt depuis site name + theme colors + article title
2. Appelle OpenAI gpt-image-1 (quality='low', taille 1536x1024)
3. Décode le PNG base64
4. Convertit PNG → JPG quality 85 (réduction ~80% de la taille)
5. Injecte EXIF "photo Canon EOS R5 prise à Paris" pour effacer les traces IA
6. Retourne les bytes JPG prêts à écrire

Coût estimé : ~$0.011 par image en quality low.

Dépendances : pillow, piexif (à ajouter au requirements.txt / workflow).
"""
from __future__ import annotations

import base64
import io
import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timedelta

import piexif
from PIL import Image

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = "gpt-image-1"

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


def _call_openai_gpt_image(prompt: str) -> bytes:
    """Appelle OpenAI gpt-image-1 en quality 'low' et retourne les bytes PNG.
    Lève RuntimeError en cas d'erreur API."""
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY manquante")
    body = json.dumps({
        "model": OPENAI_MODEL,
        "prompt": prompt,
        "size": "1536x1024",   # paysage, idéal featured image
        "quality": "medium",   # bon compromis qualité/coût (~$0.042/image)
        "n": 1,
    }).encode("utf-8")
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
        # Timeout généreux : gpt-image-1 peut prendre 30-60s
        with urllib.request.urlopen(req, timeout=180) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI HTTP {e.code} : {err_body[:300]}")
    except Exception as e:
        raise RuntimeError(f"OpenAI appel échoué : {e}")

    data = payload.get("data") or []
    if not data:
        raise RuntimeError("OpenAI : réponse sans 'data'")
    b64 = data[0].get("b64_json")
    if not b64:
        raise RuntimeError("OpenAI : pas de b64_json dans data[0]")
    return base64.b64decode(b64)


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
        print("   ⚠ Image : OPENAI_API_KEY manquante, skip")
        return None
    try:
        prompt = _build_prompt(site_name, primary_color, secondary_color,
                                cta_color, article_title)
        png_bytes = _call_openai_gpt_image(prompt)
        jpg_bytes = _png_to_jpg_with_exif(png_bytes)
        return jpg_bytes
    except Exception as e:
        print(f"   ⚠ Image : génération échouée : {e}")
        return None
