---
title: 'Planning de rotation du personnel sur Excel : structure et mise en place'
slug: 1824-planning-de-rotation-du-personnel-sur-excel-structure-et-mise-en-place
date: '2026-08-10T12:00:00+02:00'
categorie: Ressources Humaines
meta_title: 'Planning rotation du personnel Excel : mise en place'
meta_description: Créer un planning de rotation du personnel sur Excel sans que tout s'effondre, c'est possible. Découvrez la structure et les formules clés pour un fichier fiable.
min_words: 1300
status: published
featured_image: /blog/1824-planning-de-rotation-du-personnel-sur-excel-structure-et-mise-en-place.jpg
link_anchors:
- text: planning de rotation sur Excel
  max: 5
---

<p>Gérer les rotations de personnel sur Excel, c'est souvent le premier réflexe. C'est gratuit, tout le monde connaît, et on peut bricoler un truc fonctionnel assez vite. J'ai moi-même démarré comme ça avec mon équipe. Résultat : un fichier de 12 onglets, des formules qui sautent dès qu'on insère une ligne, et des managers qui m'appellent le dimanche pour me dire que le planning est cassé.</p>

<p>Bon. On peut faire mieux. Même sur Excel.</p>

<p>Voilà comment construire un planning de rotation du personnel qui tient vraiment la route, sans te prendre la tête, et sans formation de deux semaines.</p>

<h2>Pourquoi la rotation du personnel est plus complexe qu'elle n'en a l'air</h2>

<p>La rotation, c'est pas juste "qui travaille quand". C'est gérer les cycles de repos, les contraintes légales sur les horaires, les compétences disponibles par poste, les remplacements en cas d'absence... Autant de variables qui transforment vite un joli tableau en cauchemar.</p>

<p>Dans mon équipe, on tourne sur des shifts matin/soir avec deux postes critiques qui ne peuvent pas être vacants en même temps. Si je gère ça à la main, j'oublie forcément un truc. Une fois, j'avais prévu deux personnes sur le même créneau et personne le lendemain matin. Classique.</p>

<p>L'objectif d'un bon planning de rotation, c'est de visualiser en un coup d'oeil :</p>

<ul>
  <li>qui est présent chaque jour</li>
  <li>combien d'heures chaque salarié accumule sur la semaine</li>
  <li>les trous à couvrir</li>
  <li>les personnes en repos obligatoire</li>
</ul>

<p>Et ça, Excel peut le faire, à condition de bien structurer le fichier dès le départ.</p>

<h2>Construire un planning du personnel sous Excel : la structure qui fonctionne</h2>

<p>J'ai testé plusieurs approches. La meilleure, c'est de travailler avec trois onglets distincts. Pas plus, pas moins.</p>

<h3>Onglet 1 : la base salariés</h3>

