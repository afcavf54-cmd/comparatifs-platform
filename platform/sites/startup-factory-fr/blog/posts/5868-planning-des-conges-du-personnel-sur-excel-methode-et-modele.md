---
title: 'Planning des congés du personnel sur Excel : méthode et modèle'
slug: 5868-planning-des-conges-du-personnel-sur-excel-methode-et-modele
date: '2026-08-12T07:00:00+02:00'
categorie: Ressources Humaines
meta_title: 'Planning congés du personnel sur Excel : méthode et modèle'
meta_description: 'Gérez les congés de votre équipe avec un planning Excel efficace
  : calendrier automatisé, compteurs de jours et alertes pour éviter les conflits
  d''absences.'
min_words: 1300
status: published
featured_image: /blog/5868-planning-des-conges-du-personnel-sur-excel-methode-et-modele.jpg
link_anchors:
- text: planning des congés sous Excel
  max: 5
related_posts:
- 7613-logiciel-de-gestion-de-planning-gratuit-ce-qu-il-peut-faire
- 2892-creer-un-planning-du-personnel-sur-excel-methode-pas-a-pas
- 3688-planning-des-conges-du-personnel-comment-le-gerer-efficacement
- 4773-comment-organiser-un-planning-du-personnel-etapes-et-conseils
---
<p>J'ai longtemps géré les congés de mon équipe avec un simple fichier Excel. Pas glamour. Mais franchement, pour une boîte de 20 à 50 personnes avec zéro budget RH, ça fait le job si tu le construis correctement.</p>

<p>Le problème, c'est que la plupart des plannings que j'ai vus sont des catastrophes : couleurs aléatoires, pas de compteur de jours, aucune règle d'absence simultanée. Le fichier existe, mais personne ne le comprend vraiment. Résultat : des conflits d'absences en pleine période de rush, et des managers qui improvisent.</p>

<p>Je vais te montrer comment construire un vrai <strong>planning du personnel construit sous Excel</strong> qui automatise les calculs, évite les erreurs et tient la route même quand l'équipe grandit.</p>

<h2>Ce que doit vraiment faire un planning de congés sous Excel</h2>

<p>Un fichier Excel pour gérer les congés, ça sert à quoi exactement ? À deux choses : voir qui est absent quand, et savoir combien de jours il reste à chaque collaborateur. Si ton fichier ne fait pas ces deux choses clairement, tu pars d'une mauvaise base.</p>

<p>Concrètement, un bon planning doit :</p>

<ul>
  <li>Afficher les absences sur un calendrier mensuel ou annuel, par personne</li>
  <li>Comptabiliser automatiquement les jours pris et les jours restants</li>
  <li>Distinguer les types d'absences (congés payés, RTT, maladie, sans solde)</li>
  <li>Alerter visuellement quand deux personnes d'une même équipe sont absentes en même temps</li>
  <li>Être lisible par quelqu'un qui n'a jamais ouvert le fichier</li>
</ul>

<p>Ce dernier point, beaucoup l'oublient. Et c'est souvent là que tout s'effondre quand tu es en vacances toi-même.</p>

<h2>La méthode pour construire ton fichier étape par étape</h2>

<h3>L'architecture du fichier</h3>

<p>Je recommande un fichier avec <strong>au minimum trois onglets</strong> :</p>

<ul>
  <li>Un onglet "Paramètres" : liste des salariés, leur solde initial de congés, les jours fériés de l'année</li>
  <li>Un onglet "Planning" : le calendrier visuel avec une ligne par personne et une colonne par jour</li>
  <li>Un onglet "Suivi" : tableau récapitulatif des jours pris, des jours restants, des types d'absence</li>
</ul>

<p>Certains ajoutent un quatrième onglet pour les exports ou les demandes. Je le fais aussi, mais c'est optionnel selon ta taille d'équipe.</p>

<h3>Le calendrier : la partie qui prend le plus de temps</h3>

<p>C'est là que beaucoup abandonnent. Construire un calendrier dynamique sous Excel, ça demande quelques formules mais c'est faisable.</p>

<p>La clé : utilise une ligne pour les dates (en format numérique) et une ligne pour le jour de la semaine avec la formule <strong>=TEXTE(date;"jjj")</strong>. Ensuite, mets en forme conditionnelle les weekends et jours fériés pour qu'ils soient grisés automatiquement. Si tu ne le fais pas, tu vas compter des jours ouvrés à la main. Mauvaise idée.</p>

