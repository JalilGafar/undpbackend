# Mise en production — éléments en attente

Document vivant : tout ce qui a été développé **depuis le dernier déploiement** et qui doit être mis en ligne.
Dernier déploiement : **01/11/2026** (vagues, rôles et évaluation par instance, consultant en charge, Diagnostic général : recommandations et impression, listes CITI), suivi du correctif du 02/11/2026 (voir C). Le déploiement précédent date du 28/10/2026.

**Lot prêt à envoyer (généré le 05/11/2026) : dossier `deploiement-2026-11-05/`** = correctif de l'outil 1K (F) + nouvel outil 1E_a Diagnostic BPF (G). Il contient `TAILLES-ATTENDUES.txt` (ordre d'envoi, octets attendus, tests après mise en ligne), `sql/` (scripts 4 et 5, rejouables), `backend-bpf-et-correctif-1k-2026-11-05.zip` (6 fichiers) et `backend/` (mêmes chemins que le serveur), `verifier.sh` (39 fichiers), `site-2026-11-05-sans-assets.zip` / `site-2026-11-05.zip` et `securite-A-FAIRE.txt` (voir 3 ter : **toujours non traité le 05/11/2026**, les fichiers de configuration du serveur répondaient encore « 200 »). La section « Contenu du déploiement du 01/11/2026 » plus bas décrit le lot **déjà en ligne**.

Hébergement : LWS / cPanel + Passenger (« Setup Node.js App », Node 22). Envoi manuel des fichiers par « Upload »,
puis **un seul** redémarrage. Journal d'erreurs : `~/logs/passenger.log` (`tail -n 60`).

## Règles à respecter à chaque déploiement
1. **Base de données d'abord** (scripts de `migrations/`, dans l'ordre), puis le code.
2. **Ne jamais écraser** `app/config/dbcon.js` et `app/config/db.config.js` : les identifiants de production diffèrent de ceux du poste local.
3. Envoyer **tous** les fichiers de la liste. Des fichiers dépendent les uns des autres : **un seul fichier manquant empêche le démarrage**
   (le navigateur affiche alors une erreur CORS sur `/api/auth/signin`). Incidents : 19/10 (`auth.controller.js` ancien) et 28/10
   (`suivi.routes.js` oublié).
4. Ne pas envoyer `node_modules`, `uploads/`, `private/` ni d'archive laissée sur le serveur. Si `package.json` a changé : « Run NPM Install ».
5. **Après l'envoi, coller la commande de vérification** (`deploiement-…/verifier.sh`, dans le terminal cPanel, dossier `nodeapi`) :
   chaque ligne doit afficher `OK`. Elle contrôle les **fichiers dont le serveur a besoin au démarrage** (39 pour le lot du 05/11 : les 6 du lot et les 33 déjà en ligne ; tailles, ou simple présence pour `dbcon.js`, `db.config.js`, `auth.config.js` dont le contenu diffère en production). Elle n'affiche **que les anomalies** puis un total (« 39 fichiers OK, 0 PROBLEME »). Elle signale toute archive ou `diag.js` oubliés à la racine (`A SUPPRIMER`) et teste, depuis le serveur, si des fichiers sensibles sont **téléchargeables depuis Internet** (`TELECHARGEABLE DEPUIS INTERNET`).
   Deux fichiers anciens ont, en ligne, une taille différente de celle du poste local, sans conséquence (constaté le 01/11/2026) : `server.js` 1249 octets en ligne (sans les 3 lignes de commentaires `////` du haut) et `authJwt.js` 2374 octets. **Ne pas les remplacer** ; la commande attend leur taille en ligne.
6. Redémarrer **une seule fois**, puis ouvrir `https://nodeapi.sdp-gyb-cmr.com/` : la réponse doit être `{"message":"Welcome to bezkoder application."}`.
   Une route montée répond « No token provided! » sans jeton ; « Cannot GET » = fichier absent ou pas à jour.
7. Ensuite seulement : `ng build` et envoi du frontend (`dist/undptools/browser/`). Les utilisateurs déjà connectés acceptent la bannière de mise à jour.
8. Ne pas laisser de `diag.js` ni d'archives sur le serveur.

## Contenu du déploiement du 01/11/2026 (depuis celui du 28/10/2026)

Trois chantiers livrés ensemble : **les vagues du GYB**, **les rôles / l'évaluation des livrables par instance** (avec le changement du consultant en charge) et **le champ des recommandations du Diagnostic général**.
Le dossier `deploiement-2026-10-30/` (à côté de `BackUndp/` et `undptools/`) contient le lot : `backend/` (mêmes chemins que le serveur),
`backend-vagues-2026-10-30.zip` (les 21 fichiers), `sql/` (3 scripts numérotés), `site-2026-11-01-sans-assets.zip` et `site-2026-11-01.zip` (le site construit le 01/11/2026), `TAILLES-ATTENDUES.txt` et `verifier.sh`.
Si le code change encore avant l'envoi : régénérer le lot (serveur) **et reconstruire le site** (`ng build`, production), puis refaire les archives du site.

