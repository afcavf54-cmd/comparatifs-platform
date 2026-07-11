---
title: Ce que les modules mobiles de sécurité ERP ne couvrent pas
slug: 5240-ce-que-les-modules-mobiles-de-securite-erp-ne-couvrent-pas
date: '2026-07-11T12:00:00+02:00'
categorie: Gestion d'entreprise
meta_title: 'Modules mobiles de sécurité ERP Paris : les limites'
meta_description: 'Les modules mobiles de sécurité ERP ont des limites que vos éditeurs ne mentionnent pas. Droits désynchronisés, journaux incomplets : voici ce qu''il faut vraiment…'
min_words: 910
status: published
featured_image: /blog/5240-ce-que-les-modules-mobiles-de-securite-erp-ne-couvrent-pas.jpg
link_anchors:
- text: les modules mobiles de sécurité ERP à Paris
  max: 5
---

<p>J'utilise un ERP depuis deux ans maintenant. Pas le plus sophistiqué du marché, mais ça tourne. Et depuis quelques mois, on m'a vendu l'idée des modules mobiles de sécurité intégrés à la solution. L'argument : gérer les accès, les droits utilisateurs, les alertes, directement depuis son téléphone. Sur le papier, c'est séduisant. Dans la vraie vie de chef d'entreprise à Marseille avec une équipe de 150 personnes, c'est une autre histoire.</p>

<p>Je vais vous expliquer ce que j'ai découvert. Pas pour vous décourager, mais parce que <strong>personne ne vous dit vraiment ce que ces modules ne font pas</strong>. Et ça, ça peut coûter cher.</p>

<h2>Ce qu'on vous promet, et la réalité</h2>

<p>Les éditeurs ERP mettent en avant leurs modules mobiles de sécurité comme une solution complète. Authentification à deux facteurs, gestion des rôles, journaux d'activité en temps réel. Franchement, les démonstrations sont bien faites. J'ai failli signer sans trop poser de questions.</p>

<p>Bon, par contre, dès qu'on gratte un peu, les limites apparaissent vite.</p>

<p>La première chose qui m'a frappé : <strong>la gestion des droits mobiles est souvent déconnectée du back-office</strong>. Concrètement, vous définissez des permissions sur l'application mobile, mais elles ne se synchronisent pas automatiquement avec votre ERP principal. J'ai eu un technicien qui avait accès à des modules sensibles sur mobile alors que ses droits avaient été révoqués côté bureau. On l'a découvert par hasard. Ce n'est pas un cas isolé.</p>

<p>Deuxième limite : les journaux d'activité mobile sont souvent incomplets. Sur desktop, vous avez des logs détaillés, des horodatages précis, des traces d'export. Sur mobile ? Un simple "l'utilisateur a consulté le module stock" sans aucun détail sur ce qui a été visualisé ou téléchargé. Pour une entreprise qui manipule des données fournisseurs ou des tarifs confidentiels, c'est insuffisant.</p>

<h2>Les zones grises que personne ne mentionne</h2>

<p>Il y a des angles morts qui reviennent systématiquement. Et je ne parle pas de cas extrêmes, je parle de situations du quotidien.</p>

<p><strong>La gestion hors ligne.</strong> Quand un collaborateur utilise l'application ERP mobile sans connexion, les politiques de sécurité ne s'appliquent plus vraiment. Les données sont mises en cache local, parfois sans chiffrement. Si le téléphone est perdu ou volé dans cet état, vous n'avez aucun contrôle. J'ai posé la question à mon éditeur. Réponse vague. J'ai insisté. Finalement : "c'est prévu dans la prochaine version". Pas rassurant.</p>

<p>La question des applications tierces connectées, c'est là que ça devient compliqué. On m'a demandé un jour comment gérer ses stocks avec Inventory Control Smart, un outil que mon responsable logistique voulait brancher via API sur notre ERP. La réponse que j'ai dûe chercher moi-même : le module mobile de sécurité de notre ERP ne surveille pas du tout les connexions API externes. Les droits s'appliquent à l'application native, pas aux intégrations. Résultat : un outil tiers peut accéder à vos stocks sans passer par les contrôles habituels. Personne ne vous prévient de ça à la signature.</p>

<p>L'autre angle mort, c'est la gestion des sessions actives. Sur desktop, forcer la déconnexion d'un utilisateur depuis l'interface d'administration, c'est immédiat. Sur mobile, les tokens d'authentification peuvent rester valides plusieurs heures après révocation. J'ai testé. Mon propre compte, après désactivation côté admin, restait fonctionnel sur mobile pendant <strong>presque trois heures</strong>. Pour un employé qui part en mauvais termes, c'est une vraie fenêtre de vulnérabilité.</p>

<h2>Ce que les modules mobiles ne couvrent vraiment pas</h2>

<p>Pour être direct avec vous, voici ce que j'ai listé après deux ans d'utilisation et quelques mauvaises surprises.</p>

