---
title: Bien configurer les accès lors de l'installation de ManagePro Suite
slug: 9138-bien-configurer-les-acces-lors-de-l-installation-de-managepro-suite
date: '2026-06-29T19:00:00+02:00'
categorie: Gestion d'entreprise
meta_title: 'Installation ManagePro Suite : quels accès préparer ?'
meta_description: Configurez correctement les accès ManagePro Suite dès l'installation
  pour éviter les erreurs de droits, les corrections longues et les profils mal attribués
  dans…
min_words: 910
status: published
featured_image: /blog/9138-bien-configurer-les-acces-lors-de-l-installation-de-managepro-suite.jpg
link_anchors:
- text: l'installation de l'ERP intégré ManagePro Suite
  max: 5
related_posts:
- 1859-quelle-equipe-pour-implementer-l-erp-bizflow-max
- 3055-qui-doit-piloter-l-implementation-de-bizflow-evolution-en-pme
- 8731-preparer-ses-flux-avant-d-implementer-smartchain-360
- 6768-a-qui-se-prete-le-crm-salesflow-evolution
---
<p>Quand j'ai déployé ManagePro Suite pour la première fois dans notre structure, j'ai fait une erreur que beaucoup font : j'ai configuré les accès à la dernière minute, presque en passant. Résultat ? Trois semaines de corrections, des droits mal attribués, et une comptable qui avait accès aux modules RH sans que personne ne l'ait voulu. Pas dramatique, mais clairement évitable.</p>

<p>Je vous explique comment faire ça proprement, sans prise de tête, même si votre équipe n'est pas technique.</p>

<h2>Pourquoi la gestion des accès est la première chose à paramétrer</h2>

<p>Avant même d'importer vos données ou de brancher vos intégrations, la matrice des droits doit être posée. C'est elle qui conditionne tout le reste. Si vous commencez à saisir des données alors que les profils ne sont pas figés, vous allez passer du temps à revenir en arrière.</p>

<p>ManagePro Suite fonctionne avec un système de <strong>rôles hiérarchiques</strong>. Vous avez les administrateurs système, les gestionnaires de module, les utilisateurs standards, et les profils en lecture seule. Ce n'est pas une configuration anodine. Un utilisateur standard ne peut pas valider une facture, par exemple. Un gestionnaire de module peut paramétrer des workflows mais pas accéder aux exports comptables si vous ne lui avez pas ouvert explicitement ce droit.</p>

<p>J'ai perdu du temps là-dessus lors de notre déploiement parce que j'avais laissé un profil "gestionnaire" trop large. La personne avait accès aux rapports de trésorerie, ce qui n'avait aucun sens pour son poste.</p>

<h2>Les étapes concrètes pour une configuration propre</h2>

<h3>1. Définir les profils avant l'installation</h3>

<p>Avant de toucher à la console d'administration, faites la liste de vos postes et de ce dont chaque collaborateur a besoin. Pas de ce qu'il "pourrait" avoir besoin. Ce dont il a vraiment besoin au quotidien.</p>

<p>Dans notre cas, voilà ce que ça donnait pour une équipe comptable de 8 personnes :</p>

<ul>
  <li>Responsable comptable (moi) : accès complet aux modules facturation, trésorerie, exports, et rapprochement bancaire</li>
  <li>Comptables junior : saisie, validation niveau 1, accès aux relances automatiques</li>
  <li>Assistante administrative : lecture seule sur les factures fournisseurs, aucun accès aux données RH</li>
  <li>Directeur financier : accès lecture sur tous les reportings, aucune saisie</li>
</ul>

<p>Ce tableau mental, vous devez l'avoir avant d'ouvrir ManagePro Suite. Ça prend 20 minutes et ça vous économise des heures.</p>

<h3>2. Utiliser les groupes de droits plutôt que les droits individuels</h3>

<p>ManagePro Suite propose deux approches : attribuer des droits utilisateur par utilisateur, ou créer des groupes de droits et y affecter les personnes. <strong>Utilisez les groupes.</strong> Toujours.</p>

