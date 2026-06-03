#!/usr/bin/env python3
"""
Détecte et répare les `config.yaml` foireux dans platform/sites/*/

Bug récurrent du wizard HUB : quand une string est longue, elle est sortie
sur 2 lignes avec un orphelin terminé par un `"`, alors que la 1re ligne
avait déjà un guillemet fermant. Exemple :

    home_title: "Startup Only : idées, stratégies et croissance pour les startups"
        business"
    home_description: "Startup Only partage actualités, ..."
        outils SaaS et services innovants pour accompagner ..."

Résultat : ruamel.yaml et pyyaml plantent avec "expected <block end>, but
found <scalar>" sur la ligne orpheline.

Ce script :
1. Parcourt tous les `platform/sites/<site>/config.yaml`
2. Tente de parser chacun
3. Pour ceux qui plantent, applique un fix automatique :
   - Détecte les lignes orphelines (indentées, sans `:`, terminées par `"`)
   - Les fusionne avec la ligne précédente (en joignant le texte)
4. Re-valide le YAML après fix
5. Optionnellement écrit le fichier corrigé (mode --write)

Usage :
    # Dry-run (par défaut) : juste un rapport, n'écrit rien
    python3 platform/scripts/_fix_config_yaml.py

    # Apply : écrit les fichiers corrigés
    python3 platform/scripts/_fix_config_yaml.py --write

    # Sur un site précis
    python3 platform/scripts/_fix_config_yaml.py --site startup-factory-fr --write
"""
from __future__ import annotations
import sys
import re
import argparse
from pathlib import Path

try:
    import yaml as pyyaml  # PyYAML, plus tolérant que ruamel mais détecte aussi l'erreur
except ImportError:
    print("❌ PyYAML manquant : pip install pyyaml")
    sys.exit(1)


REPO_ROOT = Path(__file__).resolve().parents[2]
SITES_DIR = REPO_ROOT / "platform" / "sites"


def try_parse(yaml_text: str) -> tuple[bool, str]:
    """Retourne (succès, message_erreur). Utilise PyYAML car suffit pour
    détecter le pattern fautif sans demander ruamel."""
    try:
        pyyaml.safe_load(yaml_text)
        return True, ""
    except pyyaml.YAMLError as e:
        return False, str(e)


# Pattern pour détecter une ligne orpheline : indentation 2+ espaces,
# pas de `:` (sinon c'est une nouvelle clé), terminée par `"` ou un fragment
# probablement à fusionner. On exige aussi que la ligne précédente se termine
# par `"` (string complète) pour bien matcher le bug.
ORPHAN_LINE_RE = re.compile(r'^(\s{2,})([^:\n][^"\n]*)"?\s*$')


def repair_yaml(yaml_text: str) -> tuple[str, list[str]]:
    """Tente de réparer le pattern wizard.

    Heuristique :
    - On parcourt les lignes une par une
    - Quand on rencontre une ligne qui termine par `"` ET contient `:` (donc
      c'est une clé YAML quotée complète), on regarde la ligne suivante
    - Si la suivante est indentée plus que la clé, ne contient pas `:`, et
      ressemble à un fragment orphelin (avec ou sans `"` à la fin), on la
      considère comme un orphelin à fusionner ou à supprimer.
    - Décision : on **SUPPRIME** l'orphelin (plus safe que la fusion, parce
      qu'on ne sait pas si la 1re version ou la 2e était la "bonne"). Le
      wizard met souvent un copier/coller où la 1re ligne est la valeur
      désirée et la 2e est un reste de l'ancienne valeur.

    Retourne (yaml_corrigé, log_des_actions).
    """
    lines = yaml_text.splitlines(keepends=False)
    out: list[str] = []
    actions: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        # Détection : ligne = `<indent><key>: "...."` complète, suivie d'un orphelin
        if re.match(r'^(\s+)[a-zA-Z_][a-zA-Z0-9_]*:\s+".+"\s*$', line):
            key_indent = len(line) - len(line.lstrip())
            # Regarde les lignes suivantes : tant qu'elles sont indentées
            # plus que la clé ET ne ressemblent pas à une nouvelle clé,
            # ce sont des orphelins.
            j = i + 1
            while j < len(lines):
                next_line = lines[j]
                if not next_line.strip():
                    break  # ligne vide = fin du bloc
                next_indent = len(next_line) - len(next_line.lstrip())
                if next_indent <= key_indent:
                    break  # remontée à un niveau supérieur = fin
                # Si la ligne contient `:` à un niveau >=2 indent, c'est probablement
                # une nouvelle clé enfant — pas un orphelin
                if re.match(r'^\s+[a-zA-Z_][a-zA-Z0-9_-]*\s*:', next_line):
                    break
                # C'est un orphelin → on saute
                actions.append(f"  Ligne {j+1} supprimée (orphelin) : {next_line.strip()!r}")
                j += 1
            i = j
            continue
        i += 1
    return "\n".join(out) + ("\n" if yaml_text.endswith("\n") else ""), actions


