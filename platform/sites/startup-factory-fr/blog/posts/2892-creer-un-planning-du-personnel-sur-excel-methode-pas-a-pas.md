---
title: 'Créer un planning du personnel sur Excel : méthode pas à pas'
slug: 2892-creer-un-planning-du-personnel-sur-excel-methode-pas-a-pas
date: '2026-08-08T17:00:00+02:00'
categorie: Ressources Humaines
meta_title: 'Planning du personnel sur Excel : méthode pas à pas'
meta_description: 'Créez un planning du personnel sur Excel pas à pas : structure, formules et automatisation pour gérer une équipe de 10 à 30 personnes sans abonnement logiciel.'
min_words: 1400
status: published
featured_image: /blog/2892-creer-un-planning-du-personnel-sur-excel-methode-pas-a-pas.jpg
link_anchors:
- text: planning du personnel construit sous Excel
  max: 5
---

<p>Excel, j'y suis revenue plus souvent que je ne le pensais. Même avec des outils SaaS partout, j'ai continué à gérer les plannings de mon équipe sur des fichiers. Pas par nostalgie. Par pragmatisme. Quand ton équipe grossit vite et que tu n'as pas envie de payer un abonnement pour vingt postes, Excel fait le job. À condition de savoir comment le construire correctement.</p>

<p>Je vais te montrer exactement comment je structure un planning du personnel sur Excel, depuis la base jusqu'à l'automatisation partielle. Pas de théorie. Du concret.</p>

<h2>Ce qu'il te faut avant de commencer</h2>

<p>Avant d'ouvrir Excel, pose-toi deux minutes. Un planning raté, c'est presque toujours un planning construit sans réfléchir à ce qu'on veut lire dedans. J'ai fait cette erreur au début. J'avais un tableau joli, mais illisible à la deuxième semaine.</p>

<p>Ce dont tu as besoin en amont :</p>

<ul>
  <li>La liste complète de tes salariés (prénom, poste, contrat)</li>
  <li>Les horaires types de ton activité (amplitude, pauses, week-ends travaillés ou non)</li>
  <li>Le nombre de semaines ou de mois à couvrir</li>
  <li>Les contraintes légales de base : repos obligatoire, plafond d'heures hebdo</li>
</ul>

<p>Une équipe de 10 à 30 personnes, c'est faisable sur Excel sans perdre la tête. Au-delà, je te dirai franchement ce que je pense plus bas.</p>

<h2>Construire la structure du tableau, étape par étape</h2>

<h3>L'architecture de base</h3>

<p>Ouvre un nouveau classeur. Première feuille : le planning mensuel. Deuxième feuille : une base de données salariés. Troisième feuille : les totaux automatiques.</p>

<p>Sur la feuille planning, la logique est simple :</p>

<ul>
  <li>Colonne A : noms des salariés</li>
  <li>Colonne B : poste occupé</li>
  <li>Colonnes C à AG (ou AH selon le mois) : les jours du mois, un par colonne</li>
</ul>

<p>Dans chaque cellule jour/salarié, tu vas entrer un code. C'est là que tout se joue.</p>

<h3>Créer un système de codes lisibles</h3>

<p>J'utilise des abréviations courtes que toute l'équipe comprend en deux secondes. Exemples :</p>

<ul>
  <li><strong>M</strong> = matin (ex. 8h-14h)</li>
  <li><strong>AM</strong> = après-midi (14h-20h)</li>
  <li><strong>N</strong> = nuit</li>
  <li><strong>J</strong> = journée complète</li>
  <li><strong>R</strong> = repos</li>
  <li><strong>CP</strong> = congé payé</li>
  <li><strong>F</strong> = formation</li>
  <li><strong>M/2</strong> = demi-journée matin</li>
</ul>

<p>Ensuite, tu utilises la mise en forme conditionnelle pour coloriser automatiquement chaque code. M en vert, R en gris, CP en bleu, N en violet. En un coup d'oeil, on voit qui travaille, qui est absent, qui est en roulement.</p>

<p>Ça prend 15 minutes à paramétrer. Et ça change tout pour la lisibilité.</p>

<h3>Automatiser le comptage des heures</h3>

<p>La partie que tout le monde zappe et qui fait perdre un temps fou ensuite. Dans ta troisième feuille, tu crées un récapitulatif automatique avec des formules <strong>COUNTIF</strong> (ou NB.SI en français).</p>

<p>Par exemple, pour compter les jours de matin travaillés pour "Lucas" sur le mois :</p>

<p><em>=NB.SI(Planning!C3:AG3;"M")</em></p>

<p>Tu fais pareil pour chaque code. Tu obtiens une synthèse par salarié : nombre de matins, d'après-midi, de nuits, de repos, de congés. Et tu peux vérifier d'un coup d'oeil si quelqu'un dépasse son quota d'heures ou n'a pas assez de repos consécutifs.</p>

