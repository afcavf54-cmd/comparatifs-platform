---
title: Localiser l'export CSV des données dans SalesTrack CRM
slug: 6473-localiser-l-export-csv-des-donnees-dans-salestrack-crm
date: '2026-07-14T07:00:00+02:00'
categorie: Gestion d'entreprise
meta_title: 'CRM SalesTrack : où trouver l''export de données en CSV ?'
meta_description: Trouvez facilement l'export CSV dans SalesTrack CRM grâce à ce guide pas à pas. Accédez à vos données contacts et clients en quelques clics, sans perdre de temps.
min_words: 970
status: published
featured_image: /blog/6473-localiser-l-export-csv-des-donnees-dans-salestrack-crm.jpg
link_anchors:
- text: comment exporter les données du CRM SalesTrack au format CSV
  max: 5
---

<p>Ça fait maintenant douze ans que j'accompagne des dirigeants sur le choix et la prise en main de leurs outils de gestion. Et une question revient régulièrement, plus souvent qu'on ne le croit : <strong>où trouver l'export CSV dans SalesTrack CRM ?</strong> Pas parce que le logiciel est mauvais. Simplement parce que cette fonctionnalité est parfois mal documentée, enfouie dans des menus peu visibles, et que la plupart des utilisateurs n'ont ni le temps ni l'envie de fouiller pendant une heure.</p>

<p>Cet article répond précisément à cette question. Étape par étape, sans jargon inutile, avec des exemples concrets tirés de situations réelles que j'ai rencontrées sur le terrain.</p>

<h2>Pourquoi l'export CSV est-il si utile dans un CRM ?</h2>

<p>Avant d'aller chercher le bouton, posons une seconde pourquoi cet export a autant de valeur. Un fichier CSV, c'est une extraction brute de vos données contacts, clients, opportunités ou historiques d'activité, dans un format lisible par n'importe quel tableur. Excel, Google Sheets, LibreOffice : tous les ouvrent sans problème.</p>

<p>Dans mon expérience d'accompagnement, j'ai vu des dirigeants utiliser ces exports pour :</p>

<ul>
  <li>préparer des campagnes de relance email hors CRM</li>
  <li>consolider des données dans un tableau de bord maison</li>
  <li>migrer des contacts vers une autre solution</li>
  <li>faire un audit rapide de la base clients avant une réunion commerciale</li>
</ul>

<p>Ces usages sont courants. Et dans la grande majorité des cas, l'export CSV reste le moyen le plus rapide d'accéder à la donnée brute, sans dépendre d'une API ou d'un développeur.</p>

<h2>Localiser l'export CSV dans SalesTrack CRM : le chemin exact</h2>

<p>SalesTrack CRM organise ses exports depuis deux endroits distincts selon le type de données que vous souhaitez extraire. C'est là que ça coince souvent.</p>

<h3>Pour les contacts et les leads</h3>

<p>Depuis votre tableau de bord principal, rendez-vous dans l'onglet <strong>Contacts</strong> (ou Leads selon la nomenclature choisie lors de votre configuration initiale). Une fois sur la liste, regardez en haut à droite de l'écran. Vous trouvez une icône avec trois points verticaux, parfois libellée "Actions" selon la version de l'interface.</p>

<p>Cliquez dessus. Un menu déroulant apparaît avec plusieurs options. L'export CSV est généralement en troisième ou quatrième position. Le fichier se génère directement et se télécharge dans votre dossier de téléchargement habituel.</p>

<p>Attention : si vous avez appliqué des filtres sur votre liste (par exemple, contacts d'une région précise ou d'un segment donné), l'export prend en compte uniquement les données filtrées. C'est pratique quand c'est voulu, frustrant quand on ne s'y attend pas. J'ai vu plusieurs utilisateurs perdre du temps là-dessus.</p>

<h3>Pour les opportunités et le pipeline commercial</h3>

<p>L'accès est légèrement différent. Depuis le module <strong>Pipeline</strong> ou <strong>Opportunités</strong>, vous devez basculer en vue liste (et non en vue kanban). La vue kanban, très visuelle, ne propose pas d'export direct. C'est une limite de l'interface que je trouve un peu frustrante, surtout pour les utilisateurs qui travaillent principalement en mode kanban.</p>

<p>Une fois en vue liste, le même menu "Actions" en haut à droite vous donne accès à l'export CSV des opportunités. Vous pouvez choisir d'exporter toutes les opportunités ou uniquement celles d'une étape précise de votre pipeline.</p>

<h3>Pour l'historique des activités</h3>

<p>Là, c'est moins direct. L'export des activités (appels, emails, rendez-vous) ne passe pas par le même menu. Il faut aller dans <strong>Rapports</strong>, sélectionner le rapport "Activités commerciales", puis utiliser le bouton d'export en bas du rapport. Ce bouton est discret, situé sous le tableau, pas toujours visible sans scroller. Je l'ai cherché moi-même pendant cinq minutes la première fois.</p>

<h2>Les paramètres à vérifier avant de lancer l'export</h2>

<p>Un export CSV mal configuré, c'est une perte de temps. Voici ce que je vérifie systématiquement avant de lancer une extraction dans SalesTrack.</p>

<ul>
  <li><strong>Les colonnes incluses</strong> : SalesTrack propose parfois un écran intermédiaire où vous choisissez les champs à exporter. Si cet écran n'apparaît pas, l'export inclut tous les champs par défaut, y compris des colonnes vides qui alourdissent le fichier.</li>
  <li>L'encodage du fichier : par défaut, SalesTrack exporte en UTF-8. Si vous ouvrez le fichier avec une ancienne version d'Excel sur Windows, vous pouvez avoir des problèmes d'affichage sur les accents. Pensez à importer le fichier manuellement via "Données > À partir d'un fichier texte/CSV" plutôt que de double-cliquer dessus.</li>
  <li>Les filtres actifs : comme mentionné plus haut, vérifiez toujours que votre liste n'est pas filtrée par erreur avant de lancer l'export.</li>