def process_site(site_dir: Path, write: bool) -> dict:
    """Retourne un dict {site, ok, error, actions, fixed}."""
    config_path = site_dir / "config.yaml"
    result = {"site": site_dir.name, "ok": False, "error": "", "actions": [], "fixed": False}
    if not config_path.exists():
        result["error"] = "config.yaml inexistant"
        return result
    yaml_text = config_path.read_text(encoding="utf-8")
    ok, err = try_parse(yaml_text)
    if ok:
        result["ok"] = True
        return result
    # YAML invalide → tenter une réparation
    result["error"] = err.splitlines()[0] if err else "?"
    repaired, actions = repair_yaml(yaml_text)
    result["actions"] = actions
    if not actions:
        # Aucun pattern reconnu → impossible de fixer auto
        return result
    ok2, err2 = try_parse(repaired)
    if not ok2:
        result["error"] += f" | après réparation : {err2.splitlines()[0]}"
        return result
    result["fixed"] = True
    if write:
        config_path.write_text(repaired, encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--write", action="store_true",
                        help="Écrit les fichiers corrigés (sinon dry-run)")
    parser.add_argument("--site", default=None,
                        help="Limite à un site précis (par défaut : tous)")
    args = parser.parse_args()

    if not SITES_DIR.exists():
        print(f"❌ Dossier introuvable : {SITES_DIR}")
        return 1

    sites = sorted([d for d in SITES_DIR.iterdir() if d.is_dir() and not d.name.startswith(".")])
    if args.site:
        sites = [d for d in sites if d.name == args.site]
        if not sites:
            print(f"❌ Site introuvable : {args.site}")
            return 1

    print(f"🔍 Scan de {len(sites)} site(s) — mode {'WRITE' if args.write else 'DRY-RUN'}\n")
    results = [process_site(s, args.write) for s in sites]

    ok = [r for r in results if r["ok"]]
    fixed = [r for r in results if r["fixed"]]
    broken = [r for r in results if not r["ok"] and not r["fixed"]]

    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"✓ OK              : {len(ok)} site(s)")
    print(f"🔧 Réparés        : {len(fixed)} site(s)")
    print(f"❌ Encore cassés  : {len(broken)} site(s)")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

    if fixed:
        print("🔧 Sites réparés :")
        for r in fixed:
            print(f"  - {r['site']}  ({len(r['actions'])} ligne(s) orpheline(s) supprimée(s))")
            for action in r["actions"][:5]:
                print(action)
            if len(r["actions"]) > 5:
                print(f"    ... et {len(r['actions']) - 5} autres")
        print()

    if broken:
        print("❌ Sites encore cassés (intervention manuelle requise) :")
        for r in broken:
            print(f"  - {r['site']}")
            print(f"    Erreur : {r['error']}")
        print()

    if fixed and not args.write:
        print("⚠ Mode DRY-RUN : aucune modification écrite.")
        print("  Pour appliquer : relance avec --write")
        print()

    return 0 if not broken else 2


if __name__ == "__main__":
    sys.exit(main())