<ul>
  <li>Le chiffrement des données en cache local n'est pas garanti sur tous les appareils Android, surtout les versions anciennes.</li>
  <li>Les alertes de comportement anormal (exports massifs, connexions nocturnes) sont absentes ou très basiques sur la version mobile.</li>
  <li>La gestion des appareils eux-mêmes (MDM) n'est pas du ressort de l'ERP, et l'intégration avec des solutions comme Microsoft Intune ou Jamf est souvent à construire manuellement.</li>
  <li>Les workflows de validation, par exemple une double approbation pour une modification de tarif, ne fonctionnent pas toujours correctement depuis mobile. J'ai eu des validations passées en un clic sans la deuxième étape.</li>
  <li>Le reporting de sécurité mobile est quasi inexistant dans la plupart des ERPs mid-market. Vous n'avez pas de vue consolidée "qui a fait quoi depuis quel appareil".</li>
</ul>

<p>Je ne cherche pas à dramatiser. Mais quand on gère une équipe commerciale itinérante avec accès aux données clients, ces lacunes ont un impact réel.</p>

<p>J'ai eu le même genre de réflexion quand j'ai cherché comment utiliser le CRM SalesTrack Evolution en parallèle de mon ERP. L'idée était de centraliser la relation client tout en gardant la traçabilité côté ERP. Le problème : les modules mobiles des deux outils ne communiquent pas sur les droits d'accès. Un commercial peut consulter une fiche client dans SalesTrack Evolution avec des permissions larges, alors qu'il n'aurait pas dû y accéder selon les règles définies dans l'ERP. Les silos de sécurité entre outils, c'est un vrai sujet que les éditeurs minimisent.</p>

<h2>Tableau récapitulatif : couverture réelle des modules mobiles ERP</h2>

<table>
  <thead>
    <tr>
      <th>Fonctionnalité de sécurité</th>
      <th>Couverture desktop</th>
      <th>Couverture mobile</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Gestion des droits utilisateurs</td>
      <td>Complète</td>
      <td>Partielle, souvent non synchronisée</td>
    </tr>
    <tr>
      <td>Journaux d'activité détaillés</td>
      <td>Oui</td>
      <td>Basique, souvent incomplet</td>
    </tr>
    <tr>
      <td>Révocation de session immédiate</td>
      <td>Oui</td>
      <td>Non, délai de plusieurs heures</td>
    </tr>
    <tr>
      <td>Chiffrement données hors ligne</td>
      <td>N/A</td>
      <td>Variable selon l'appareil</td>
    </tr>
    <tr>
      <td>Contrôle des connexions API tierces</td>
      <td>Partiel</td>
      <td>Absent dans la plupart des cas</td>
    </tr>
    <tr>
      <td>Alertes comportement anormal</td>
      <td>Oui (souvent)</td>
      <td>Rarement disponible</td>
    </tr>
    <tr>
      <td>Workflows de validation multi-étapes</td>
      <td>Oui</td>
      <td>Instable, bugs fréquents</td>
    </tr>
  </tbody>
</table>

<h2>Ce que je fais concrètement pour compenser</h2>

<p>J'ai arrêté d'attendre que l'éditeur règle tout ça. J'ai pris quelques décisions pragmatiques.</p>

<p>D'abord, on a limité les droits d'accès mobile à la consultation uniquement pour la majorité des collaborateurs. Les modifications sensibles passent obligatoirement par desktop. Ça réduit la surface d'attaque sans bloquer la productivité.</p>

<p>On a aussi mis en place une politique d'appareil propre : <strong>aucun accès ERP mobile sur appareil personnel</strong>. Uniquement sur les téléphones fournis par l'entreprise, avec MDM activé. C'est une contrainte, mais ça dort mieux la nuit.</p>

<p>Et les exports depuis mobile ? Désactivés. Point. Si quelqu'un a besoin d'exporter des données, ça se fait depuis un poste fixe avec traçabilité complète.</p>

<p>Là j'ai un vrai reproche à faire aux éditeurs ERP : ces configurations de base devraient être proposées par défaut, pas laissées à la charge du client qui n'a pas forcément les compétences techniques pour y penser. Moi, j'ai mis plusieurs mois à comprendre où étaient les failles. Un dirigeant sans profil IT ne les verrait pas du tout.</p>

<h2>Ce que vous devriez exiger avant de signer</h2>

<p>Si vous êtes en train d'évaluer un ERP avec module mobile de sécurité, voici les questions à poser. Sans exception.</p>

<ul>
  <li>La synchronisation des droits entre mobile et desktop est-elle en temps réel ou différée ?</li>
  <li>Que se passe-t-il pour les données mises en cache quand un utilisateur est révoqué ?</li>
  <li>Le module surveille-t-il les connexions API tierces comme les outils de stock ou CRM externes ?</li>
  <li>Avez-vous un rapport consolidé d'activité mobile avec détail par appareil et par utilisateur ?</li>
  <li>Les workflows de validation sont-ils identiques sur mobile et desktop ?</li>
</ul>

<p>Si les réponses sont floues ou renvoyées à une prochaine mise à jour, prenez-en note. Ça vous donnera un levier de négociation, ou une raison claire de regarder ailleurs.</p>

<p>Les modules mobiles ERP ont progressé. Mais ils restent <strong>très en retard sur la version desktop</strong> en matière de sécurité réelle. L'interface est belle, l'expérience utilisateur s'améliore, mais la profondeur des contrôles n'y est pas encore. Ça viendra probablement. En attendant, vaut mieux le savoir avant d'y mettre ses données sensibles.</p>
