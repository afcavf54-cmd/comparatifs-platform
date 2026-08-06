---
title: 'Calculer les heures de travail sur Excel : méthode pas à pas'
slug: 8420-calculer-les-heures-de-travail-sur-excel-methode-pas-a-pas
date: '2026-08-06T12:00:00+02:00'
categorie: Ressources Humaines
meta_title: 'Calculer ses heures de travail sur Excel : méthode'
meta_description: Calculer les heures de travail sur Excel sans erreur, c'est possible.
  Formules, formats de cellules et tableau pas à pas pour un suivi fiable dès aujourd'hui.
min_words: 1400
status: published
featured_image: /blog/8420-calculer-les-heures-de-travail-sur-excel-methode-pas-a-pas.jpg
link_anchors:
- text: calcul des heures de travail avec Excel
  max: 5
related_posts:
- 7341-tableau-de-calcul-des-heures-de-travail-structure-et-utilisation
- 8517-logiciel-de-pointage-en-ligne-comment-ca-fonctionne
- 2738-comment-calculer-les-heures-de-travail-de-ses-salaries
- 7253-suivi-du-temps-de-travail-methodes-et-outils-disponibles
---
<h2>Pourquoi j'ai passé 3 heures sur un tableau Excel avant de comprendre que je faisais faux</h2>

<p>J'ai lancé ma boîte il y a 4 ans. Petite équipe, budget serré. Pendant longtemps, le <strong>calcul des heures de travail</strong> se faisait à la main, dans un carnet. Puis j'ai basculé sur Excel en me disant que ça allait tout régler. Spoiler : ça ne règle rien si tu ne sais pas quelles formules utiliser.</p>

<p>J'ai passé un moment à bidouiller des cellules, à additionner des horaires qui donnaient des résultats bizarres (genre 36:00 qui s'affichait 12:00), à me demander pourquoi mes totaux ne correspondaient pas. Bref, j'ai fait toutes les erreurs classiques. Cet article, c'est pour que toi tu les évites.</p>

<p>Je vais te montrer comment construire un tableau opérationnel, étape par étape. Pas de théorie. Du concret.</p>

<h2>Préparer son fichier Excel : les bases à ne pas rater</h2>

<p>Avant même d'écrire une formule, la structure du tableau fait tout. Un mauvais format de cellule et tes calculs partiront en vrille. C'est le truc que j'ai compris un peu tard.</p>

<p>Voici comment j'organise mes colonnes. Adapte selon ta situation, mais cette base fonctionne pour une équipe de 1 à 10 personnes sans complexité particulière :</p>

