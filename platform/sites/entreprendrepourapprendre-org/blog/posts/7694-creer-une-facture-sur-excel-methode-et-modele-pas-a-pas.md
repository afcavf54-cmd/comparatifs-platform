---
title: 'Créer une facture sur Excel : méthode et modèle pas à pas'
slug: 7694-creer-une-facture-sur-excel-methode-et-modele-pas-a-pas
date: '2026-08-18T12:00:00+02:00'
categorie: Comptabilité
meta_title: 'Créer une facture sur Excel : méthode pas à pas'
meta_description: Créer une facture sur Excel est simple au démarrage, mais comporte
  des limites légales et pratiques. Découvrez la méthode pas à pas et un modèle prêt
  à l'emploi.
min_words: 1300
status: published
featured_image: /blog/7694-creer-une-facture-sur-excel-methode-et-modele-pas-a-pas.jpg
link_anchors:
- text: créer une facture sous Excel
  max: 8
related_posts:
- 6148-comment-choisir-son-logiciel-de-facturation-criteres-et-methode
- 7208-logiciel-de-facturation-est-il-obligatoire-en-entreprise
- 3033-comment-fonctionne-un-logiciel-de-facturation-en-entreprise
- 7564-logiciel-de-facturation-professionnel-quelles-fonctionnalites-attendre
---
<h2>Pourquoi j'ai longtemps utilisé Excel pour mes factures, et pourquoi ça a ses limites</h2>

<p>Quand j'ai lancé mon agence il y a huit ans, je faisais mes factures sur Excel. Comme beaucoup d'indépendants ou de petites structures. C'est rapide à mettre en place, ça ne coûte rien si vous avez déjà la suite Office, et franchement, pour deux ou trois clients, ça suffit amplement. Je ne vais pas vous vendre du rêve : un tableur bien construit peut très bien faire le job au démarrage.</p>

<p>Mais avant d'aller plus loin, il faut être honnête sur une chose. Excel n'est pas un logiciel de facturation. C'est un outil de calcul. La nuance est importante. Vous pouvez fabriquer un marteau avec une clé à molette, mais ce n'est pas fait pour ça. Ce que je vais vous montrer dans cet article, c'est comment construire un modèle propre et fonctionnel, puis pourquoi à un moment donné, vous allez peut-être vouloir passer à autre chose.</p>

<h2>Ce qu'une facture doit contenir obligatoirement</h2>

<p>Avant de toucher à une cellule, il faut savoir ce qu'on y met. <strong>Établir une facture dans les règles</strong>, c'est respecter un cadre légal précis. En France, une facture manquante d'une mention obligatoire peut être contestée par votre client ou rejetée par l'administration. Et ça, ça m'est arrivé une fois avec un grand compte. Pas agréable.</p>

<p>Les mentions obligatoires à faire figurer sur chaque facture :</p>

<ul>
  <li>La date d'émission</li>
  <li>Un numéro unique et séquentiel (ex : 2025-001, 2025-002...)</li>
  <li>Vos coordonnées complètes : nom ou raison sociale, adresse, SIRET, numéro de TVA intracommunautaire si applicable</li>
  <li>Les coordonnées de votre client</li>
  <li>La désignation précise des prestations ou produits</li>
  <li>La quantité, le prix unitaire HT, le taux de TVA et le montant TTC</li>
  <li>La date d'échéance et les conditions de règlement</li>
  <li>Les pénalités de retard (mention obligatoire entre professionnels)</li>
</ul>

<p>Si vous êtes en franchise de TVA (micro-entrepreneur), vous devez également ajouter la mention "TVA non applicable, article 293 B du CGI". Un oubli fréquent qui peut créer des complications.</p>

<h2>Construire un modèle de facture sur Excel étape par étape</h2>

<p>Voici comment je construisais mes factures à l'époque. Pas de magie, juste de la méthode.</p>

<h3>L'en-tête : vos informations et celles du client</h3>

