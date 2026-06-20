---
title: Paramétrer le CRM Pipedrive Nexus Edition, en quelques étapes
slug: 1377-parametrer-le-crm-pipedrive-nexus-edition-en-quelques-etapes
date: '2026-06-20T11:00:00+02:00'
categorie: Gestion d'entreprise
meta_title: Comment paramétrer le CRM Pipedrive Nexus Edition
meta_description: Découvrez comment paramétrer Pipedrive Nexus Edition en quelques étapes simples, sans consultant ni formation, même pour une petite équipe de six personnes.
min_words: 920
status: published
featured_image: /blog/1377-parametrer-le-crm-pipedrive-nexus-edition-en-quelques-etapes.jpg
link_anchors:
- text: comment paramétrer le CRM Pipedrive Nexus Edition
  max: 5
---

<p>Quand j'ai commencé à chercher un CRM pour mon agence, j'ai passé des semaines à lire des comparatifs, des forums, des avis d'utilisateurs. J'ai regardé <a href="#">les avis sur le CRM ClientPulse Pro en 2024</a>, j'ai épluché <a href="#">les avis sur le logiciel CRM BusinessPro X4</a>, j'ai testé des démos. Et à chaque fois, même problème : soit c'était trop complexe pour une structure de six personnes, soit ça manquait de fonctionnalités vraiment utiles au quotidien.</p>

<p>Pipedrive Nexus Edition a fini par s'imposer dans mon organisation. Pas parce qu'il est parfait. Mais parce qu'on peut le paramétrer en quelques heures sans avoir besoin d'un consultant ou d'une formation de trois jours. Je vous explique comment je m'y suis prise.</p>

<h2>Avant de toucher quoi que ce soit : définir ce dont vous avez vraiment besoin</h2>

<p>C'est l'étape que tout le monde zappe. On s'emballe, on crée des champs, des pipelines, des automatisations... et trois semaines plus tard, le CRM ressemble à un chantier abandonné que personne n'utilise.</p>

<p>Ce que je fais systématiquement avant de configurer quoi que ce soit : je prends une heure avec mon équipe pour répondre à trois questions simples. Quelles sont nos étapes de vente réelles, pas idéales ? Quelles informations on a vraiment besoin de suivre sur un client ? Qui va utiliser l'outil, et à quelle fréquence ?</p>

<p>Pour nous, ça a donné un pipeline avec cinq étapes : prospect contacté, devis envoyé, devis relancé, négociation, gagné/perdu. C'est tout. Pas quinze étapes. Cinq.</p>

<p>Si vous partez sur une architecture trop compliquée dès le départ, vos salariés n'alimenteront pas le CRM. Et un CRM vide, ça ne sert strictement à rien.</p>

<h2>Le paramétrage initial pas à pas</h2>

<h3>Créer votre pipeline de vente</h3>

<p>Dans Pipedrive Nexus Edition, la configuration du pipeline se fait depuis le menu "Paramètres" puis "Pipelines". Vous pouvez créer autant de pipelines que vous voulez, mais je recommande d'en avoir un seul au démarrage. Un seul.</p>

<p>Donnez un nom à chaque étape. Court, clair, opérationnel. Évitez les noms marketing abstraits type "phase d'opportunité stratégique". Personne ne comprend. Appelez ça "Devis envoyé", c'est suffisant.</p>

<p>La Nexus Edition permet de <strong>définir une probabilité de closing automatique</strong> par étape. C'est utile pour le reporting de rentabilité : vous voyez en temps réel votre chiffre d'affaires prévisionnel pondéré. Concrètement, si j'ai 5 devis en cours à 20 000 € chacun avec une proba de 40 %, le tableau de bord m'affiche 40 000 € de CA probable. Ça aide à anticiper les mois creux.</p>

<h3>Configurer les champs personnalisés</h3>