<ul>
  <li>Colonne A : Date (format jj/mm/aaaa)</li>
  <li>Colonne B : Heure d'arrivée</li>
  <li>Colonne C : Heure de départ</li>
  <li>Colonne D : Pause (en heures, format décimal ou hh:mm)</li>
  <li>Colonne E : Total heures travaillées</li>
  <li>Colonne F : Heures théoriques (ce que tu dois à l'employé ou à toi-même)</li>
  <li>Colonne G : Écart (E - F)</li>
</ul>

<p>Le point critique : <strong>formate toutes tes colonnes horaires en [h]:mm</strong>. Pas en "hh:mm". La différence ? Le format [h]:mm autorise des valeurs supérieures à 24 heures. Sans ça, dès que tu additionnes une semaine entière, Excel tronque. Et tu te retrouves avec des totaux qui ne veulent rien dire.</p>

<p>Pour appliquer ce format : clic droit sur les cellules, Format de cellule, Personnalisé, et tu tapes <em>[h]:mm</em> à la main. Simple, mais ça change tout.</p>

<h3>Le format décimal, une alternative plus simple</h3>

<p>Perso, j'ai fini par passer en décimal pour les calculs. 7h30 = 7,5. 8h15 = 8,25. C'est moins "joli" à lire, mais les formules sont tellement plus simples. Tu additionnes des chiffres normaux, pas des heures. Aucun risque de bug d'affichage.</p>

<p>Pour convertir un horaire en décimal dans Excel : si ton heure est en B2, tu écris <em>=B2*24</em>. Excel stocke les heures en fractions de journée (1 = 24h), donc tu multiplies par 24 pour obtenir des heures "réelles" en nombre décimal.</p>

<h2>Les formules concrètes pour calculer les heures travaillées</h2>

<p>Exemple de situation : ton salarié arrive à 8h30, part à 18h15, avec 1h de pause. Tu veux calculer le nombre d'heures effectives.</p>

<p>Formule de base si tes cellules sont en format heure :</p>

<p><em>=(C2-B2-D2)*24</em></p>

<p>Résultat : 8,75 heures, soit 8h45. Propre, direct.</p>

<p>Si tu gardes tout en format [h]:mm sans conversion décimale :</p>

<p><em>=C2-B2-D2</em></p>

<p>Ça fonctionne, mais pour additionner ensuite, ta colonne de total doit absolument être en <strong>[h]:mm</strong> sinon tu perds les heures qui dépassent minuit ou 24h.</p>

<h3>Calculer le total hebdomadaire</h3>

<p>Admettons que tes heures journalières sont en E2 à E6 (lundi au vendredi). Le total de la semaine :</p>

<p><em>=SOMME(E2:E6)</em></p>

<p>Rien de sorcier. Le problème vient toujours du format. Si ton total affiche 3 alors que tu t'attends à 40, c'est que la cellule est formatée en "heure" et non en "[h]:mm". Change le format, le chiffre se recalcule instantanément.</p>

<h3>Gérer les heures supplémentaires automatiquement</h3>

<p>Colonne G, l'écart. Si tes heures théoriques sont en F2 (mettons 8h soit 0.333... si format fraction, ou 8 si format décimal) :</p>

<p><em>=E2-F2</em></p>

<p>Un résultat positif = heures sup. Négatif = déficit. Pour afficher uniquement les heures sup :</p>

<p><em>=MAX(0;E2-F2)</em></p>

<p>Et pour cumuler les heures sup sur le mois, tu fais une SOMME sur toute la colonne G. J'ai mis 2 jours à réaliser que cette formule MAX me sauvait la vie. Bon, par contre, si tu veux aussi suivre les déficits, il faut une colonne séparée avec <em>=MIN(0;E2-F2)</em>. Deux colonnes distinctes, c'est plus lisible.</p>

<h2>Un tableau récapitulatif mensuel : ce que j'utilise vraiment</h2>

<p>Voilà une version simplifiée du tableau que j'ai mis en place pour suivre les heures de mon équipe. Je l'ai construit sur deux onglets : un onglet "Saisie" et un onglet "Récap".</p>

<table>
  <tr>
    <th>Colonne</th>
    <th>Contenu</th>
    <th>Format recommandé</th>
  </tr>
  <tr>
    <td>A</td>
    <td>Date</td>
    <td>jj/mm/aaaa</td>
  </tr>
  <tr>
    <td>B</td>
    <td>Heure arrivée</td>
    <td>[h]:mm</td>
  </tr>
  <tr>
    <td>C</td>
    <td>Heure départ</td>
    <td>[h]:mm</td>
  </tr>
  <tr>
    <td>D</td>
    <td>Pause</td>
    <td>Décimal (ex : 1 = 1h)</td>
  </tr>
  <tr>
    <td>E</td>
    <td>Heures travaillées</td>
    <td>Décimal</td>
  </tr>
  <tr>
    <td>F</td>
    <td>Heures contractuelles</td>
    <td>Décimal</td>
  </tr>
  <tr>
    <td>G</td>
    <td>Solde (sup ou déficit)</td>
    <td>Décimal</td>
  </tr>
  <tr>
    <td>H</td>
    <td>Commentaire</td>
    <td>Texte libre</td>
  </tr>
</table>

<p>L'onglet "Récap" tire les totaux par salarié avec des SOMME.SI. Par exemple, si la colonne A contient les prénoms et E les heures, pour calculer le total d'un salarié "Marc" :</p>

<p><em>=SOMME.SI(A:A;"Marc";E:E)</em></p>

<p>C'est basique mais ça tourne. Pour une petite équipe, ça suffit largement.</p>

<h2>Le calcul de l'annualisation du temps de travail sur Excel : possible, mais costaud</h2>

<p>Là, ça se complique. Le <strong>calcul de l'annualisation du temps de travail</strong> consiste à vérifier que sur l'année entière, le salarié a bien effectué son volume d'heures contractuelles, en tenant compte des semaines hautes et basses, des jours fériés, des congés.</p>

<p>Sur Excel, c'est faisable. J'ai essayé. Voilà ce que ça implique :</p>

<ul>
  <li>Un calendrier annuel avec les jours fériés à saisir manuellement (ou avec une formule SERIE.JOURS.OUVRES si tu veux automatiser)</li>
  <li>Un suivi des congés par salarié</li>
  <li>Un compteur de solde annuel qui se met à jour chaque semaine</li>
  <li>Des formules conditionnelles pour exclure les jours non travaillés du calcul</li>
</ul>

<p>Honnêtement ? Le fichier devient vite ingérable. J'ai construit une version qui fonctionnait, mais la moindre absence imprévue cassait 3 formules. Franchement, ça m'a agacé. Pour une personne seule ou un duo, ok. Au-delà, tu perds plus de temps à maintenir le fichier qu'il ne t'en fait gagner.</p>

<h3>Les limites concrètes d'Excel pour ce cas</h3>

<p>Pas de gestion des modifications d'historique. Si quelqu'un change une cellule par erreur, c'est foutu. Pas de validation des données robuste. Pas d'alerte automatique quand un salarié atteint son plafond d'heures annuel. Tout ça, tu dois le coder toi-même en VBA ou en acceptant les limites.</p>

<p>J'ai perdu du temps là-dessus. La conclusion que j'en tire : Excel pour le suivi mensuel, oui. Pour l'annualisation complète d'une équipe, il faut passer à autre chose.</p>

<h2>Logiciel gratuit de calcul des heures de travail : quand Excel ne suffit plus</h2>

<p>Il existe des alternatives. Gratuites ou presque. Si tu cherches un <strong>logiciel gratuit de calcul des heures de travail</strong>, voici ce que j'ai testé ou vu tourner chez des confrères.</p>

<p><strong>Toggl Track</strong> : gratuit jusqu'à 5 utilisateurs, interface propre, timer intégré. Pas de gestion de paie, mais le suivi des heures est nickel. Export CSV vers Excel si tu veux garder la main sur tes données.</p>

<p><strong>Clockify</strong> : gratuit sans limite d'utilisateurs sur la version de base. J'ai un ami qui l'utilise pour son équipe de 4. Il est fan. Reporting basique mais suffisant. Là où ça coince : les fonctionnalités avancées (rapports détaillés, intégrations) sont payantes.</p>

<p><strong>TimeCamp</strong> : version gratuite disponible, suivi automatique des apps utilisées. Plus intrusif selon ton usage. Pratique pour du travail en remote.</p>

<p>Pour aller plus loin dans ton choix d'outil, jette un oeil au <a href="https://startuponly.com/meilleur-logiciel-de-pointage">comparatif des solutions de pointage</a>, qui liste et compare les options disponibles selon la taille de ton équipe et ton budget.</p>

<h3>Ce que je ferais à ta place avec un budget quasi nul</h3>

<p>Si t'as 1 à 3 personnes dans l'équipe : garde Excel. Bien configuré, avec le modèle que je t'ai décrit, ça tient la route sans dépenser un centime. Compte une heure de setup au départ, et roule.</p>

<p>Si t'as 4 personnes ou plus, ou si tu veux de l'annualisation propre : passe sur Clockify ou un outil dédié. Le gain de temps est réel. Et ça évite les erreurs humaines sur les saisies.</p>

<h2>3 erreurs que tout le monde fait sur Excel au départ</h2>

<p>Je les ai toutes faites. Je te les liste pour que tu gagnes du temps.</p>

<ul>
  <li><strong>Oublier de formater les cellules en [h]:mm</strong> : résultat, les totaux sont faux dès qu'on dépasse 24h de cumul. Classique.</li>
  <li>Mélanger les formats dans une même colonne : une cellule en décimal, une en hh:mm, une en texte. Excel ne plante pas toujours, mais les calculs deviennent aléatoires. Crois-moi, j'ai vu des trucs.</li>
  <li>Pas de protection des cellules de formule : un salarié remplit son tableau, écrase une formule sans s'en rendre compte, le fichier est corrompu. Prends 5 minutes pour verrouiller les cellules à ne pas modifier (Révision, Protéger la feuille).</li>
</ul>

<p>Bonus : ne mets jamais tes données brutes et tes formules dans le même onglet sans distinction visuelle. Couleur différente, cellules verrouillées, peu importe. Mais sépare les zones de saisie des zones de calcul.</p>

<h2>Est-ce qu'Excel reste pertinent en 2025 pour gérer les heures ?</h2>

<p>Oui, clairement. Pour une petite équipe, c'est gratuit, flexible, et tout le monde sait à peu près s'en servir. Le calcul des heures de travail sur Excel reste une solution viable quand tu ne veux pas investir dans un logiciel RH.</p>

<p>Mais soyons clairs : Excel ne remplace pas un vrai outil de pointage dès que tu as des besoins un peu plus poussés. Congés, annualisation, alertes automatiques, historique protégé... Ces fonctionnalités existent dans des outils souvent moins chers qu'on ne le croit.</p>

<p>Mon conseil : commence sur Excel, construis ton tableau proprement, et réévalue dans 6 mois. Si tu passes plus de 30 minutes par semaine à maintenir ton fichier, c'est le signal pour passer à un outil dédié.</p>

<p>T'as une petite équipe, un budget limité, et tu veux arrêter de galérer avec tes feuilles de paie. Le bon tableau Excel, bien foutu, bien formaté, c'est déjà un vrai gain. Lance-toi.</p>
