---
title: Comment calculer les heures de travail de ses salariés ?
slug: 2738-comment-calculer-les-heures-de-travail-de-ses-salaries
date: '2026-08-03T11:00:00+02:00'
categorie: Ressources Humaines
meta_title: 'Calcul des heures de travail : méthode et formules'
meta_description: Calculer les heures de travail de vos salariés sans erreur est essentiel pour éviter litiges et paie incorrecte. Méthodes, outils et bonnes pratiques pour enfin…
min_words: 1600
status: published
featured_image: /blog/2738-comment-calculer-les-heures-de-travail-de-ses-salaries.jpg
link_anchors:
- text: calcul des heures de travail
  max: 5
---

<p>Calculer les heures de travail de ses salariés, ça paraît simple. Et pourtant, c'est là que beaucoup de petites boîtes se plantent, souvent sans s'en rendre compte. Entre les heures sup' qui s'accumulent, les absences à déduire, et les plannings qui changent en cours de route, tu te retrouves vite avec des données approximatives. Et des données approximatives, ça coûte cher, que ce soit en litiges ou en paie mal calculée.</p>

<p>J'ai monté ma startup il y a quelques années. Au début, je gérais tout ça à la main. Feuilles Excel, captures d'écran des timesheets, notes Slack. Un vrai bazar. J'ai mis du temps à structurer le truc. Cet article, c'est ce que j'aurais aimé lire à l'époque.</p>

<h2>Pourquoi le calcul des heures est souvent mal fait</h2>

<p>Le problème numéro un, c'est qu'on ne définit pas clairement ce qu'on mesure. Est-ce qu'on compte les heures de présence ? Les heures productives ? Les heures contractuelles ? Ce n'est pas pareil. Un salarié peut pointer à 9h, prendre une heure de pause non déclarée, et partir à 18h. Sur le papier, il fait 9h. En réalité, 8h. Multiplie ça par 20 salariés sur 12 mois, et tu as un écart significatif.</p>

<p>Deuxième problème : les outils. Trop souvent, les petites structures utilisent des méthodes non synchronisées. Un fichier partagé ici, un tableau papier là, un système de badge déconnecté ailleurs. Résultat, personne ne sait où est la source de vérité.</p>

<p>Troisième problème, et celui-là m'a personnellement coûté du temps : les heures supplémentaires mal comptabilisées. En France, le seuil légal est fixé à <strong>35h par semaine</strong>. Tout ce qui dépasse doit être identifié, compensé ou payé avec majoration. Si tu ne suis pas ça précisément, tu t'exposes à des régularisations au moment du solde de tout compte.</p>

<h2>Les méthodes concrètes pour suivre les heures</h2>

<h3>L'approche manuelle avec Excel</h3>

<p>Oui, ça reste une option. Pas la plus efficace, mais parfois la seule accessible quand on démarre et qu'on n'a pas envie d'investir dans un outil. Le calcul des heures de travail avec Excel peut fonctionner correctement à condition de bien structurer les formules dès le départ.</p>

<p>Voilà ce que j'utilise comme base :</p>

<ul>
  <li>Une colonne "Heure d'arrivée"</li>
  <li>Une colonne "Heure de départ"</li>
  <li>Une colonne "Pause déduite" (en minutes ou en heures décimales)</li>
  <li>Une colonne "Total journalier" calculé automatiquement</li>
  <li>Une ligne de total hebdomadaire avec mise en forme conditionnelle si on dépasse 35h</li>
</ul>

<p>La formule de base dans Excel : <strong>=(Départ - Arrivée - Pause)*24</strong>. Ça te donne un nombre décimal d'heures. Tu multiplies par le taux horaire pour avoir le coût brut. Simple, mais efficace si tu le fais rigoureusement.</p>

<p>Par contre, l'inconvénient est réel : si un salarié oublie de remplir sa ligne, tu n'as rien. Pas de rappel automatique, pas de validation, pas de workflow. Tu dois tout surveiller manuellement. J'ai perdu plusieurs heures par mois juste à faire des relances.</p>

<h3>Le tableau de suivi mensuel structuré</h3>

<p>Si tu gères plusieurs salariés, tu as besoin d'un <strong>tableau de calcul des heures de travail</strong> qui agrège les données par personne et par période. Un onglet par salarié, un récap mensuel, et une vue globale par équipe.</p>

<p>Voici à quoi ressemble un tableau minimal efficace :</p>

