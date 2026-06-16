---
title: Pourquoi votre export CSV SalesTrack CRM s'affiche mal
slug: 8837-pourquoi-votre-export-csv-salestrack-crm-s-affiche-mal
date: '2026-06-16T18:00:00+02:00'
categorie: Gestion d'entreprise
meta_title: 'Exporter les données SalesTrack CRM en CSV : les erreurs qui cassent le fichier'
meta_description: 'Export CSV SalesTrack CRM mal affiché dans Excel : encodage, séparateur, format de date... Découvrez comment corriger ces 3 problèmes en quelques minutes.'
min_words: 970
status: published
featured_image: /blog/8837-pourquoi-votre-export-csv-salestrack-crm-s-affiche-mal.jpg
link_anchors:
- text: comment exporter les données du CRM SalesTrack au format CSV
  max: 5
---

<p>J'ai perdu presque une heure là-dessus la semaine dernière. Mon export CSV depuis SalesTrack CRM s'ouvrait dans Excel avec tout sur une seule colonne, des caractères bizarres à la place des accents, et des dates complètement illisibles. Résultat : mon assistante a dû tout retraiter à la main avant de pouvoir envoyer les relances clients. Une heure de travail inutile, juste à cause d'un mauvais paramétrage d'export.</p>

<p>Si vous êtes dans la même situation, ce guide est fait pour vous. Je vais vous expliquer concrètement pourquoi ça arrive et comment y remédier, sans jargon inutile.</p>

<h2>Le vrai problème derrière un CSV mal affiché</h2>

<p>Un fichier CSV, c'est du texte brut. Rien de plus. Les données sont séparées par des virgules, des points-virgules, ou des tabulations selon le logiciel qui l'a généré. Le problème, c'est qu'Excel, LibreOffice, et Google Sheets n'interprètent pas tous ce fichier de la même façon.</p>

<p>SalesTrack CRM exporte par défaut avec un séparateur virgule et un encodage UTF-8. Excel en France, lui, attend souvent un encodage Windows-1252 et un séparateur point-virgule. Voilà d'où vient le chaos.</p>

<p>Les trois causes les plus fréquentes que j'ai rencontrées :</p>

<ul>
<li><strong>Mauvais encodage</strong> : vos accents (é, è, ç, à) s'affichent en symboles incompréhensibles</li>
<li>Séparateur non reconnu : tout s'empile dans la colonne A au lieu de se répartir correctement</li>
<li>Format de date américain : les dates s'affichent en MM/DD/YYYY au lieu de DD/MM/YYYY</li>
</ul>

<p>Bon, par contre, ce n'est pas un bug de SalesTrack à proprement parler. C'est une incompatibilité classique entre le logiciel CRM et votre outil de traitement. Mais ça n'empêche pas que c'est frustrant quand vous avez 400 lignes de données clients à analyser en urgence.</p>

<h2>Comment corriger l'affichage de votre export CSV étape par étape</h2>

<h3>Option 1 : Passer par l'import guidé d'Excel</h3>

<p>N'ouvrez jamais un CSV en double-cliquant dessus. C'est l'erreur la plus répandue. Excel l'ouvre directement sans vous demander comment l'interpréter, et c'est là que tout déraille.</p>

<p>Faites plutôt ça :</p>

<ol>
<li>Ouvrez Excel avec un classeur vide</li>
<li>Allez dans l'onglet "Données"</li>
<li>Cliquez sur "À partir d'un fichier texte/CSV"</li>
<li>Sélectionnez votre fichier SalesTrack</li>
<li>Dans l'assistant, choisissez l'encodage <strong>UTF-8</strong> et le séparateur virgule</li>
<li>Validez et importez</li>
</ol>

<p>Ça prend 45 secondes. J'ai formé deux personnes de mon équipe là-dessus en cinq minutes. Depuis, plus de problème de colonne unique.</p>

<h3>Option 2 : Modifier les paramètres d'export dans SalesTrack CRM</h3>

<p>SalesTrack propose parfois des options d'export avancées selon la version que vous utilisez. Dans les paramètres d'export, cherchez :</p>

<ul>
<li>Le choix du séparateur (virgule vs point-virgule)</li>
<li>L'encodage (UTF-8 avec BOM ou sans BOM)</li>
<li>Le format de date</li>
</ul>

<p>L'encodage <strong>UTF-8 avec BOM</strong> est souvent la solution miracle pour les utilisateurs d'Excel sur Windows. Le BOM, c'est un signal invisible au début du fichier qui indique à Excel comment lire les caractères. Sans lui, les accents partent en vrille.</p>

<p>Si votre version de SalesTrack ne propose pas ces options, contactez le support. Certaines versions entreprise ont ces réglages cachés dans les préférences administrateur.</p>

<h3>Option 3 : Utiliser Google Sheets comme intermédiaire</h3>

<p>Méthode que j'utilise souvent quand je suis en déplacement et que je n'ai pas le temps de tripoter les paramètres Excel. J'importe le CSV directement dans Google Sheets, qui gère l'UTF-8 nativement et sans friction. Ensuite, si besoin, j'exporte depuis Sheets vers Excel.</p>