### A. Les vagues
Chaque entreprise appartient à une seule vague (`entreprises.id_vague`) ; le choix de vague est un filtre d'affichage (`?vagues=2,3`, absent ou
`all` = toutes) qui n'ouvre aucun droit ; une vague **clôturée** verrouille les saisies des consultants (réponse 423) ; seul l'**administrateur**
gère les vagues. Côté site : bande « Vague 3 · 12 entreprises » et feuille de choix, pastille de vague, bandeau et lecture seule en vague clôturée,
page `/manager/vagues` (créer, dater, démarrer, clôturer / rouvrir, supprimer, répartir les entreprises). Toutes les entreprises existantes passent
en « Vague 1 » : l'administrateur les répartit ensuite.

### B. Rôles et évaluation des livrables par instance
- **Nouveau rôle « Évaluateur » (RBLAC).** Administrateur = **Bureau Pays**. Seuls ces deux rôles posent une mention « Validé » / « À améliorer » ;
  le **modérateur commente** sans pouvoir évaluer. Administrateur, évaluateur et modérateur consultent toutes les données (jamais d'écriture dans les outils).
- **L'instance est posée par le serveur** d'après le rôle de l'auteur (colonne `livrable_reviews.instance`), jamais par le client. Chaque instance a sa
  mention : la plus récente de ses membres fait foi. Chacun (consultant compris) voit « Validé par le Bureau Pays », « À améliorer (RBLAC) »…
  et chaque avis porte son instance. État global d'un livrable (règle unique, `overallState` dans `livrable-review.service.ts`) : *à améliorer* si une
  instance le demande ; *validé* si les deux ont validé ; *en attente* si une seule a validé ; sinon *non évalué*.
- **Tableau des livrables** : colonnes et filtres « Bureau Pays » / « RBLAC », pastille « En attente », export CSV avec les deux mentions.
- **Inscription sécurisée.** ⚠ Avant, la page publique `/register` permettait de se créer un compte **admin** (le serveur acceptait le rôle demandé).
  Désormais : sans administrateur connecté, le compte est toujours un compte consultant ; seul un administrateur attribue un autre rôle ; un seul rôle par utilisateur.
- **Page « Utilisateurs et rôles »** (`/manager/utilisateurs`, administrateur seul) : liste des comptes, changement de rôle avec confirmation ;
  on ne modifie pas son propre rôle. Le changement est immédiat côté droits ; côté affichage, l'utilisateur le voit à sa prochaine connexion.
  Accès : carte de l'accueil manager, **menu du compte et tiroir de navigation** (avec « Vagues »), et bouton « Changer le rôle » sur le profil d'un consultant.
  **Cette page n'existe pas en ligne tant que ce lot n'est pas déployé** : d'ici là, les rôles se changent encore dans la base.

### C. Entreprises : changer le consultant en charge
Fiche entreprise (`/manager/company/:id`) → « Modifier » → liste « Consultant en charge » (**administrateur seul** ; un modérateur voit le nom mais ne modifie pas).
- **Les livrables suivent l'entreprise** : les 16 tables où chaque ligne porte `cons_id` (prédiagnostic, diagnostic 1D et archive, activités, BMC, cartographie, 5S,
  analyse financière, image commerciale, productivité, profil, quick wins, suivi et évaluation, minutes, avis) passent au nouveau consultant, en **une transaction**
  (tout ou rien). Sans cela, le nouveau consultant ouvrirait des outils vides (les outils se lisent par entreprise **et** consultant) et les évaluations resteraient
  attachées à l'ancien. L'auteur d'un avis (`reviewer_id`) et l'auteur d'une photo (`uploaded_by`) ne changent pas ; les avis redeviennent « nouveaux » pour le nouveau consultant.