</ul>

<p>Ce dernier point semble basique. Mais j'ai accompagné un responsable commercial qui exportait régulièrement sa base avec un filtre "Statut : prospect chaud" toujours actif sans le savoir. Il travaillait depuis des semaines sur une base incomplète.</p>

<h2>SalesTrack, SalesFlow, SmartLead : ne pas confondre les interfaces</h2>

<p>J'ouvre une parenthèse utile. Plusieurs clients m'ont contacté en pensant utiliser SalesTrack alors qu'ils étaient sur un autre outil. L'offre CRM s'est beaucoup segmentée ces dernières années, et les noms se ressemblent parfois.</p>

<p>Si vous cherchez à comprendre comment utiliser le CRM SalesFlow Evolution, le chemin vers l'export CSV est différent : dans cette interface, l'export passe par un module dédié appelé "Extractions" accessible depuis le menu latéral, et non depuis les listes. La logique est inversée par rapport à SalesTrack.</p>

<p>Même remarque pour ceux qui voudraient savoir comment utiliser le CRM SmartLead Evolution : l'export CSV y est intégré directement dans chaque vue liste, avec un bouton visible en permanence en haut de tableau, ce qui le rend beaucoup plus accessible pour les utilisateurs peu à l'aise avec les menus imbriqués. C'est d'ailleurs sur ce point précis que je trouve SmartLead Evolution plus intuitif que SalesTrack pour les équipes non techniques.</p>

<p>Ces précisions ne sont pas anecdotiques. Si vous lisez un tutoriel générique sur l'export CRM et que les captures d'écran ne correspondent pas à ce que vous voyez, c'est probablement que l'article parle d'un outil différent du vôtre.</p>

<h2>Tableau comparatif : accès à l'export CSV selon les CRM</h2>

<table>
  <thead>
    <tr>
      <th>CRM</th>
      <th>Facilité d'accès à l'export</th>
      <th>Export depuis la vue kanban</th>
      <th>Choix des colonnes</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>SalesTrack CRM</td>
      <td>Moyen (menu Actions)</td>
      <td>Non</td>
      <td>Oui (écran intermédiaire)</td>
    </tr>
    <tr>
      <td>SalesFlow Evolution</td>
      <td>Moyen (module dédié)</td>
      <td>Non</td>
      <td>Oui</td>
    </tr>
    <tr>
      <td>SmartLead Evolution</td>
      <td>Facile (bouton visible)</td>
      <td>Non</td>
      <td>Oui</td>
    </tr>
  </tbody>
</table>

<p>Aucun des trois n'autorise l'export depuis la vue kanban. C'est une limite commune que je signale régulièrement aux équipes commerciales qui travaillent exclusivement en glisser-déposer.</p>

<h2>Quelques questions fréquentes sur l'export CSV dans SalesTrack</h2>

<h3>L'export inclut-il les notes et commentaires ?</h3>

<p>Non, par défaut. Les notes associées aux fiches contacts ne sont pas incluses dans le CSV standard. Pour les récupérer, il faut passer par l'export avancé disponible dans Rapports, ou configurer un champ personnalisé qui reprend les notes importantes dans un champ texte standard.</p>

<h3>Peut-on automatiser un export régulier ?</h3>

<p>SalesTrack ne propose pas d'export planifié en natif sur les versions standard. Vous pouvez passer par l'API si vous avez un développeur disponible, ou utiliser un connecteur Zapier/Make pour déclencher un export automatique vers Google Drive par exemple. J'ai mis en place ce type d'automatisation pour plusieurs clients qui avaient besoin d'une extraction hebdomadaire sans intervention manuelle. Ça prend deux heures à configurer et ça fait ensuite gagner du temps chaque semaine.</p>

<h3>Le format CSV de SalesTrack est-il compatible avec tous les outils ?</h3>

<p>Globalement oui. Le séparateur utilisé est la virgule (et non le point-virgule comme dans certains exports français). Si vous importez ce fichier dans un outil qui attend un point-virgule, vous aurez un problème de colonnes. Pensez à vérifier le séparateur attendu par votre outil de destination avant d'importer.</p>

<h3>Peut-on exporter les données d'un seul commercial ?</h3>

<p>Oui, en filtrant la liste par "Propriétaire" avant de lancer l'export. C'est utile pour les réunions de revue commerciale individuelle.</p>

<h2>Ce que je retiens après des années d'utilisation terrain</h2>

<p>L'export CSV dans SalesTrack fonctionne bien une fois qu'on a compris la logique de l'interface. Le vrai problème, c'est que cette logique n'est pas immédiatement évidente. Les menus sont cohérents entre eux, mais peu visibles pour quelqu'un qui découvre l'outil.</p>

<p>Je recommande de créer un petit guide interne d'une page dans votre entreprise, avec captures d'écran, pour les collaborateurs qui font ces exports régulièrement. Ça évite les allers-retours et les erreurs de filtrage.</p>

<p>Bon, par contre, si votre usage de l'export CSV est très fréquent et que vous trouvez le chemin trop long, c'est peut-être le signe que votre CRM actuel ne correspond plus à vos habitudes de travail. Dans ce cas, regarder d'autres solutions vaut le coup.</p>

<p>Un bon logiciel n'est pas celui qui propose le plus de fonctionnalités. C'est celui qui vous fait gagner du temps dès la première semaine d'utilisation.</p>