<p>Pour saisir une absence, la méthode la plus simple : tu tapes une lettre dans la cellule correspondante (CP pour congés payés, RTT, M pour maladie, etc.), et une mise en forme conditionnelle colore la cellule automatiquement. Ça prend 20 minutes à configurer, et ensuite tout est lisible d'un coup d'oeil.</p>

<h3>Le compteur de jours : automatise ou perd ton temps</h3>

<p>La formule de base pour compter les jours de congés payés pris :</p>

<p><strong>=NB.SI(plage_du_salarié;"CP")</strong></p>

<p>Tu adaptes pour chaque type d'absence. Ensuite tu crées une colonne "Jours restants" avec simplement le solde initial moins les jours pris. Basique, mais efficace.</p>

<p>Ce que j'ajoute souvent : une colonne qui <strong>alerte en rouge</strong> quand le solde descend en dessous de 2 jours. Ça évite les mauvaises surprises en fin d'année. J'ai formé deux salariés sur cette logique en une après-midi.</p>

<h3>La règle des absences simultanées</h3>

<p>C'est LE truc que personne ne configure. Pourtant c'est simple : une formule NB.SI sur une colonne de date qui compte combien de personnes d'une même équipe sont absentes ce jour-là. Si le résultat dépasse ton seuil (2 personnes pour une équipe de 5, par exemple), la cellule passe en orange.</p>

<p>Ça ne bloque rien, ça informe. Et ça évite qu'un manager valide une absence sans voir que trois autres personnes sont déjà parties cette semaine-là.</p>

<h2>Le suivi des congés du personnel : ce qu'on néglige souvent</h2>

<p>Un planning visuel c'est bien. Mais le <strong>suivi des congés du personnel</strong> au sens réel du terme, c'est aussi savoir qui a pris quoi sur l'année, détecter les anomalies, anticiper les périodes creuses.</p>

<p>Dans mon onglet "Suivi", j'ai un tableau comme celui-ci :</p>

<table>
  <thead>
    <tr>
      <th>Salarié</th>
      <th>Solde initial (CP)</th>
      <th>Jours pris</th>
      <th>Jours restants</th>
      <th>RTT pris</th>
      <th>Jours maladie</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Marie D.</td>
      <td>25</td>
      <td>18</td>
      <td>7</td>
      <td>4</td>
      <td>2</td>
    </tr>
    <tr>
      <td>Thomas R.</td>
      <td>25</td>
      <td>22</td>
      <td>3</td>
      <td>6</td>
      <td>0</td>
    </tr>
    <tr>
      <td>Julie M.</td>
      <td>25</td>
      <td>10</td>
      <td>15</td>
      <td>2</td>
      <td>5</td>
    </tr>
  </tbody>
</table>

<p>Tout est lié à l'onglet Planning via des formules. Si Marie ajoute une absence dans le calendrier, son solde se met à jour automatiquement dans ce tableau. Zéro ressaisie.</p>

<p>Ce tableau, je l'exporte une fois par mois en PDF et je l'envoie aux managers. C'est ça, un vrai <strong>planning des congés au format PDF</strong> : pas juste une capture d'écran, mais un document propre avec des données à jour que tu génères en deux clics depuis Excel (Fichier > Exporter > PDF).</p>

<h2>Les erreurs classiques à éviter absolument</h2>

<p>J'en ai fait la plupart, donc autant te les épargner.</p>

<p><strong>Erreur n°1 :</strong> un seul onglet pour tout. Planning, compteurs, paramètres tout mélangé. C'est illisible au bout d'un mois.</p>

<p>Erreur n°2 : ne pas verrouiller les cellules de formules. Un salarié ouvre le fichier, écrase une formule par accident, et le compteur affiche n'importe quoi pendant trois semaines avant que quelqu'un s'en rende compte. Protège les cellules avec formules. Toujours.</p>

<p>Erreur n°3 : oublier les jours fériés. Si tu ne les exclus pas du décompte, tu vas compter le 14 juillet comme un jour de congé payé. Pas top.</p>

<p>Là j'ai un vrai reproche à faire sur Excel en général : dès que tu dépasses 40-50 personnes, le fichier commence à ramer. Les formules imbriquées, les mises en forme conditionnelles sur des milliers de cellules... ça devient lourd. C'est une limite réelle.</p>

<h2>Faut-il vraiment rester sur Excel ou passer à autre chose ?</h2>

<p>Bonne question. Et ma réponse honnête : ça dépend de la taille de ton équipe et de ta tolérance à la maintenance.</p>