<p>C'est là que beaucoup de gens se perdent. La tentation est forte d'ajouter 30 champs pour "avoir toutes les infos". Mauvaise idée.</p>

<p>Je me suis limitée à sept champs personnalisés en plus des champs natifs : secteur d'activité du client, taille de l'entreprise, canal d'acquisition, budget estimé, interlocuteur décisionnaire, date de relance souhaitée, et notes de contexte. C'est tout ce dont on a besoin pour qualifier un prospect et assurer le suivi.</p>

<p>Dans la Nexus Edition, les champs personnalisés se gèrent depuis "Paramètres" / "Personnalisation des données". Vous pouvez créer des champs texte, des listes déroulantes, des dates, des cases à cocher. Les listes déroulantes sont particulièrement pratiques pour les données catégorielles : ça évite les saisies libres incohérentes ("TPE", "tpe", "Petite entreprise"... vous voyez le problème).</p>

<h3>Paramétrer les automatisations de base</h3>

<p>La Nexus Edition intègre un moteur d'automatisation accessible sans coder. Ce n'est pas aussi puissant que Zapier, mais pour une TPE, c'est largement suffisant.</p>

<p>Les automatisations que j'ai mises en place dès le départ :</p>

<ul>
  <li>Rappel automatique si une affaire reste bloquée dans la même étape plus de sept jours</li>
  <li>Email de notification à la commerciale concernée dès qu'un devis passe en étape "relancé"</li>
  <li>Création automatique d'une tâche de suivi quand une affaire est marquée "gagnée" (pour lancer la phase onboarding client)</li>
</ul>

<p>Ces trois automatisations m'ont fait gagner du temps dès la première semaine. Pas des heures par jour, mais une bonne heure par semaine sur les relances oubliées et les oublis de suivi. Sur un mois, c'est significatif.</p>

<p>Bon, par contre, l'interface de création des automatisations est un peu austère. Pas franchement intuitive. J'ai mis environ deux heures à bien comprendre la logique "déclencheur / condition / action". Une fois qu'on a compris, ça va. Mais au départ, j'ai trouvé ça frustrant.</p>

<h2>La configuration des accès et des rôles utilisateurs</h2>

<p>Avec six salariés, la gestion des droits d'accès n'est pas un sujet ultra complexe. Mais c'est quand même un paramètre qu'on ne peut pas ignorer.</p>

<p>Dans mon agence, tout le monde n'a pas besoin de voir toutes les affaires. J'ai configuré trois niveaux d'accès distincts. Moi, j'ai accès à tout. Les chargés de projet voient uniquement leurs affaires en cours. Mon assistante administrative peut consulter les contacts et les devis mais pas modifier les étapes du pipeline.</p>

<p>La Nexus Edition gère ça via des "profils de visibilité" configurables depuis le panneau d'administration. <strong>C'est une fonctionnalité que je n'avais pas forcément anticipé d'utiliser</strong>, mais qui s'est révélée utile pour éviter que n'importe qui ne déplace des affaires par erreur.</p>

<p>Un reproche que j'ai là-dessus : la gestion des équipes et sous-équipes est un peu rigide. Si vous avez des structures hiérarchiques complexes, vous allez vite vous heurter aux limites. Pour nous, ça passe. Pour une structure avec des commerciaux régionaux et des managers intermédiaires, ça deviendrait vite compliqué.</p>

<h2>Synchronisation et intégrations : ce qui fonctionne vraiment</h2>

<p>Un CRM isolé de vos autres outils, ça ne sert pas à grand chose. Ce qui m'intéressait dans la Nexus Edition, c'était la capacité à connecter sans effort les outils qu'on utilisait déjà.</p>

<p>La synchronisation Gmail fonctionne bien. Tous les échanges par email sont automatiquement rattachés à la fiche client correspondante. Plus besoin de copier-coller des emails dans des notes. Ça paraît simple, mais ça change vraiment la vie au quotidien.</p>