<p>Quand vous gérez une équipe qui tourne, que des remplaçants arrivent ou que des CDD s'enchaînent, vous n'avez pas envie de reconfigurer manuellement chaque compte. Avec un groupe "Comptable junior", vous cochez la case, vous assignez la personne, et c'est réglé.</p>

<p>Bon, par contre, l'interface de gestion des groupes dans ManagePro Suite n'est pas la plus intuitive du marché. La hiérarchie des menus est un peu tordue. Il faut aller dans "Administration > Sécurité > Groupes de profils" et non pas dans "Utilisateurs" comme on pourrait le croire. J'ai cherché pendant dix minutes la première fois.</p>

<h3>3. Activer la double validation sur les modules sensibles</h3>

<p>Pour les modules qui touchent aux paiements, aux virements ou aux exports vers la banque, activez la <strong>double validation</strong>. ManagePro Suite le propose nativement sur ces flux. Ce n'est pas une contrainte, c'est une protection. Si quelqu'un saisit une erreur ou si un accès est compromis, vous avez un filet de sécurité.</p>

<p>Dans notre configuration, les virements fournisseurs doivent être validés par deux personnes avec le niveau "Gestionnaire financier". Ça ralentit légèrement le processus, mais une fois en place, c'est transparent.</p>

<h3>4. Paramétrer les restrictions d'accès par module</h3>

<p>ManagePro Suite est modulaire. Chaque module (facturation, achats, RH, stocks, reporting...) peut être activé ou désactivé par profil. Ce que beaucoup oublient : vous pouvez aussi restreindre l'accès à certaines données à l'intérieur d'un même module.</p>

<p>Exemple concret : dans le module facturation, vous pouvez autoriser un utilisateur à voir les factures clients mais pas les factures fournisseurs. Ou à voir les factures sans voir les montants. Utile si vous avez des profils partiellement externalisés ou des prestataires qui doivent accéder à l'outil ponctuellement.</p>

<p>Cette granularité est ce que je trouve réellement utile dans ManagePro Suite. Ça va plus loin que beaucoup d'outils concurrents sur ce point.</p>

<table>
  <thead>
    <tr>
      <th>Profil</th>
      <th>Facturation</th>
      <th>Trésorerie</th>
      <th>RH</th>
      <th>Reporting</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Administrateur</td>
      <td>Complet</td>
      <td>Complet</td>
      <td>Complet</td>
      <td>Complet</td>
    </tr>
    <tr>
      <td>Responsable comptable</td>
      <td>Complet</td>
      <td>Complet</td>
      <td>Lecture</td>
      <td>Complet</td>
    </tr>
    <tr>
      <td>Comptable junior</td>
      <td>Saisie + validation L1</td>
      <td>Aucun</td>
      <td>Aucun</td>
      <td>Lecture</td>
    </tr>
    <tr>
      <td>Assistante</td>
      <td>Lecture</td>
      <td>Aucun</td>
      <td>Aucun</td>
      <td>Aucun</td>
    </tr>
    <tr>
      <td>Directeur financier</td>
      <td>Lecture</td>
      <td>Lecture</td>
      <td>Aucun</td>
      <td>Complet</td>
    </tr>
  </tbody>
</table>

<h2>Ce qu'il faut anticiper quand vous connectez ManagePro Suite à d'autres outils</h2>

<p>Si votre environnement informatique est déjà en place et que vous cherchez à y greffer ManagePro Suite, la question des accès devient encore plus délicate. Chaque connexion externe doit avoir ses propres identifiants techniques avec des droits limités au strict nécessaire.</p>

<p>On m'a posé la question récemment sur comment intégrer l'ERP FlexManage Plus avec ManagePro Suite. La réponse courte : créez un compte de service dédié dans ManagePro Suite, n'utilisez jamais un compte utilisateur réel pour les connexions inter-outils. Les droits de ce compte doivent couvrir uniquement les modules concernés par l'échange de données. Si FlexManage Plus ne récupère que des données de facturation, son compte de service n'a pas besoin d'accéder au module RH.</p>