<p>Excel fonctionne très bien jusqu'à environ 30-40 personnes si quelqu'un maintient le fichier sérieusement. Au-delà, le risque d'erreur humaine augmente vite. Et si la personne qui maîtrise le fichier quitte la boîte... bonne chance pour déchiffrer les formules.</p>

<p>Les <strong>meilleurs outils de planning</strong> dédiés à la gestion des congés (comme Lucca, Factorial, Timmi Absences ou même des outils plus légers comme Teamup ou Bamboo HR) font tout ça automatiquement, avec des workflows de validation, des notifications email, une appli mobile. Certains coûtent moins de 3€ par salarié par mois.</p>

<p>Mon conseil : commence par Excel pour comprendre tes vrais besoins. Puis bascule vers un outil dédié quand la maintenance du fichier te prend plus de temps que la gestion elle-même. C'est un signal clair.</p>

<p>Voici une comparaison rapide pour t'aider à situer :</p>

<table>
  <thead>
    <tr>
      <th>Critère</th>
      <th>Excel maison</th>
      <th>Outil RH dédié</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Coût</td>
      <td>Gratuit (si tu as déjà Office)</td>
      <td>2 à 6€/salarié/mois</td>
    </tr>
    <tr>
      <td>Prise en main</td>
      <td>Rapide si le fichier est bien conçu</td>
      <td>1 à 3 jours en général</td>
    </tr>
    <tr>
      <td>Automatisation</td>
      <td>Partielle (formules manuelles)</td>
      <td>Complète (workflow, relances, notifications)</td>
    </tr>
    <tr>
      <td>Scalabilité</td>
      <td>Limite vers 40-50 personnes</td>
      <td>Adapté de 5 à 500 personnes</td>
    </tr>
    <tr>
      <td>Export PDF</td>
      <td>Manuel</td>
      <td>Automatique et planifiable</td>
    </tr>
    <tr>
      <td>Intégrations</td>
      <td>Aucune native</td>
      <td>SIRH, paie, Slack, Google Calendar...</td>
    </tr>
  </tbody>
</table>

<h2>FAQ : Planning des congés sous Excel</h2>

<h3>Comment gérer les congés sur Excel sans que ça devienne ingérable ?</h3>

<p>Structure ton fichier avec des onglets séparés (paramètres, planning, suivi), verrouille les cellules de formules, et désigne une seule personne responsable de la mise à jour. Si tout le monde modifie le fichier en même temps, ça part en vrille rapidement.</p>

<h3>Peut-on partager le fichier Excel avec toute l'équipe ?</h3>

<p>Oui, via SharePoint ou Google Drive si tu convertis en Google Sheets. L'édition simultanée reste risquée sur des fichiers avec beaucoup de formules. Je recommande plutôt de laisser un accès en lecture seule aux salariés et de centraliser les modifications chez un référent RH ou un manager.</p>

<h3>Comment exporter le planning en PDF proprement ?</h3>

<p>Sélectionne la plage de cellules à exporter, règle la mise en page (orientation paysage, ajustement à une page), puis Fichier > Exporter > PDF. Pour que le rendu soit propre, évite les cellules fusionnées en excès et utilise des bordures visibles. Un <strong>planning des congés au format PDF</strong> bien formaté se lit en 30 secondes, pas en 5 minutes.</p>

<h3>Quelle formule utiliser pour calculer les jours ouvrés entre deux dates ?</h3>

<p>La fonction <strong>=NB.JOURS.OUVRES(date_début;date_fin;jours_fériés)</strong> est ta meilleure amie. Tu lui passes une plage avec tes jours fériés en troisième argument, et elle exclut automatiquement les weekends et les fériés. Beaucoup plus fiable qu'un calcul manuel.</p>

<h3>À partir de combien de salariés faut-il quitter Excel ?</h3>

<p>Honnêtement, vers 30 à 40 personnes tu commences à sentir les limites. Pas impossibles à gérer, mais le risque d'erreur augmente. Et surtout, le temps passé à maintenir le fichier commence à coûter plus cher que l'abonnement à un outil dédié. C'est à ce moment-là que je te conseille de regarder les alternatives.</p>

<h3>Mon équipe n'est pas technique. Un fichier Excel complexe, c'est réaliste ?</h3>

<p>Si les formules sont bien cachées et les cellules de saisie clairement identifiées (fond de couleur différente, instructions dans des commentaires), oui. Le salarié n'a besoin que de taper une lettre dans une cellule. Pas besoin de comprendre ce qui se passe derrière. J'ai mis en place ce système avec des équipes terrain, ça marche.</p>