<p>On utilise aussi l'intégration avec notre outil de devis. Quand un devis est créé depuis notre logiciel de facturation, il remonte automatiquement dans la fiche Pipedrive. Le statut du devis (envoyé, accepté, refusé) se met à jour en temps réel. C'est le genre de synchronisation qui évite les doubles saisies et les erreurs.</p>

<p>Par contre, l'intégration avec Slack est basique. On reçoit des notifications, c'est tout. Pas de workflows avancés depuis Slack. Si vous avez une équipe qui travaille beaucoup sur Slack, vous serez peut-être déçus.</p>

<table>
  <thead>
    <tr>
      <th>Fonctionnalité</th>
      <th>Utilité pour une TPE</th>
      <th>Facilité de configuration</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Pipeline personnalisable</td>
      <td>Très utile</td>
      <td>Facile</td>
    </tr>
    <tr>
      <td>Champs personnalisés</td>
      <td>Utile</td>
      <td>Facile</td>
    </tr>
    <tr>
      <td>Automatisations</td>
      <td>Très utile</td>
      <td>Moyen</td>
    </tr>
    <tr>
      <td>Gestion des droits</td>
      <td>Utile</td>
      <td>Facile</td>
    </tr>
    <tr>
      <td>Synchronisation email</td>
      <td>Indispensable</td>
      <td>Très facile</td>
    </tr>
    <tr>
      <td>Reporting rentabilité</td>
      <td>Très utile</td>
      <td>Moyen</td>
    </tr>
    <tr>
      <td>Intégration Slack</td>
      <td>Limitée</td>
      <td>Facile</td>
    </tr>
  </tbody>
</table>

<h2>Le reporting : l'étape que j'ai sous-estimée au départ</h2>

<p>Je pensais que le paramétrage des tableaux de bord, c'était une question de confort. En réalité, c'est ce qui m'a permis de reprendre le contrôle sur la rentabilité de l'agence.</p>

<p>La Nexus Edition propose des rapports natifs sur le volume d'affaires par étape, le taux de conversion entre étapes, le chiffre d'affaires généré par commercial, et la durée moyenne d'un cycle de vente. Ces quatre indicateurs suffisent pour piloter une petite structure.</p>

<p>J'ai configuré un tableau de bord que j'ouvre chaque lundi matin. Quinze minutes de lecture, et j'ai une vision claire de ce qui est en cours, ce qui bloque, et ce qui risque de tomber dans les semaines à venir. C'est ce que je cherchais depuis le début.</p>

<p>Là j'ai un vrai reproche : les exports de reporting sont en CSV basique. Si vous voulez des graphiques élaborés ou des rapports mis en forme pour une présentation, vous devrez retraiter le fichier dans Excel ou Google Sheets. C'est dommage, parce que les données sont là, mais la mise en forme finale reste manuelle.</p>

<h2>Pour qui ce paramétrage a du sens, pour qui non</h2>

<p>Si vous gérez une équipe de deux à quinze personnes, que vous avez un cycle de vente avec plusieurs étapes distinctes, et que vous voulez centraliser le suivi client sans vous perdre dans des fonctionnalités que vous n'utiliserez jamais, Pipedrive Nexus Edition est un bon choix.</p>

<p>Si vous faites du e-commerce pur, si vous avez besoin d'un CRM avec une gestion de tickets support intégrée, ou si votre process de vente est ultra complexe avec des arborescences de décision multiples, passez votre chemin. Ce n'est pas l'outil qu'il vous faut.</p>

<p>Le paramétrage que je décris ici m'a pris environ une journée de travail en tout, en comptant les allers-retours avec mon équipe. Pas une semaine. Pas un mois. Une journée. Et depuis, les salariés l'utilisent vraiment, ce qui n'était pas le cas avec notre ancien outil.</p>

<p>C'est ça, finalement, le vrai critère. Un CRM que personne n'alimente, c'est de l'argent dépensé pour rien.</p>