<table>
  <thead>
    <tr>
      <th>Salarié</th>
      <th>Semaine 1</th>
      <th>Semaine 2</th>
      <th>Semaine 3</th>
      <th>Semaine 4</th>
      <th>Total mensuel</th>
      <th>Heures sup'</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Marie D.</td>
      <td>36h</td>
      <td>35h</td>
      <td>38h</td>
      <td>35h</td>
      <td>144h</td>
      <td>4h</td>
    </tr>
    <tr>
      <td>Lucas P.</td>
      <td>35h</td>
      <td>35h</td>
      <td>35h</td>
      <td>35h</td>
      <td>140h</td>
      <td>0h</td>
    </tr>
    <tr>
      <td>Camille R.</td>
      <td>37h</td>
      <td>39h</td>
      <td>35h</td>
      <td>37h</td>
      <td>148h</td>
      <td>8h</td>
    </tr>
  </tbody>
</table>

<p>Ce type de vue t'aide à anticiper les régularisations en paie. Tu vois d'un coup d'oeil qui a débordé sur le mois, et de combien. Le calcul des heures de travail mensuelles devient lisible pour tout le monde, y compris pour ton comptable ou ton expert-comptable qui prépare les bulletins de salaire.</p>

<h3>Les outils de pointage en ligne</h3>

<p>À un moment, j'ai décidé d'arrêter de bricoler. J'ai cherché le <a href="https://startuponly.com/meilleur-logiciel-de-pointage">meilleur logiciel de pointage en ligne</a> adapté à une petite équipe. Pas un mastodonte avec 200 fonctionnalités dont j'aurais utilisé 5%, mais quelque chose de simple, fiable, et pas trop cher.</p>

<p>Ce que je voulais concrètement :</p>

<ul>
  <li>Pointage depuis le mobile ou le navigateur</li>
  <li>Export automatique vers un CSV ou Excel</li>
  <li>Gestion des absences et des congés intégrée</li>
  <li>Alertes quand un salarié dépasse son quota hebdomadaire</li>
  <li>Prix raisonnable, moins de 10-15€ par utilisateur et par mois</li>
</ul>

<p>Bon, par contre, ce que j'ai découvert c'est que beaucoup d'outils sont pensés pour des entreprises de 50 personnes minimum. L'onboarding est long, les interfaces pas toujours intuitives, et parfois le support répond en 48h. Pour une startup de 3 ou 4 personnes, ça peut vite être disproportionné.</p>

<h2>Comment calculer concrètement les heures sur un mois</h2>

<p>Reprenons les bases. En France, la durée légale du travail est de <strong>35h hebdomadaires</strong>, soit 151,67h par mois en moyenne. Ce chiffre de 151,67h, c'est la référence utilisée pour calculer le salaire horaire à partir d'un salaire mensuel brut fixe.</p>

<p>Formule simple pour retrouver le taux horaire :</p>

<p><em>Taux horaire = Salaire brut mensuel / 151,67</em></p>

<p>Si tu embauches quelqu'un à temps partiel, le calcul change. Un salarié à 80% travaille en théorie 28h par semaine, soit environ 121,33h par mois. Tu adaptes la formule en conséquence.</p>

<p>Pour les heures supplémentaires, les majorations légales sont :</p>

<ul>
  <li><strong>25%</strong> pour les 8 premières heures supplémentaires de la semaine (de la 36e à la 43e heure)</li>
  <li><strong>50%</strong> au-delà de la 43e heure hebdomadaire</li>
</ul>

<p>Attention, certaines conventions collectives prévoient des taux différents. Vérifie toujours la convention applicable à ton secteur. C'est là que beaucoup de fondateurs font des erreurs, moi le premier au début.</p>

<h3>Un exemple concret</h3>

<p>Marie est développeuse dans mon équipe. Son contrat est à 35h/semaine. En mars, elle a travaillé 4 semaines et voilà ses heures réelles :</p>

<ul>
  <li>Semaine 1 : 38h</li>
  <li>Semaine 2 : 35h</li>
  <li>Semaine 3 : 40h</li>
  <li>Semaine 4 : 36h</li>
</ul>

<p>Total : 149h réelles. Le contrat prévoyait 140h (35h x 4 semaines). Elle a donc fait <strong>9h supplémentaires</strong>. Sur ces 9h : 8h à +25% et 1h à +50% (pour la semaine 3 où elle dépasse la 43e heure, bon là c'est la semaine à 40h donc 5h sup' sur cette semaine, les 3h de la semaine 1 et 1h de la semaine 4 passent à 25%). La comptabilisation semaine par semaine est importante. Tu ne fais pas un total mensuel brut et tu déduis ensuite. Ça se calcule semaine par semaine.</p>

<h2>Les erreurs classiques à éviter absolument</h2>

<p>J'en vois revenir les mêmes régulièrement chez les fondateurs de mon entourage.</p>

<p><strong>Erreur 1 :</strong> Agréger les heures au mois sans regarder la semaine. J'ai expliqué pourquoi juste au-dessus. Les majorations se calculent à la semaine, pas au mois. Un salarié qui fait 45h une semaine et 25h la suivante ne compense pas. La semaine à 45h génère des heures sup'.</p>