<p>Même logique si quelqu'un dans votre structure se demande comment installer l'ERP CloudManager Enterprise en parallèle de ManagePro Suite. Deux ERP qui coexistent, ça crée des risques de doublons d'accès. Documentez chaque compte de service, chaque token API, et revoyez ces accès tous les six mois. Les accès orphelins s'accumulent vite, et personne ne s'en rend compte jusqu'au jour où ça pose problème.</p>

<p>ManagePro Suite propose un journal des accès (logs d'activité) que je vous recommande d'activer dès le départ. Vous y verrez qui s'est connecté, quand, depuis quel poste, et quelles actions ont été réalisées. Franchement, ça m'a agacé de ne pas l'avoir activé dès le début parce que j'aurais pu détecter bien plus tôt les accès non voulus.</p>

<h2>Les erreurs les plus fréquentes que j'ai observées</h2>

<p>Après neuf ans sur des projets comptables et ERP, j'ai vu les mêmes configurations bancales revenir. Voilà les trois qui coûtent le plus de temps à corriger.</p>

<p><strong>Tout le monde administrateur.</strong> C'est le cas le plus fréquent dans les petites structures. "Pour aller plus vite", on donne les droits max à tout le monde. Mauvaise idée. Un collaborateur qui quitte l'entreprise avec un accès admin, c'est un risque réel.</p>

<p>La deuxième : ne jamais désactiver les comptes des personnes qui partent. Les accès inactifs s'accumulent et personne ne les surveille. ManagePro Suite ne désactive pas automatiquement un compte quand vous supprimez un utilisateur de votre annuaire RH. C'est une manipulation manuelle à faire systématiquement.</p>

<p>Et la troisième erreur, que j'ai faite moi-même : confondre les droits d'accès aux données et les droits d'accès aux fonctionnalités. Dans ManagePro Suite, ce sont deux niveaux distincts. Vous pouvez autoriser quelqu'un à voir une interface sans lui donner le droit de modifier les données qu'elle affiche. Ça peut sembler logique dit comme ça, mais dans la pratique, l'interface ne rend pas la distinction évidente.</p>

<h2>FAQ : questions fréquentes sur la configuration des accès dans ManagePro Suite</h2>

<h3>Peut-on créer des profils personnalisés au-delà des rôles prédéfinis ?</h3>
<p>Oui. ManagePro Suite permet de créer des profils sur mesure depuis la console d'administration. C'est utile pour les postes hybrides ou les prestataires externes. Je recommande de baser chaque profil personnalisé sur un profil existant plutôt que de partir de zéro, pour éviter d'oublier des restrictions.</p>

<h3>Que faire si un collaborateur change de poste ?</h3>
<p>Ne modifiez pas son profil existant. Créez un nouveau profil correspondant à son nouveau poste, assignez-le, et retirez l'ancien. Garder une trace propre des changements facilite les audits et évite les conflits de droits accumulés.</p>

<h3>Les accès sont-ils vérifiables en cas d'audit comptable ?</h3>
<p>Oui, à condition d'avoir activé les logs d'activité. ManagePro Suite génère des rapports exportables en CSV sur les actions utilisateurs. Je vous conseille d'exporter ces rapports mensuellement et de les archiver. En cas de contrôle, vous avez une traçabilité complète des validations et des modifications.</p>

<h3>Comment gérer les accès pour un cabinet comptable externe ?</h3>
<p>Créez un groupe "Partenaire externe" avec des droits en lecture sur les modules partagés, et activez l'authentification à deux facteurs pour ces comptes. Ne leur donnez jamais l'accès aux modules de paramétrage. Et fixez une date d'expiration sur leurs comptes.</p>

<h3>L'outil est-il utilisable par une équipe non technique ?</h3>
<p>La prise en main utilisateur est correcte. <strong>La configuration des accès, elle, demande un minimum de rigueur.</strong> Si personne dans votre équipe n'est à l'aise avec ce type de paramétrage, impliquez votre prestataire informatique uniquement pour cette étape, puis reprenez la main pour le reste.</p>