- L'ancien consultant n'a plus accès à l'entreprise (403) et ne la voit plus dans « Mes entreprises ».
- Refus clair (409, rien n'est modifié) si le consultant choisi a **déjà** saisi un livrable de même type pour cette entreprise (clé unique consultant + entreprise) : cas possible seulement après un changement fait à la main dans la base.
- Le consultant choisi doit avoir le rôle consultant. Le transfert est écrit dans le journal du serveur (`[transfert] entreprise …`) ; il n'y a pas de table d'historique.
- **Correctif du 02/11/2026** (erreur 500 en production au premier essai) : le transfert mettait à jour 16 tables dont `minutes_reunion`, ancienne version des minutes que plus aucun code n'utilise et qui n'existe sans doute pas en ligne (`ER_NO_SUCH_TABLE`, tout est annulé). Il ne met désormais à jour que les tables **qui existent réellement** dans la base avec `cons_id` et `comp_id` (les autres sont ignorées et notées dans le journal : `[transfert] tables ignorées …`), et un refus de la base affiche un message avec son code (`erreur de base de données ER_…`) au lieu d'un « 500 » muet. Un échec ne laisse rien de modifié (une seule transaction).
- Ajout au passage : le secteur d'activité s'affiche et se modifie sur la fiche. **Avant, enregistrer la fiche effaçait le secteur** (le formulaire ne l'envoyait pas et le serveur écrivait « vide ») ; le serveur ne met désormais à jour que les champs reçus.

### D. Diagnostic général (1D) : champ des recommandations
Reprend la page « Aperçu » de l'outil original : **principales conclusions et lacunes**, **recommandations** et **problèmes identifiés** (chaque problème avec 2 lignes : référence, indicateur, valeur initiale, prévision). Tout est facultatif. **Chaque liste commence par un seul champ ; le consultant en ajoute à son gré (bouton « Ajouter… (n / 15) »), 15 au plus par liste, et peut en retirer (il en reste toujours un).**
- **Fin du questionnaire** : le bouton du 64e élément devient « Voir les résultats ». Il **enregistre automatiquement les réponses** (si elles ont changé ; jamais de ligne vide) puis ouvre une **dernière étape** : les 8 scores, le radar (d'après les réponses en cours) et, juste en dessous, **les champs des conclusions, recommandations et problèmes identifiés**. **« Enregistrer l'outil » n'apparaît qu'ici** (il enregistre aussi les recommandations et ramène au Résumé) ; on peut l'utiliser sans remplir les recommandations.
- **Raccourci « Conclusions et recommandations »** (en tête de l'onglet matrice, et sous la barre de progression des questions) : mène directement à cette dernière étape **sans parcourir les 64 éléments**. Mêmes règles : réponses enregistrées seulement si elles ont changé, message « Vos réponses ont été enregistrées (n / 60 questions répondues) » si le diagnostic est partiel. Disponible aussi en lecture seule (« Consulter la matrice »).
- **Onglet Résumé** : deux boutons, « Consulter en détail » et « Voir les recommandations ». Le second déroule la section : s'il y a du contenu, les champs ; **sinon le message « Aucune conclusion ni recommandation n'a été saisie pour ce diagnostic. » avec, à côté, le bouton « Remplir cette partie »** pour le consultant en charge (pour les autres : la raison à la place du bouton). Le consultant les modifie et les enregistre à part (« Enregistrer les recommandations », sans toucher aux réponses).
- **Lecture seule** (manager, évaluateur, ou consultant dont la vague est clôturée) : champs désactivés s'il y a du contenu ; sinon le message et la raison (« Seul le consultant en charge… » ou « Vague 1 est clôturée… »), jamais de bouton pour remplir.
- Stockage : une colonne texte JSON `recommandations` sur la ligne du diagnostic (listes de longueur libre, 15 au plus ; les éléments vides en fin de liste ne sont pas conservés ; un enregistrement fait avec 4 / 4 / 3 cases s'ouvre raccourci à ce qui est rempli) ; elle suit donc le transfert d'une entreprise à un autre consultant. Les diagnostics déjà enregistrés n'ont aucune recommandation. Un ancien site (resté en cache) qui enregistre le questionnaire **garde** les recommandations existantes.
- **Imprimer / PDF** (barre d'actions du Résumé, pour le consultant comme pour un manager ; pas dans l'onglet matrice ni sans diagnostic enregistré) : le rapport contient **les scores et le radar, le détail de toutes les réponses avec leurs commentaires (8 domaines + difficultés / forces / faiblesses / besoins) et les recommandations**, quel que soit ce qui est déplié à l'écran. En-tête : entreprise, consultant en charge, date d'enregistrement du diagnostic, date d'impression. Les recommandations s'impriment en **texte lisible** (listes numérotées et tableau des problèmes à 5 colonnes), pas dans des zones de saisie qui couperaient les textes longs. Pas d'en-tête de site, d'onglets, de boutons ni de bloc d'évaluation à l'impression ; le bandeau bleu est remplacé par un cadre sobre ; les couleurs des barres de score sont conservées. Le PDF s'obtient par « Enregistrer au format PDF » dans la fenêtre d'impression du navigateur. Un diagnostic complet fait environ 7 à 10 pages A4.
- Pas encore repris : le tableau « Note / Concept » et l'échelle de référence de la page originale (insuffisant ≤ 2, à améliorer de 2,1 à 3, suffisant > 3) ; l'outil garde ses barres de score et son radar.

### E. Suivi et évaluation (tse) : listes CITI complètes (site seulement, rien côté serveur)
Rubrique 2, « CITI à un / deux / trois chiffres » : le menu s'arrêtait à **60 lignes** (88 divisions et 238 groupes au total) avec « … n autres : précisez la recherche ». Désormais **toutes les options sont dans le menu**, que l'on fait défiler (compteur « 238 choix »), sans avoir à connaître un code ou un nom ; la recherche reste disponible. Corrigé dans le composant partagé `search-select` :
- sur téléphone, **faire défiler la liste au doigt ne choisit plus une ligne par erreur** (le choix se faisait au « touchend » : avec une liste complète, on aurait choisi un secteur au hasard en la parcourant) ; on choisit maintenant par un toucher ;
- le menu s'ouvre sur le choix actuel, est plus haut (60 % de l'écran au plus) et la page défile au besoin pour qu'il ne passe pas sous la barre « Enregistrer ».

### F. Correctif du 04/11/2026 : Diagnostic d'image commerciale (1K), « Non applicable » et « Passable »
Constat : le site déployé le 01/11 contenait un ajustement manuel de `t1k` (réponse « Non applicable », et « moyenne » renommée « passable »). Le serveur et la base, eux, n'acceptaient que `bonne`, `moyenne`, `mediocre` : **l'enregistrement du diagnostic était refusé** (400 « valeur non autorisée ») et les diagnostics déjà saisis en « moyenne » n'apparaissaient plus.
Correction : les **valeurs enregistrées** restent `bonne`, `moyenne`, `mediocre` et s'ajoute `non_applicable` ; les **libellés** vus par le consultant sont « Bonne », « Passable » (valeur `moyenne`, donc les anciens diagnostics s'affichent), « Médiocre », « Non applicable ». Sur téléphone, les quatre choix sont sur deux lignes de deux. À envoyer, dans cet ordre : script SQL 4 (rejouable), `image-commerciale.routes.js` (6678 octets), redémarrage, puis le site reconstruit.
**Règle à retenir : toute nouvelle réponse ajoutée dans un outil doit exister aux trois endroits** : le site (`situationChoices`), le serveur (liste de validation, ex. `SITUATION`) et la base (colonne `ENUM`, via un script SQL).

### G. Nouvel outil : 1E_a « Diagnostic BPF » (développé le 05/11/2026, pas encore déployé)
Digitalisation du classeur `BPF-Diagnostic_fr-FR.xlsx` (bonnes pratiques de fabrication). **Un seul passage** par consultant et par entreprise. Le menu « 1E_a Diagnostic BPF » passe de grisé à actif.
- **Inspection** : 92 exigences en 9 catégories (666 points au total), une catégorie dépliée à la fois. Chaque exigence : « Conforme » (tous les points), « Partiel » (note estimative, boutons − / + ou saisie), « Non conforme » (0), « Non applicable » ; toucher à nouveau une réponse l'efface. « Comment vérifier » affiche la consigne du classeur (colonne « Commentaires », en réalité des consignes) ; « Remarque » ouvre un champ libre. Résultat global en direct (détail par catégorie replié).
- **Rapport** : résultat global puis une fiche par catégorie (points obtenus, maximum, écart, taux, appréciation BON ≥ 80 % / ACCEPTABLE ≥ 60 % / À AMÉLIORER, mêmes bornes que le classeur, sans arrondi), échelle de référence, conclusions et recommandations par catégorie, remarques générales, actions prioritaires (liste ajoutable, 10 au plus). Ouvrir le rapport enregistre d'abord la fiche si elle a changé.
- **Règles de calcul** (décidées avec le propriétaire du projet) : « Non applicable » **retire l'exigence du maximum** (le classeur la gardait : elle pénalisait l'entreprise) ; une exigence **pas encore évaluée** ne compte ni dans les points ni dans le maximum et le résultat reste « provisoire » (le classeur la comptait à 0 : une grille vide donnait « À AMÉLIORER »). Sans « non applicable » et une fois tout évalué, les résultats sont **identiques à ceux du classeur** (vérifié sur son jeu d'exemple : 315 / 666 = 47,3 %). La colonne « Oui/Non » du classeur n'est pas reprise (aucune formule ne la lisait et elle contredisait les points sur 16 lignes).
- **Corrections du contenu** : numéro 1.7.10 en double dans le classeur (la catégorie 7 va de 1.7.1 à 1.7.12) ; fautes « Procéder », « ne présentent-ils pas ». ⚠ **À fournir par le PNUD** : la consigne de 1.3.4 (température de la chambre froide) s'arrête dans le classeur sur « appliquez les critères suivants : » sans critères ; elle est omise en attendant. À faire relire : la formulation de 1.5.7 (semble inversée), et le titre « SECTION 1 » sans section 2 (supposé sans objet).
- Manager : lecture seule (même rendu), évaluation du livrable, ligne « Diagnostic BPF » dans les listes de livrables, aperçu vierge depuis le menu Tools (jamais enregistré). Impression / PDF : rapport d'abord, puis le détail des 92 réponses (12 pages A4 environ, seules les catégories rédigées sont imprimées).
- Le diagnostic suit l'entreprise quand on change son consultant (`entreprise_bpf` ajoutée à la liste du transfert).
- **Ordre impératif : script SQL 5 AVANT les fichiers serveur.** `manager.routes.js` et `consultant.routes.js` lisent maintenant la table `entreprise_bpf` (listes de livrables, tableau de bord de l'entreprise, résumé des outils remplis) : sans la table, ces écrans répondent 500. Le script est rejouable.
- Fichiers à envoyer (après le SQL 5), puis **un seul** redémarrage, puis le site reconstruit :
  | Fichier | En ligne (après le 01/11) | Après | Nature |
  |---|---|---|---|
  | `app/routes/bpf.routes.js` | — | 10307 | **nouveau** : `GET` / `POST /api/bpf` |
  | `app.js` | 4225 | 4325 | monte `/api/bpf` |
  | `app/routes/manager.routes.js` | 30589 | 31230 | « Diagnostic BPF » dans les 3 listes de livrables ; `entreprise_bpf` dans le transfert de consultant |
  | `app/routes/consultant.routes.js` | 15985 | 16177 | tableau de bord et résumé des outils remplis |
  | `app/routes/reviews.routes.js` | 10043 | 10051 | l'outil `t1ea` peut être évalué |
  Ces cinq fichiers s'ajoutent à ceux de F (`image-commerciale.routes.js`, 6678) et remplacent les lignes de même nom du tableau 2 ci-dessous. Lot généré le 05/11/2026 dans `deploiement-2026-11-05/` (voir en tête de ce document). Site construit en production le 05/11/2026 : `site-2026-11-05-sans-assets.zip` (1,7 Mo, 47 fichiers, recommandé : `assets/` n'a pas changé) ou `site-2026-11-05.zip` (10,6 Mo, 85 fichiers) ; contrôle après extraction : `index.html` 6922 octets, `main-KP4O4MBH.js` 457867 octets, `ngsw.json` 10590 octets. Si le code change encore avant l'envoi : régénérer le lot **et** reconstruire le site.
- **Règle à retenir** (même leçon que F) : les points maximum de chaque exigence existent à **deux endroits** : le site (`core/model/bpf-content.ts`) et le serveur (`BPF_MAX` dans `bpf.routes.js`). Aucune colonne ENUM : la base ne limite rien. Toute modification se fait aux deux endroits ; le test `test_bpf.js` (section H) compare les deux listes.
- Vérifié en local : serveur 63/63 (droits, validation, remplacement, verrou de vague, listes de livrables, évaluation, transfert, maxima identiques site / serveur), calcul des scores 24/24 (jeu d'exemple du classeur, non applicable, seuils 80 / 60 %), navigateur 87/87 (téléphone 390 et 360 px, manager en lecture seule, aperçu vierge, impression et PDF), et les tests du transfert d'entreprise et de `manager.routes.js` (27/27, 6/6, 32/32) toujours verts.

### 1. Base de données (dans cet ordre, chaque script est à usage unique)
| N° | Script | Octets | Contenu |
|---|---|---|---|
| 1 | `migrations/2026-10-vagues.sql` | 1682 | Table `vagues`, « Vague 1 » (en cours), `entreprises.id_vague` : **toutes les entreprises passent en Vague 1**. Vérifier d'abord : `SHOW COLUMNS FROM entreprises LIKE 'id_vague';` (une ligne = déjà passé). |
| 2 | `migrations/2026-10-roles-evaluation.sql` | 2111 | Rôle `evaluateur` (identifiant = le plus grand existant + 1, soit 5 ; `roles.id` n'est pas auto-incrémenté) ; `livrable_reviews.status` facultatif + colonne `instance`. **Avis des administrateurs → Bureau Pays. Avis des modérateurs → mention retirée, commentaire conservé ; un avis de modérateur sans commentaire est supprimé.** Vérifier d'abord : `SHOW COLUMNS FROM livrable_reviews LIKE 'instance';` (une ligne = déjà passé). |
| 3 | `migrations/2026-10-diagnostic-recommandations.sql` | 940 | Colonne `recommandations` (texte JSON, vide au départ) sur `matrice_diag_integral_note`. Additif et sans risque. Vérifier d'abord : `SHOW COLUMNS FROM matrice_diag_integral_note LIKE 'recommandations';` (une ligne = déjà passé ; un second passage échoue sur « Duplicate column name », sans danger). |
| 4 | `migrations/2026-11-image-commerciale-non-applicable.sql` | 716 | **Correctif du 04/11.** Ajoute `non_applicable` à la liste `situation` de `entreprise_image_com_elements`. **Rejouable sans danger**, ne modifie aucune donnée. À passer **avant** `image-commerciale.routes.js`. Vérifier ensuite : `SHOW COLUMNS FROM entreprise_image_com_elements LIKE 'situation';` doit contenir `non_applicable`. |
| 5 | `migrations/2026-11-bpf-diagnostic.sql` | 2266 | **Nouvel outil 1E_a (voir G).** Crée 4 tables (`entreprise_bpf`, `_items`, `_categories`, `_actions`) ; aucune table existante n'est touchée. **Rejouable sans danger** (`CREATE TABLE IF NOT EXISTS`). À passer **avant** les fichiers serveur de G. Vérifier ensuite : `SHOW TABLES LIKE 'entreprise_bpf%';` doit renvoyer 4 lignes. |

⚠ **Avant le script 2 : exporter la table `livrable_reviews`** (phpMyAdmin → Exporter) : la conversion des avis de modérateurs est irréversible.

### 2. Backend (21 fichiers, puis un seul redémarrage)
| Fichier | Avant | Après | Nature |
|---|---|---|---|
| `app/middleware/access.js` | 565 | 1228 | équipe de supervision (+ évaluateur) ; `isAdmin`, `reviewerInstance` |
| `app/models/index.js` | 788 | 839 | rôle `evaluateur` reconnu |
| `app/config/vagues.js` | — | 3306 | **nouveau** : filtre de vague, verrou, vague d'une nouvelle entreprise |
| `app/routes/users.routes.js` | — | 2759 | **nouveau** : `/api/users` (liste, changement de rôle ; administrateur seul) |
| `app/routes/vagues.routes.js` | — | 7532 | **nouveau** : `/api/vagues` |
| `app/routes/consultant.routes.js` | 13450 | 15985 | listes filtrées et limitées au consultant, détail réservé, verrou ; la fiche entreprise renvoie aussi le nom du consultant en charge (en-tête du rapport imprimé du diagnostic) |
| `app/routes/manager.routes.js` | 22596 | 30589 | `/api/manager/*` réservé aux admin / moderator / évaluateur, filtre de vague ; la liste des livrables renvoie région, vague, étape ; **changement du consultant en charge d'une entreprise** (transfert des livrables) ; la fiche n'efface plus les champs non envoyés (ex. secteur) |
| `app/routes/reviews.routes.js` | 6818 | 10043 | avis par instance, commentaire sans mention, mentions par instance dans la synthèse, filtre de vague |
| `app/routes/suivi.routes.js` | 13913 | 14655 | filtre de vague + verrou |
| `app/routes/quickwins.routes.js` | 7143 | 7410 | verrou |
| `app/routes/finance.routes.js` | 6888 | 7149 | verrou |
| `app/routes/minutes.routes.js` | 14097 | 14637 | verrou ; le détail d'une minute annonce « lecture seule » |
| `app/routes/cinq-s.routes.js` | 15192 | 15818 | verrou (saisie, photos) |
| `app/routes/profil.routes.js` | 10156 | 10494 | verrou |
| `app/routes/cartographie.routes.js` | 7025 | 7303 | verrou |
| `app/routes/productivite.routes.js` | 8686 | 8988 | verrou |
| `app/routes/image-commerciale.routes.js` | 6329 | 6678 | verrou ; **situation « non_applicable » acceptée** (correctif du 04/11, voir F) |
| `app/routes/gallery.routes.js` | 10093 | 10837 | verrou ; l'évaluateur consulte les photos |
| `app/routes/tools.routes.js` | 25257 | 29391 | verrou (prédiagnostic, diagnostic, canevas, activités) ; **Diagnostic général : champ des recommandations** (enregistrées avec le questionnaire, ou seules via `POST /api/tools/integral/recommandations`) |
| `app/controllers/auth.controller.js` | 3319 | 4167 | **inscription : rôle imposé sauf administrateur connecté** |
| `app.js` | 3885 | 4225 | monte `/api/vagues` et `/api/users` |

Inchangés (ne pas renvoyer) : `suivi.catalog.js` 28713, `suivi-citi.js` 23651, `fx.config.js` 384, `dbhelpers.js` 684, `upload.js` 6660, `auth.routes.js` 1199.
Ne jamais écraser `dbcon.js` ni `db.config.js`.

### 3. Frontend
Construit le 01/11/2026 (`ng build`, **production**, API `https://nodeapi.sdp-gyb-cmr.com`, 97 fichiers). Deux archives, à extraire à la **racine du site** :
- `site-2026-11-01-sans-assets.zip` (1,7 Mo, 47 fichiers) : **recommandée**. Le dossier `assets/` (28 Mo d'images) n'a pas changé depuis le 28/10 et est déjà en ligne.
- `site-2026-11-01.zip` (28,5 Mo, 97 fichiers) : complète, seulement si `assets/` en ligne est incomplet.
Contrôle après extraction : `index.html` 6922 octets, `main-BYQ7RW4X.js` 457867 octets, `ngsw.json` 12066 octets. Ne pas supprimer le `.htaccess` du site s'il existe ; supprimer l'archive après extraction.
Les utilisateurs acceptent la bannière de mise à jour (service worker).
Ordre : base de données, serveur, puis site. Le nouveau site appelle `/api/vagues` et `/api/users` : s'il partait avant le serveur, la bande de vague
n'apparaîtrait pas et les pages d'administration seraient en erreur. L'ancien site, lui, reste utilisable avec le nouveau serveur, sauf
l'évaluation : un modérateur y verrait encore des boutons de mention (le serveur les refuse avec un message clair).
Vérifié en local dans Chrome contre le vrai serveur (téléphone 390 px et bureau) : vagues 39/39, tableau des livrables 33/33, évaluation par instance 24/24,
utilisateurs 24/24, consultant en charge et accès aux rôles 27/27 ; serveur : vagues 80/80, rôles et évaluation 47/47, transfert d'entreprise 27/27, recommandations du diagnostic 27/27 ; navigateur : diagnostic général 76/76. Listes CITI du suivi et évaluation 16/16 (téléphone tactile et souris). Impression du diagnostic 26/26.

### 3 bis. Avant d'envoyer : sauvegarde et retour arrière
- **Sauvegarde du serveur** : dans le gestionnaire de fichiers, compresser `app/` et `app.js`, **télécharger l'archive puis la supprimer du serveur** (elle contient des secrets).
- **Sauvegarde de la base** : exporter au minimum `livrable_reviews` (obligatoire avant le script 2), `entreprises` et `matrice_diag_integral_note`.
- **Retour arrière du code** : remettre l'ancienne version des fichiers et redémarrer. Les scripts SQL sont **compatibles avec l'ancien code** : colonnes ajoutées (ignorées par l'ancien code), `id_vague` vaut 1 par défaut, `status` accepte NULL. Seule exception : les avis de modérateurs convertis en commentaires ne reviennent qu'avec l'export de `livrable_reviews`.
- Répétition générale faite en local : les 3 scripts, dans l'ordre, sur une base au schéma d'avant migration (avis d'administrateur, de modérateur avec et sans commentaire) : 16/16.

### 3 ter. ⚠ Fichiers du serveur téléchargeables depuis Internet (constaté le 01/11/2026)
Le dossier `nodeapi` est à la fois le dossier de l'application et le dossier public du site : Apache envoie directement tout fichier qui existe. Constaté (requêtes d'en-tête seulement, aucun contenu lu) : `app/config/dbcon.js`, `db.config.js`, **`auth.config.js` (clé de signature des jetons)**, `server.js`, `package.json`, `BackUndp.zip`, `private.zip` et `uploads.zip` répondaient « 200 ». Avec la clé des jetons, n'importe qui peut fabriquer un jeton d'administrateur.
À faire, dans cet ordre :
1. **Supprimer** les archives (`BackUndp.zip`, `private.zip`, `uploads.zip`) et `diag.js` de `nodeapi`. Ne jamais y laisser d'archive, même un instant.
2. **Bloquer l'accès direct** : ajouter dans `nodeapi/.htaccess`, **en dehors** du bloc « CLOUDLINUX PASSENGER CONFIGURATION » (cPanel le réécrit) :
```
RedirectMatch 404 ^/(app|node_modules|migrations|private)(/|$)
RedirectMatch 404 ^/(server|app|diag)\.js$
RedirectMatch 404 ^/package(-lock)?\.json$
RedirectMatch 404 (?i)\.(zip|sql|md|sh|log)$
```
   (`/uploads` reste public : les logos et photos de profil sont servis par l'application.) Si le site répond « 500 » après l'ajout, retirer ces lignes et me les montrer.
3. **Changer la clé des jetons** (`app/config/auth.config.js` en ligne, valeur `secret`) : par exemple `head -c 48 /dev/urandom | base64 | tr -d '/+=\n'`. Tous les utilisateurs devront se reconnecter. À faire juste avant le redémarrage du déploiement.
4. **Changer le mot de passe de la base** (cPanel → MySQL → utilisateur de la base), puis le reporter dans `dbcon.js` et `db.config.js` en ligne, juste avant le redémarrage.
5. **Chercher des téléchargements passés** dans les journaux d'accès : `zgrep -lE "GET /(BackUndp.zip|private.zip|uploads.zip|app/config/)" ~/logs/* 2>/dev/null`. Impossible de savoir d'ici si quelqu'un a téléchargé ces fichiers.
6. Contrôle : la commande de vérification ne doit plus afficher aucune ligne `TELECHARGEABLE`.

### 4. Failles corrigées au passage (à connaître)
- **Inscription publique** : n'importe qui pouvait créer un compte **admin** (voir B). Corrigé.
- `/api/manager/*` (livrables de toutes les entreprises, suppression d'une entreprise…) n'exigeait qu'un jeton : un consultant pouvait l'appeler directement. Réservé à l'équipe de supervision.
- `GET /api/consultant/companies` renvoyait **toutes** les entreprises à tout utilisateur connecté ; `companiesUser` acceptait n'importe quel identifiant ; `GET /api/consultant/company/:id` lisait n'importe quelle entreprise. Un consultant ne voit plus que les siennes.
- **Fichiers du serveur en accès libre** (découvert le 01/11/2026, existait avant ce lot) : voir 3 ter.
- **Reste ouvert** : les lectures de `/api/tools/*` (prédiagnostic, diagnostic 1D, canevas, activités) font confiance à `idUser` dans l'adresse.

### 5. Tests après mise en ligne
1. **Rôles** : administrateur → « Utilisateurs et rôles » ; créer un compte de test, lui donner le rôle Évaluateur puis Modérateur ; vérifier qu'un visiteur non connecté qui s'inscrit n'obtient qu'un compte consultant.
2. **Évaluation** : sur un livrable de test, un modérateur commente (pas de bouton de mention) ; l'administrateur pose « Validé » (au nom du Bureau Pays) ; l'évaluateur pose « À améliorer » (au nom du RBLAC) ; un consultant voit les deux mentions et leur instance ; le tableau des livrables affiche les deux colonnes.
3. **Vagues** : créer « Vague 2 », répartir des entreprises, clôturer puis rouvrir une vague de test ; un consultant voit uniquement ses entreprises.
4. **Consultant en charge** : sur une entreprise de test, « Modifier » → choisir un autre consultant → enregistrer ; le nouveau consultant la voit avec ses livrables, l'ancien non ; la remettre au premier consultant.
5. **Diagnostic général** : sur une entreprise de test, parcourir les 64 éléments : « Enregistrer l'outil » n'apparaît qu'à la dernière étape (résultats + recommandations) ; « Voir les résultats » enregistre les réponses puis affiche résultats **et** champs ; enregistrer **sans** rien remplir ; dans le Résumé, « Voir les recommandations » → « Remplir cette partie » → saisir et enregistrer ; rouvrir l'outil : les saisies sont là. Le raccourci « Conclusions et recommandations » de l'onglet matrice ouvre directement la dernière étape. **Attention : une entreprise en vague clôturée (ex. « Vague 1 ») est en lecture seule pour son consultant : tester sur une entreprise d'une vague « en cours ».** Un manager voit tout en lecture seule.
6. Supprimer les avis et comptes de test.

### 6. À décider
- **Taux de change USD** (`app/config/fx.config.js`, `xafPerUsd`, 580 provisoire) : fixer le taux moyen officiel 2025.
- **Répartition des entreprises existantes** entre les vagues (elles sont toutes en « Vague 1 » après la migration).
- **Comptes existants** : attribuer le rôle Évaluateur aux personnes du RBLAC depuis « Utilisateurs et rôles ».

## Historique des déploiements
| Date | Contenu |
|---|---|
| 19/10/2026 | Logos et photos de profil dans `uploads/`, galerie protégée (`private/`), `sharp`/`multer`, livrables par entreprise, règle d'écriture des outils |
| 21-22/10/2026 | Lot 1L, 1G, 1B, 1J, 1K, 1D (nouvelle matrice), évaluation des livrables, tableau de bord de l'entreprise |
| 23/10/2026 | 5S, envoi d'images en JSON (la couche d'entrée de LWS refuse le multipart), 4 étapes, fenêtre de mise à jour |
| 01/11/2026 | Vagues, rôles (Évaluateur) et évaluation Bureau Pays / RBLAC, changement du consultant en charge, Diagnostic général (recommandations, impression PDF), listes CITI complètes, tableau des livrables. 3 scripts SQL. Constat le même jour : fichiers du serveur téléchargeables depuis Internet (voir 3 ter). Correctif du 02/11 : `manager.routes.js` 30589 octets (transfert d'entreprise, erreur 500 si une table historique manque) |
| 28/10/2026 | Analyse financière (1M), compte rendu de réunion, Registre des Quick Wins, Suivi et évaluation (initial / final + tableau de bord du portefeuille), outils transversaux, aperçu des outils pour les managers, nouvel en-tête et navigation. Incident : `suivi.routes.js` oublié → API arrêtée jusqu'à son envoi |