<p>J'ai aussi ajouté une colonne "alerte" avec une formule conditionnelle : si le total dépasse 48h sur la semaine, la cellule passe en rouge. Ça m'a évité plusieurs erreurs.</p>

<h3>Gérer les week-ends et jours fériés automatiquement</h3>

<p>La ligne d'en-tête avec les jours de la semaine, ne la remplis pas à la main. Utilise une formule qui lit la date et affiche automatiquement "Lun", "Mar", etc. Et colorie les samedis et dimanches en gris clair avec la mise en forme conditionnelle.</p>

<p>Pour les jours fériés, j'ai une liste dans une feuille cachée. Une formule RECHERCHEV vérifie si la date est fériée et colore la colonne différemment. C'est un peu plus technique mais ça vaut vraiment le coup si tu gères plusieurs mois d'affilée.</p>

<h2>L'exemple concret que j'aurais aimé avoir dès le départ</h2>

<p>Voilà un <strong>exemple concret de planning du personnel</strong> que j'ai utilisé pour une équipe de 12 personnes en roulement 7j/7.</p>

<p>On avait besoin d'au moins 4 personnes présentes chaque jour. Certains ne pouvaient pas travailler le week-end pour des raisons contractuelles. Et on avait deux salariés à temps partiel.</p>

<p>Structure adoptée :</p>

<ul>
  <li>Feuille 1 : planning mensuel avec codes couleurs</li>
  <li>Feuille 2 : contraintes individuelles (jours fixes off, temps partiel, disponibilités)</li>
  <li>Feuille 3 : compteur hebdomadaire automatique par salarié</li>
  <li>Feuille 4 : vue d'ensemble mensuelle (qui a combien d'heures, qui est proche du plafond)</li>
</ul>

<p>Résultat : je passais 45 minutes par mois sur le planning contre 3 heures avant. La vérification des totaux était instantanée. Et l'équipe pouvait consulter le fichier partagé sur Drive sans avoir besoin de me contacter pour savoir leurs horaires.</p>

<h2>Le planning de rotation sur Excel : comment gérer les cycles</h2>

<p>Un <strong>planning de rotation sur Excel</strong> c'est un cran au-dessus. Tu n'as plus un planning fixe semaine par semaine. Tu as un cycle qui tourne : par exemple un roulement 3x8 sur 4 semaines, ou une alternance matin/soir sur 2 semaines.</p>

<p>La méthode que j'utilise : je crée un tableau de cycle de référence. Genre 4 groupes (A, B, C, D) avec leur séquence type sur 4 semaines. Ensuite, le planning mensuel va lire dans quelle semaine de cycle on se trouve et afficher automatiquement le bon code pour chaque groupe.</p>

<p>C'est faisable avec des formules INDEX/EQUIV ou des DECALER. Honnêtement, si tu n'as jamais touché à ces formules, prévois une heure pour apprendre. Mais après, c'est quasi automatique.</p>

<p>Le principal piège : les échanges de poste entre collègues. Excel ne gère pas ça tout seul. Il faut noter les exceptions manuellement. J'ai une colonne "échange" dans chaque ligne salarié pour tracer ces modifs. Pas glamour, mais ça fonctionne.</p>

<h2>Où trouver un modèle de base qui fonctionne vraiment</h2>

<p>Si tu veux aller plus vite, il existe des fichiers tout faits. Un <strong>modèle de planning Excel gratuit</strong> bien conçu peut te faire gagner deux à trois heures de mise en place. J'en ai testé plusieurs. La plupart sont trop génériques ou franchement moche. Mais certains sont vraiment bien foutus avec les formules déjà intégrées, les codes couleurs configurés et les synthèses automatiques.</p>

<p>Ce que je regarde dans un modèle avant de l'adopter :</p>