<p>Commencez par une zone claire en haut du tableau. À gauche, vos coordonnées. À droite, celles du client. <strong>Fusionnez les cellules</strong> pour créer des blocs lisibles, évitez les cellules microscopiques qui rendent la lecture difficile. Ajoutez votre logo si vous en avez un (insertion d'image dans Excel).</p>

<p>Ensuite, juste en dessous ou sur le côté, créez un petit bloc récapitulatif : numéro de facture, date d'émission, date d'échéance. Ce bloc doit être visible immédiatement. Votre client ne devrait pas chercher le numéro de facture pendant trente secondes.</p>

<h3>Le tableau des prestations</h3>

<p>C'est le coeur du document. Créez un tableau avec ces colonnes :</p>

<ol>
  <li>Description de la prestation</li>
  <li>Quantité</li>
  <li>Prix unitaire HT</li>
  <li>Taux de TVA</li>
  <li>Montant HT</li>
  <li>Montant TVA</li>
  <li>Montant TTC</li>
</ol>

<p>La formule de base pour le montant HT : <em>=quantité * prix unitaire</em>. Pour la TVA : <em>=montant HT * taux TVA</em>. Pour le TTC : <em>=montant HT + montant TVA</em>. Rien de compliqué, mais vérifiez toujours que vos formules se propagent correctement si vous ajoutez des lignes.</p>

<p>Bon, par contre, là j'ai un vrai reproche à faire à Excel. Si vous avez des taux de TVA différents sur une même facture (20% pour une prestation, 10% pour une autre), les totaux deviennent vite un casse-tête à gérer proprement. J'ai passé plus de temps que prévu à débugger ça une fois.</p>

<h3>Le bas de page : totaux, mentions légales et conditions</h3>

<p>Sous le tableau, prévoyez une zone de totaux bien distincte. Total HT, montant TVA (par taux si applicable), total TTC. Utilisez des formules <em>=SOMME()</em> sur les colonnes concernées.</p>

<p>Ajoutez ensuite un bloc texte avec vos conditions de règlement, vos pénalités de retard (le taux légal en vigueur, ou un taux contractuel), et si vous êtes une société, vos informations d'immatriculation (RCS, capital social).</p>

<p>Une ligne souvent oubliée : <strong>l'indemnité forfaitaire pour frais de recouvrement</strong>, fixée à 40 euros, est obligatoire sur les factures entre professionnels depuis 2013. Peu de gens le savent ou l'appliquent, mais l'absence de cette mention peut poser problème.</p>

<h3>La numérotation : le détail qui tue</h3>

<p>Le numéro de facture doit être unique et chronologique. Impossible de sauter un numéro, impossible de le réutiliser. Sur Excel, vous gérez ça manuellement. Ce qui veut dire qu'il faut avoir une discipline de fer pour ne jamais se tromper. Sur six mois, c'est gérable. Sur plusieurs années avec des dizaines de clients, c'est risqué.</p>

<p>J'ai vu des entrepreneurs avec des séquences de numérotation chaotiques. Un contrôle fiscal qui tombe là-dessus, ça complique vraiment les choses.</p>

<h2>Où trouver un modèle de facture à reprendre directement</h2>

<p>Si vous ne voulez pas construire votre tableau depuis zéro, il existe des templates Excel gratuits en ligne. Le site officiel de l'administration française (impots.gouv.fr, economie.gouv.fr) propose parfois des ressources, mais les modèles les plus pratiques viennent souvent de plateformes spécialisées en gestion d'entreprise.</p>

<p>Le mieux est de chercher un <strong>modèle de facture à reprendre</strong> qui contient déjà les formules de calcul et les mentions légales pré-remplies. Vous n'avez plus qu'à personnaliser : votre logo, vos coordonnées, vos couleurs. Ça prend vingt minutes plutôt que deux heures.</p>

<p>Avant de l'utiliser, vérifiez deux choses systématiquement : que toutes les mentions obligatoires sont présentes, et que les formules fonctionnent correctement si vous modifiez les quantités ou les prix. Il m'est arrivé de télécharger un template avec des formules figées qui ne se recalculaient pas. Inutilisable.</p>

<p>Il existe aussi un logiciel de facturation disponible gratuitement dans sa version de base, comme des outils en ligne type Henrri, Indy ou même les versions gratuites de Zoho Invoice. Pas toujours aussi flexibles qu'Excel pour la mise en page, mais bien plus fiables sur la conformité et la numérotation automatique.</p>

<h2>Le vrai problème d'Excel pour la facturation au quotidien</h2>

<p>Je vais être directe : au bout d'un moment, Excel devient un frein.</p>

<p>Voici ce que ça coûte concrètement dans mon quotidien d'avant :</p>

<ul>
  <li>Chercher manuellement le dernier numéro de facture utilisé avant d'en créer une nouvelle</li>
  <li>Copier-coller les coordonnées client à chaque fois (avec les fautes de frappe qui vont avec)</li>
  <li>Envoyer la facture en PDF après avoir fait "Enregistrer sous", puis ouvrir le mail, attacher le fichier... autant de manipulations qui mangent du temps</li>
  <li>Suivre les impayés à la main dans un autre fichier</li>
  <li>Ne pas avoir de vue globale sur ce qui a été payé, ce qui est en attente, ce qui est en retard</li>
</ul>

<p>Quand j'avais deux clients, c'était acceptable. À dix clients actifs avec des récurrences mensuelles, j'ai commencé à perdre le fil. Et perdre le fil en facturation, ça veut dire des impayés qui traînent et une comptabilité qui donne des maux de tête à l'expert-comptable en fin d'année.</p>

<p>J'ai aussi fait l'erreur de modifier une facture déjà envoyée directement dans le fichier original. Pas d'historique, pas de traçabilité. Un logiciel dédié ne vous laisse pas faire ça.</p>

<h2>Comparatif rapide : Excel versus un logiciel dédié pour une TPE</h2>

<table>
  <tr>
    <th>Critère</th>
    <th>Excel</th>
    <th>Logiciel de facturation</th>
  </tr>
  <tr>
    <td>Coût de départ</td>
    <td>Gratuit si déjà équipé</td>
    <td>Souvent 0 à 30€/mois</td>
  </tr>
  <tr>
    <td>Numérotation automatique</td>
    <td>Non, manuelle</td>
    <td>Oui, toujours</td>
  </tr>
  <tr>
    <td>Envoi direct par mail</td>
    <td>Non</td>
    <td>Oui pour la plupart</td>
  </tr>
  <tr>
    <td>Suivi des paiements</td>
    <td>Non, à gérer ailleurs</td>
    <td>Oui, tableau de bord intégré</td>
  </tr>
  <tr>
    <td>Relances automatiques</td>
    <td>Non</td>
    <td>Oui sur les offres payantes</td>
  </tr>
  <tr>
    <td>Conformité légale</td>
    <td>À vérifier soi-même</td>
    <td>Généralement intégrée</td>
  </tr>
  <tr>
    <td>Prise en main pour les salariés</td>
    <td>Variable selon leur niveau</td>
    <td>Souvent rapide (interfaces simples)</td>
  </tr>
</table>

<p>Ce tableau résume assez bien pourquoi j'ai fini par basculer vers un outil dédié. Non pas parce qu'Excel est mauvais, mais parce qu'il n'est pas fait pour ça sur la durée.</p>

<h2>Et si vous avez plusieurs salariés à former ?</h2>

<p>Dans mon agence, j'ai deux personnes qui gèrent la relation client et qui ont besoin d'émettre des factures ou des avoirs ponctuellement. Former quelqu'un sur Excel pour la facturation, c'est lui apprendre à ne pas casser les formules, à respecter la numérotation, à enregistrer dans le bon dossier, à exporter en PDF... Ça prend du temps et les erreurs arrivent quand même.</p>

<p>Sur un logiciel conçu pour ça, j'ai formé une collaboratrice en moins d'une heure. Interface claire, champs obligatoires bien indiqués, impossible d'envoyer une facture sans les mentions requises. Le gain de temps n'est pas imaginaire.</p>

<p>Si vous cherchez à comparer les options du marché, jetez un oeil aux <a href="https://www.entreprendrepourapprendre.org/meilleur-logiciel-de-facturation">meilleurs logiciels de facturation pour PME</a>, qui couvrent bien les besoins d'une structure de 1 à 20 personnes avec des critères concrets.</p>

<h2>Ma recommandation finale</h2>

<p>Excel pour facturer, oui, si vous démarrez, si vous avez très peu de clients, ou si vous voulez tester votre activité sans investir un euro de plus. Téléchargez un bon modèle de facture à reprendre, vérifiez les mentions légales, soyez rigoureux sur la numérotation, et ça fera le job pendant quelques mois.</p>

<p>Mais si vous avez déjà plusieurs clients actifs, si vous passez plus de trente minutes par semaine sur vos factures et votre suivi de paiements, ou si vous avez des salariés qui ont besoin d'y accéder, passez à un outil dédié. Le retour sur investissement est là, et rapidement.</p>

<p>Je déconseille de s'obstiner sur Excel par habitude ou pour économiser 15 euros par mois. Le temps perdu coûte beaucoup plus cher que ça.</p>