<p>Erreur 2 : Oublier les jours fériés. Un jour férié tombant un jour ouvré ne se déduit pas automatiquement du compteur. Tu dois gérer ça manuellement dans Excel ou configurer ton outil pour qu'il le fasse. Franchement, ça m'a fait gagner du temps quand j'ai basculé sur un logiciel qui gère le calendrier français automatiquement.</p>

<p>Erreur 3 : Ne pas formaliser les arrêts maladie dans le suivi des heures. Quand un salarié est en arrêt, ses heures ne s'accumulent pas. Si tu ne l'indiques pas clairement dans ton tableau ou ton outil, tu te retrouves avec des zéros inexpliqués dans les données, et tu dois reconstituer l'historique a posteriori.</p>

<p>Erreur 4 : Utiliser les heures déclaratives sans validation. Un salarié qui saisit lui-même ses heures peut (sans mauvaise intention parfois) arrondir. <strong>Sans circuit de validation</strong>, tu approuves des données que personne n'a vérifiées. Un workflow simple avec une validation manager avant export paie, ça change tout.</p>

<h2>À quel moment basculer vers un vrai outil</h2>

<p>Honnêtement ? Dès que tu dépasses deux salariés. Avant, Excel suffit. Après, tu perds plus de temps à maintenir tes fichiers qu'à vraiment piloter ton activité.</p>

<p>Ce n'est pas une question de budget non plus. Les outils de suivi du temps sérieux commencent <strong>à partir de 3-4€ par utilisateur et par mois</strong> pour les offres basiques. Pour une équipe de 4 personnes, on parle de 15-20€ par mois. Moins cher qu'une heure de ton temps passée à consolider des feuilles Excel.</p>

<p>Ce que tu gagnes concrètement avec un outil dédié :</p>

<ul>
  <li>Les pointages se font depuis le téléphone, même en déplacement</li>
  <li>Les exports vers le logiciel de paie se font en un clic</li>
  <li>Les alertes d'anomalie (salarié qui n'a pas pointé, dépassement de quota) arrivent automatiquement</li>
  <li>Les congés et absences sont intégrés dans le même outil, pas dans un fichier séparé</li>
  <li>Tu as un historique consultable à tout moment, utile en cas de litige</li>
</ul>

<p>Là j'ai un vrai reproche à faire à certains outils du marché : l'intégration avec les logiciels de paie français (Silae, PayFit, Sage...) n'est pas toujours fluide. Vérifie toujours les connecteurs disponibles avant de t'engager. Un export CSV que tu dois retraiter manuellement à chaque mois, c'est exactement ce que tu essaies d'éviter.</p>

<h2>Ce que dit la loi sur la conservation des données de temps de travail</h2>

<p>Petit rappel rapide, parce que c'est souvent ignoré.</p>

<p>En France, l'employeur est tenu de <strong>conserver les documents relatifs au temps de travail pendant 5 ans</strong>. Ça inclut les feuilles de présence, les relevés d'heures, et tout document justifiant le calcul des heures supplémentaires. En cas de contrôle URSSAF ou de litige prud'homal, tu dois pouvoir sortir ces données rapidement.</p>

<p>Si tu utilises Excel, assure-toi d'avoir un système de sauvegarde et de versionnage. Un fichier écrasé par erreur et tu es dans une position inconfortable. Un outil cloud, ça règle ce problème automatiquement. Toutes les données sont horodatées et stockées.</p>

<p>Je ne suis pas juriste et je ne remplace pas un conseil RH ou un avocat spécialisé, mais c'est clairement un point à ne pas négliger dès que tu embauches.</p>

<h2>Mon avis final sur l'organisation du suivi du temps</h2>

<p>Voilà ce que j'aurais fait différemment depuis le début :</p>

<ul>
  <li>Mettre en place un fichier Excel structuré dès le premier salarié, avec des formules qui calculent les heures sup' automatiquement</li>
  <li>Passer à un outil dédié dès le deuxième ou troisième salarié</li>
  <li>Vérifier que l'outil choisi exporte dans un format compatible avec mon logiciel de paie</li>
  <li>Former chaque nouveau salarié au processus de pointage dès son premier jour</li>
</ul>

<p>Le calcul des heures de travail mensuelles n'est pas sexy. Personne ne monte une startup pour passer du temps sur des relevés de présence. Mais c'est un des trucs qui peut te coûter cher si tu le bâcles, et qui te libère vraiment du temps si tu l'automatises correctement.</p>

<p>Un bon système de suivi du temps, c'est aussi un message clair envoyé à tes salariés : leurs heures comptent, elles sont tracées, et les heures supplémentaires seront reconnues. Ça compte pour la relation de confiance.</p>