<p>C'est le socle. Un tableau avec les colonnes suivantes : nom, prénom, poste, type de contrat, nombre d'heures contractuelles par semaine, contraintes spécifiques (garde d'enfant le mercredi, pas de nuit, etc.). Ce tableau ne sert pas à afficher le planning, il sert de référence pour tes formules.</p>

<p>Si tu sautes cet onglet, tu vas dupliquer les infos partout et tu vas passer ta vie à corriger des incohérences.</p>

<h3>Onglet 2 : le planning mensuel</h3>

<p>C'est là que tout se passe. Voilà la structure type que j'utilise :</p>

<table>
  <thead>
    <tr>
      <th>Salarié</th>
      <th>Lundi 01</th>
      <th>Mardi 02</th>
      <th>Mercredi 03</th>
      <th>Jeudi 04</th>
      <th>Vendredi 05</th>
      <th>Sam 06</th>
      <th>Dim 07</th>
      <th>Total semaine</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Martin L.</td>
      <td>M (8h-16h)</td>
      <td>M (8h-16h)</td>
      <td>REPOS</td>
      <td>S (14h-22h)</td>
      <td>S (14h-22h)</td>
      <td>REPOS</td>
      <td>REPOS</td>
      <td>32h</td>
    </tr>
    <tr>
      <td>Sara B.</td>
      <td>REPOS</td>
      <td>S (14h-22h)</td>
      <td>S (14h-22h)</td>
      <td>M (8h-16h)</td>
      <td>REPOS</td>
      <td>M (8h-16h)</td>
      <td>M (8h-16h)</td>
      <td>40h</td>
    </tr>
    <tr>
      <td>Karim D.</td>
      <td>S (14h-22h)</td>
      <td>REPOS</td>
      <td>M (8h-16h)</td>
      <td>REPOS</td>
      <td>M (8h-16h)</td>
      <td>S (14h-22h)</td>
      <td>REPOS</td>
      <td>32h</td>
    </tr>
  </tbody>
</table>

<p>La colonne "Total semaine" utilise une formule <strong>COUNTIF</strong> combinée à une table de correspondance (M = 8h, S = 8h, REPOS = 0h). Simple et efficace. Tu peux ajouter une mise en forme conditionnelle pour que la cellule passe en rouge si quelqu'un dépasse ses heures contractuelles.</p>

<h3>Onglet 3 : le tableau de couverture</h3>

<p>Celui-là, beaucoup de gens le zappent. C'est une erreur. Cet onglet affiche, pour chaque créneau horaire de chaque jour, le nombre de personnes présentes. Tu vois instantanément les sous-effectifs.</p>

<p>Tu construis ça avec des formules COUNTIF sur le planning mensuel. Résultat : une vue condensée de type "lundi matin : 3 personnes, lundi soir : 1 personne". Si tu as besoin de 2 minimum le soir, la cellule passe en orange automatiquement.</p>

<p>Ce troisième onglet, c'est ce qui transforme un planning horaire des salariés en vrai outil de pilotage, pas juste un tableau de présences.</p>

<h2>Les formules Excel à connaître absolument</h2>

<p>Pas besoin d'être développeur. Ces trois formules couvrent 90% des besoins :</p>

<ul>
  <li><strong>COUNTIF</strong> : compter combien de fois un salarié travaille le matin dans la semaine</li>
  <li><strong>SUMIF</strong> : additionner les heures selon un critère (poste, type de shift...)</li>
  <li><strong>IFERROR</strong> : éviter que le fichier plante si une cellule est vide</li>
</ul>

<p>Exemple concret : pour savoir si Martin a bien ses deux jours de repos obligatoires dans la semaine, une formule COUNTIF sur sa ligne suffit. Si le résultat est inférieur à 2, la cellule clignote. C'est pas de la magie, c'est 20 minutes de mise en place.</p>

<p>Par contre, là j'ai un vrai reproche à faire à Excel : dès qu'on ajoute un salarié en milieu de tableau, les références de cellules partent dans tous les sens. Il faut absolument travailler avec des <strong>plages nommées</strong>, sinon tu passes plus de temps à réparer qu'à planifier.</p>

<h2>Les limites réelles d'un planning du personnel construit sous Excel</h2>

<p>Je vais pas te mentir. Excel tient la route jusqu'à environ 15 à 20 salariés. Au-delà, ça devient ingérable. Et même en dessous de ce seuil, il y a des angles morts.</p>

<p>Le plus gros problème : la collaboration en temps réel. Si deux managers modifient le fichier en même temps, c'est la catastrophe. Même sur OneDrive ou Google Drive, les conflits de version arrivent. J'en ai fait les frais lors d'un rush où deux chefs d'équipe avaient chacun leur version du planning ouvert simultanément. On a eu un doublon de shift qu'on a découvert le jour même.</p>

<p>Autre limite : les absences de dernière minute. Sur Excel, quand quelqu'un appelle pour dire qu'il est malade à 7h du matin, tu dois manuellement trouver un remplaçant, vérifier ses disponibilités, modifier le fichier, le renvoyer à tout le monde. C'est lent. Trop lent.</p>

<p>Et la gestion des cycles de rotation sur plusieurs semaines ? Franchement, ça devient vite un tableau illisible si tu veux anticiper sur 4 ou 6 semaines.</p>

<h2>Quand passer à un outil dédié ?</h2>

<p>À partir du moment où tu passes plus de 3 heures par semaine sur ton planning, c'est le signal. Tu perds de l'argent à bricoler un fichier quand des outils font ça 10 fois mieux.</p>

<p>Si tu gères une équipe dans la restauration ou le retail, les besoins sont encore plus spécifiques : shifts variables, forte saisonnalité, turnover élevé, contraintes légales strictes. Un <strong>logiciel de planning adapté à la restauration</strong> va gérer les règles légales automatiquement, envoyer les plannings aux salariés sur leur téléphone, et gérer les échanges de shifts sans que tu aies à intervenir.</p>

<p>Pour les autres secteurs, la question c'est : est-ce que ton outil actuel te fait gagner du temps ou t'en fait perdre ? Si c'est la deuxième option, c'est réglé.</p>

<h3>Quelques outils que j'ai vraiment testés</h3>

<p>Je vais pas te faire un comparatif exhaustif, mais voilà ce que j'en pense honnêtement :</p>

<p><strong>Skello</strong> : très bon pour la restauration et le retail. L'interface est claire, la prise en main rapide. J'ai formé deux personnes dessus en deux jours. Par contre, le prix grimpe vite si tu as beaucoup de salariés.</p>

<p><strong>Combo</strong> : similaire à Skello, un peu moins cher, avec une fonctionnalité sympa de gestion des indisponibilités par les salariés eux-mêmes. Ça réduit les allers-retours. Le support client, par contre, pas toujours réactif.</p>

<p><strong>Factorial</strong> : plus complet (RH, paie, planning), mais franchement trop complexe si tu veux juste gérer des rotations. L'onboarding est long. Pour une équipe non technique, je déconseille de commencer par là.</p>

<p>Si tu veux un avis global sur le <strong>meilleur logiciel de planning en ligne</strong> pour une petite structure, je mettrais Skello ou Combo en tête pour leur rapport facilité/fonctionnalités. Mais ça dépend vraiment de ton secteur et de la taille de ton équipe.</p>

<h2>Les erreurs à éviter quand tu structures ton planning de rotation</h2>

<p>Je les ai toutes faites. Autant t'en faire profiter.</p>

<ul>
  <li>Ne pas versionner le fichier. Un écrasement accidentel et tu perds trois semaines de planning.</li>
  <li>Créer des formules trop complexes que toi seul comprends. Si tu es absent, personne peut modifier le fichier.</li>
  <li>Ne pas intégrer les jours fériés dès la création du tableau. Tu te retrouves à tout revoir en mai.</li>
  <li>Oublier les temps partiels. Un 80% ne travaille pas 4 jours fixes dans la semaine forcément.</li>
  <li>Ne pas prévoir de colonne "notes" pour les remplacements ou les contraintes ponctuelles.</li>
</ul>

<p>Cette dernière erreur, je l'ai découverte un peu tard. Une colonne Notes par ligne de salarié, même basique, économise des échanges de mails sans fin.</p>

<h2>FAQ : planning de rotation du personnel sur Excel</h2>

<h3>Est-ce qu'Excel est vraiment suffisant pour gérer des rotations complexes ?</h3>

<p>Pour une équipe de moins de 15 personnes avec des shifts relativement stables, oui. Au-delà ou avec beaucoup de variabilité, tu vas souffrir. Le fichier tient, mais la maintenance devient chronophage.</p>

<h3>Comment gérer les échanges de shifts entre salariés sur Excel ?</h3>

<p>Honnêtement, pas bien. Tu peux créer un onglet "demandes d'échange" où les salariés notent leurs souhaits, mais c'est toi qui valides et modifies à la main. Sur un logiciel dédié, c'est automatisé. C'est là que la différence se ressent vraiment au quotidien.</p>

<h3>Quelle est la meilleure fréquence de publication du planning ?</h3>

<p>Minimum deux semaines à l'avance. Légalement, dans certains secteurs, tu as une obligation de délai. Et pratiquement, tes salariés ont besoin de visibilité pour s'organiser. Un planning posté à J-1, c'est la source numéro un de tensions en équipe.</p>

<h3>Comment anticiper les remplacements dans mon planning Excel ?</h3>

<p>Crée un onglet "remplaçants disponibles" avec les salariés qui acceptent des heures supplémentaires ou qui ont des disponibilités variables. Quand quelqu'un est absent, tu filtres sur cet onglet. C'est rudimentaire mais ça marche si tu l'entraines régulièrement.</p>

<h3>Mon équipe n'est pas du tout à l'aise avec Excel. Que faire ?</h3>

<p>Ne leur donne pas accès au fichier source. Exporte le planning en PDF chaque semaine et envoie-le. Simple, lisible, sans risque de modification accidentelle. Et si l'équipe grandit, passe à un outil avec app mobile. La différence en termes d'adoption est énorme.</p>

<h3>Est-ce qu'un logiciel de planning peut vraiment remplacer Excel ?</h3>

<p>Oui, et assez vite. La plupart des outils modernes permettent d'importer tes données Excel existantes. La migration prend en général une à deux heures, pas une semaine. Le vrai frein c'est souvent psychologique : on a l'impression qu'on va tout perdre. En réalité, on gagne du temps dès la première semaine.</p>