<ul>
  <li>Est-ce que les formules sont protégées ou accessibles pour les modifier ?</li>
  <li>Y a-t-il un compteur hebdomadaire intégré ?</li>
  <li>La mise en forme est-elle lisible sur un écran 13 pouces ?</li>
  <li>Est-ce que ça tourne sur LibreOffice aussi (pour les collègues qui n'ont pas la suite Office) ?</li>
</ul>

<p>Le mieux reste souvent de partir d'un modèle existant et de l'adapter à ta réalité. Ne pars pas de zéro si quelqu'un a déjà fait le travail.</p>

<h2>Les limites d'Excel que personne ne te dit avant</h2>

<p>Je vais être direct. Excel c'est bien jusqu'à un certain point.</p>

<p>Passé 25-30 salariés, les fichiers deviennent lourds. Les formules se cassent quand quelqu'un supprime une ligne par accident. Et la gestion des droits d'accès sur Drive ou SharePoint, c'est une vraie galère si plusieurs managers doivent éditer en même temps.</p>

<p>Autre problème : les notifications. Excel ne t'envoie pas d'alerte quand un salarié pose des congés ou quand un poste n'est pas couvert. Tu dois surveiller toi-même. Pour une petite équipe stable, ça passe. Pour une équipe qui grandit vite avec des remplacements fréquents, ça commence à peser.</p>

<p>J'ai aussi eu le cas classique : un fichier corrompu un vendredi soir avant un week-end chargé. Pas de sauvegarde récente. On a refait le planning à la main. Franchement, ça m'a agacé. Et depuis, j'ai mis en place des sauvegardes automatiques toutes les heures sur Drive.</p>

<h2>Comparatif : Excel vs logiciels dédiés</h2>

<p>Voilà un <strong>comparatif logiciel de planning</strong> rapide pour t'aider à décider si Excel suffit pour toi ou si tu dois passer à un outil dédié.</p>

<table>
  <thead>
    <tr>
      <th>Critère</th>
      <th>Excel</th>
      <th>Logiciel dédié (ex. Combo, Skello, Bizneo)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Prix</td>
      <td>Gratuit (si déjà dans la suite Office)</td>
      <td>Entre 2€ et 6€ / salarié / mois</td>
    </tr>
    <tr>
      <td>Facilité d'utilisation</td>
      <td>Moyen, nécessite de maîtriser les formules</td>
      <td>Interface intuitive, prise en main rapide</td>
    </tr>
    <tr>
      <td>Automatisation</td>
      <td>Partielle, formules manuelles</td>
      <td>Forte, alertes, suggestions automatiques</td>
    </tr>
    <tr>
      <td>Notifications</td>
      <td>Aucune</td>
      <td>Intégrées (mobile + email)</td>
    </tr>
    <tr>
      <td>Gestion des échanges de poste</td>
      <td>Manuelle</td>
      <td>Automatisée avec validation RH</td>
    </tr>
    <tr>
      <td>Intégration paie</td>
      <td>Non</td>
      <td>Souvent disponible</td>
    </tr>
    <tr>
      <td>Accès mobile</td>
      <td>Limité</td>
      <td>App dédiée</td>
    </tr>
    <tr>
      <td>Idéal pour</td>
      <td>Équipes de moins de 25 personnes</td>
      <td>Équipes de 20 à 200+ personnes</td>
    </tr>
  </tbody>
</table>

<p>Mon avis ? Si tu as moins de 20 salariés et que tu n'as pas de rotations complexes, Excel est largement suffisant. Ça te coûte zéro et ça se met en place en une journée. Mais dès que tu dépasses 30 personnes ou que tu gères des postes en roulement continu, un logiciel dédié va te rembourser son coût en temps gagné.</p>

<p>J'ai fait le switch à 28 salariés. J'aurais pu attendre encore un peu, mais la gestion des remplacements last-minute commençait à me bouffer des soirées.</p>

<h2>FAQ : les questions que je me suis posées au début</h2>

<h3>Est-ce qu'Excel peut gérer les congés automatiquement ?</h3>

<p>Pas vraiment de façon native. Tu peux créer un formulaire Google Forms ou Microsoft Forms lié à ton fichier pour centraliser les demandes. Mais la validation reste manuelle. Si tu veux de la vraie automatisation, un logiciel RH dédié gère mieux ça.</p>

<h3>Comment faire si deux managers doivent éditer le même fichier en même temps ?</h3>

<p>Sur Excel Online (via Microsoft 365) ou sur Drive avec Sheets, la co-édition est possible. Mais attention aux conflits de versions si quelqu'un travaille hors connexion. J'ai eu des écrasements de données. Je recommande de définir des zones d'édition par manager pour éviter les doublons.</p>

<h3>Y a-t-il un risque légal à gérer les plannings sur Excel ?</h3>

<p>Excel en lui-même n'est pas un problème. Ce qui peut poser souci, c'est si tu n'as pas de trace des modifications. Pour l'inspection du travail, un historique de planning est utile. Active le suivi des modifications dans Excel (Révision > Suivi des modifications) et sauvegarde chaque version mensuelle archivée.</p>

<h3>Comment gérer les temps partiels sur un planning Excel ?</h3>

<p>Je crée une ligne dédiée avec le nombre d'heures contractuelles indiqué dans la colonne commentaire. Et le compteur hebdomadaire compare automatiquement les heures planifiées au contrat. Si ça dépasse, la cellule passe en orange. Simple et efficace.</p>

<h3>Mon équipe n'est pas à l'aise avec Excel, qu'est-ce que je fais ?</h3>

<p>Tu protèges les cellules de formules (Révision > Protéger la feuille) et tu n'autorises la saisie que dans les cellules de codes. Tes collègues n'ont plus qu'à taper "M", "R" ou "CP". J'ai formé deux personnes de mon équipe là-dessus en moins d'une heure. <strong>Rien de technique du tout</strong> une fois que la structure est en place.</p>

<h3>À partir de combien de salariés faut-il vraiment passer à un logiciel ?</h3>

<p>Honnêtement, à partir de 25-30 salariés avec des rotations ou des remplacements fréquents. En dessous, Excel gère sans problème. Au-dessus, tu vas passer trop de temps sur la maintenance du fichier plutôt que sur le fond.</p>