<p>Ça fonctionne à 95% du temps pour les exports SalesTrack standard.</p>

<h2>Les erreurs de données, pas juste les erreurs d'affichage</h2>

<p>L'affichage c'est une chose. Mais parfois le problème va plus loin. Des données manquantes, des champs qui se décalent d'une colonne, ou des lignes en double après export.</p>

<p>J'ai eu ce cas précis avec un export de 800 contacts. Plusieurs champs "commentaires" contenaient des virgules dans le texte (exemple : "Intéressé, rappeler en septembre"), ce qui cassait la structure du fichier. Le CSV interprétait cette virgule comme un séparateur de colonne.</p>

<p>La règle pour éviter ça : dans SalesTrack, vérifiez que les champs texte longs sont bien entourés de guillemets dans l'export. Si ce n'est pas le cas, évitez d'utiliser des virgules dans vos notes et commentaires, ou basculez sur un séparateur point-virgule.</p>

<h3>Le tableau des problèmes les plus courants</h3>

<table>
<thead>
<tr>
<th>Symptôme visible</th>
<th>Cause probable</th>
<th>Solution rapide</th>
</tr>
</thead>
<tbody>
<tr>
<td>Tout dans une seule colonne</td>
<td>Mauvais séparateur reconnu par Excel</td>
<td>Import guidé, choisir "virgule"</td>
</tr>
<tr>
<td>Caractères bizarres (â, Ã©...)</td>
<td>Encodage UTF-8 non reconnu</td>
<td>Choisir UTF-8 avec BOM à l'export</td>
</tr>
<tr>
<td>Dates inversées (mois/jour)</td>
<td>Format américain MM/DD/YYYY</td>
<td>Reformater la colonne date dans Excel</td>
</tr>
<tr>
<td>Colonnes décalées sur certaines lignes</td>
<td>Virgule dans un champ texte non protégé</td>
<td>Mettre les champs texte entre guillemets</td>
</tr>
<tr>
<td>Lignes en double</td>
<td>Export avec filtre mal configuré</td>
<td>Vérifier les filtres actifs avant export</td>
</tr>
</tbody>
</table>

<h2>Quand le problème vient de SalesTrack lui-même</h2>

<p>J'ai un vrai reproche à faire à SalesTrack sur ce point. La documentation d'export est trop maigre. Ils supposent que vous savez déjà comment fonctionnent les CSV, ce qui n'est pas le cas de tout le monde dans une équipe de PME.</p>

<p>J'ai cherché pendant un moment si d'autres CRM géraient mieux ce point. C'est en fouillant des comparatifs que je suis tombé sur des guides pratiques, notamment sur comment utiliser le CRM SalesFlow Evolution, qui documente assez bien ses options d'export avec des captures d'écran et des paramètres pré-configurés pour Excel français. Ce genre de documentation devrait être un standard, pas une exception.</p>

<p>J'ai aussi vu des retours d'utilisateurs sur comment utiliser le CRM SmartLead Evolution, qui semble proposer un export "Excel-ready" directement depuis l'interface, sans avoir à manipuler l'encodage à la main. Ce n'est pas un détail pour quelqu'un qui exporte des données tous les lundis matin avant une réunion commerciale.</p>

<p>Ces comparaisons ne veulent pas dire qu'il faut quitter SalesTrack du jour au lendemain. Mais ça montre qu'on est en droit d'attendre mieux sur ce point précis.</p>

<h2>Automatiser pour ne plus y revenir</h2>

<p>Si vous exportez régulièrement depuis SalesTrack, il existe des façons de ne plus faire cette manipulation à la main à chaque fois.</p>

<p>La plus simple : créer une macro Excel qui formate automatiquement le CSV à l'ouverture. Ça demande 20 minutes à mettre en place une fois, et ensuite votre fichier est propre à chaque import. Quelqu'un dans votre équipe qui sait un peu utiliser VBA peut faire ça rapidement.</p>

<p>Autre piste : si SalesTrack propose une connexion API, vous pouvez récupérer les données directement dans Google Sheets via un script Apps Script ou dans Excel via Power Query. Vous court-circuitez complètement le CSV et ses problèmes d'encodage. Le résultat est propre, structuré, et mis à jour automatiquement.</p>

<p>J'ai mis en place cette synchronisation avec Power Query pour nos exports de pipeline commercial. <strong>On gagne facilement 30 à 40 minutes par semaine</strong> rien que là-dessus. Pour une petite équipe, ce temps compte vraiment.</p>

<p>Dernier point, et c'est peut-être le plus utile : créez un fichier de référence dans votre entreprise. Une page, pas plus. Avec les étapes exactes pour exporter proprement depuis SalesTrack, les réglages à choisir, et les pièges à éviter. Partagez-le à tous ceux qui touchent au CRM. Ça évite de réinventer la roue chaque fois qu'un nouveau collaborateur arrive ou qu'on change de version du logiciel.</p>

<p>Le problème du CSV mal affiché, c'est typiquement le genre de chose qui fait perdre du temps à des dizaines de personnes dans une entreprise, alors qu'une seule bonne documentation réglée une fois suffit à éliminer le problème pour tout le monde.</p>
