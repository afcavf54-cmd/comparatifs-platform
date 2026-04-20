
4m 12s
Run CMD="python platform/scripts/enrich_editorial.py --site entreprendrepourapprendre-org --skip-existing"
🤖 Enrich editorial — site : entreprendrepourapprendre-org (2026)
   Modèle : claude-sonnet-4-20250514
  ✓ 5 produits depuis Sheet
  📊 Site classement détecté — génération classements uniquement
  📊 Génération classements (1 catégories)...
  [Création d’entreprise en ligne] 5 produits... 
    → prompts custom détectés
    [intro]... ✓
    [contenu_custom]... ✓
    [faq]... ✓
    [desc LegalPlace]... ✓
    [desc Legal Start]... ✓
    [desc Dougs]... ✓
    [desc Qonto]... ✓
    [desc Swapn]... ✓
  ✓ Création d’entreprise en ligne généré
  [desc LegalPlace]... ✓
  [desc Legal Start]... ✓
  [desc Dougs]... ✓
  [desc Qonto]... ✓
  [desc Swapn]... ✓
✅ Enrichissement terminé pour entreprendrepourapprendre-org
1s
Run python platform/scripts/generate.py --site entreprendrepourapprendre-org
  
Traceback (most recent call last):
  File "/home/runner/work/comparatifs-platform/comparatifs-platform/platform/scripts/generate.py", line 664, in <module>
    main()
  File "/home/runner/work/comparatifs-platform/comparatifs-platform/platform/scripts/generate.py", line 658, in main
    generate_site(args.site, dry_run=args.dry_run, filter_pair=filter_pair)
  File "/home/runner/work/comparatifs-platform/comparatifs-platform/platform/scripts/generate.py", line 488, in generate_site
    html = template.render(**context)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/Python/3.12.13/x64/lib/python3.12/site-packages/jinja2/environment.py", line 1295, in render
🚀 Génération site : entreprendrepourapprendre-org
  📥 Chargement Sheet CSV...
  ✓ Sheet : 5 produits chargés
   5 produits → 10 paires
  Template : classement-saas.html.j2
  ✓ editorial.json : 6 paires chargées
  ✓ products_editorial.json : 0 produits
  ✓ site_editorial.json chargé
    self.environment.handle_exception()
  File "/opt/hostedtoolcache/Python/3.12.13/x64/lib/python3.12/site-packages/jinja2/environment.py", line 942, in handle_exception
    raise rewrite_traceback_stack(source=source)
  File "/home/runner/work/comparatifs-platform/comparatifs-platform/platform/templates/classement-saas.html.j2", line 1, in top-level template code
    {% extends "base/comparatif-vs-base.html.j2" %}
    ^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/runner/work/comparatifs-platform/comparatifs-platform/platform/templates/base/comparatif-vs-base.html.j2", line 296, in top-level template code
    {% block comparaison_detail %}
  ^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/runner/work/comparatifs-platform/comparatifs-platform/platform/templates/classement-saas.html.j2", line 114, in block 'comparaison_detail'
    {% for prod in products[:5] %}
^^^^^^^^^^^^^^^^^^^^^^^^^
jinja2.exceptions.UndefinedError: 'products' is undefined
Error: Process completed with exit code 1.
