# Mise en production — éléments en attente

Document vivant : tout ce qui a été développé **depuis le dernier déploiement** et qui doit être mis en ligne.
Dernier déploiement connu : **19/10/2026** (galerie d'images, logos et photos de profil WebP, correctif `auth.controller.js`).

Hébergement : LWS / cPanel + Passenger (« Setup Node.js App », Node 22). Envoi manuel des fichiers par « Upload »,
puis **un seul** redémarrage. Journal d'erreurs : `~/logs/passenger.log` (`tail -n 60`).

## Règles à respecter à chaque déploiement
1. **Base de données d'abord** (scripts de `migrations/`, dans l'ordre), puis le code.
2. **Ne jamais écraser** `app/config/dbcon.js` et `app/config/db.config.js` : les identifiants de production diffèrent de ceux du poste local.
3. Envoyer **tous** les fichiers de la liste (des fichiers qui dépendent les uns des autres : un déploiement partiel plante l'application au démarrage).
4. Ne pas envoyer `node_modules`, `uploads/`, `private/` ni les `.zip`. Si `package.json` a changé : « Run NPM Install ».
5. Vérifier les tailles (octets) dans le gestionnaire de fichiers, redémarrer, puis ouvrir `https://nodeapi.sdp-gyb-cmr.com/` :
   la réponse doit être `{"message":"Welcome to bezkoder application."}`.
6. Ensuite seulement : `ng build` et envoi du frontend (`dist/`). Les utilisateurs déjà connectés rechargent la page.
7. Ne pas laisser de `diag.js` ni d'archives sur le serveur.

## À déployer maintenant

### 1. Base de données (dans cet ordre)
| Script | Contenu |
|---|---|
| `migrations/2026-10-entreprise-profil.sql` | tables `entreprise_profil` et `entreprise_profil_ventes` (outil 1L) |
| `migrations/2026-10-cartographie-clients.sql` | tables `cartographie_clients` et `cartographie_clients_lignes` (outil 1G) |
| `migrations/2026-10-diagnostic-integral-v2.sql` | ⚠ **À USAGE UNIQUE** — outil 1D : nouvelle matrice (60 questions, notes 1 à 5). **Archive** les anciens diagnostics et libellés (tables `*_archive`) puis les retire des tables actives. À exécuter **avant** le code (un 2e passage est refusé). Vérifier avant que les consultants n'ont plus de diagnostic en cours de saisie. |

### 2. Backend (fichiers à envoyer)
Les tailles sont données au moment du déploiement (voir « Tailles »).

| Fichier | Nature |
|---|---|
| `app.js` | modifié (montage de `/api/profil` et `/api/cartographie`) |
| `app/routes/profil.routes.js` | **nouveau** (1L) |
| `app/routes/cartographie.routes.js` | **nouveau** (1G) |
| `app/routes/manager.routes.js` | modifié (1L et 1G dans les listes de livrables, `/stats`) |
| `app/routes/tools.routes.js` | modifié (validation des notes du diagnostic intégral : entiers de 0 à 5) |
| `app/middleware/access.js` | **nouveau** |
| `app/config/dbhelpers.js` | **nouveau** (utilitaires de requêtes partagés par 1L et 1G) |
| `app/config/fx.config.js` | **nouveau** — ⚠ taux USD **provisoire**, à confirmer avant mise en ligne |

**Tailles à vérifier après envoi** (à recalculer au moment du déploiement si d'autres fichiers ont changé) :

| Fichier | Octets (au 20/10/2026) |
|---|---|
| `app.js` | 2936 |
| `app/routes/profil.routes.js` | 10156 |
| `app/routes/cartographie.routes.js` | 7025 |
| `app/routes/manager.routes.js` | 12784 |
| `app/middleware/access.js` | 565 |
| `app/config/dbhelpers.js` | 684 |
| `app/config/fx.config.js` | 384 |
| `migrations/2026-10-entreprise-profil.sql` | 2887 |
| `app/routes/tools.routes.js` | 25257 |
| `migrations/2026-10-cartographie-clients.sql` | 1203 |
| `migrations/2026-10-diagnostic-integral-v2.sql` | 10343 |

### 3. Frontend
Reconstruire (`ng build`) et envoyer tout `dist/`.

### 3 bis. Fonctionnalités concernées (pour les tests après mise en ligne)
- **Outil 1L « Profil du participant »** : `/consultant/tool/t1l` (formulaire consultant, lecture seule pour les managers, impression, interrupteur USD).
- **Fiche entreprise (manager)** : onglets Informations / **Profil** / Photos (`company-detail`).
- **Tableau de bord global** (`/manager/global`) : indicateurs, graphiques, filtres, tri, pagination, **export CSV**. Réservé aux admins et moderators (route `GET /api/manager/stats`).
- **Outil 1G « Cartographie des clients B2B »** : `/consultant/tool/t1g` (clients professionnels, pourcentages calculés, impression paysage, lecture seule + USD pour les managers).
- **Outil 1D (diagnostic intégral), nouvelle matrice** : 60 questions à 5 réponses (Insuffisant 1 → Excellent 5), note affichée et non modifiable, score par domaine = moyenne ÷ 5 × 100 sur les questions répondues, enregistrement partiel autorisé. Après la mise en ligne : les consultants refont leurs diagnostics (les anciens sont archivés). Les anciens frontends encore en cache voient leurs enregistrements refusés (notes hors 0–5) tant que la bannière « nouvelle version » n'est pas acceptée.
- **Menu « Tools »** : pastille verte sur les outils utilisables (prédiagnostic, 1D, 1G, 1H, 1L, 2D), ligne grisée pour les autres (frontend uniquement).
- Les profils 1L et les cartographies 1G apparaissent dans les listes de livrables (par consultant, par entreprise, global).

### 4. À décider avant la mise en ligne
- **Taux de change USD** (`app/config/fx.config.js`, `xafPerUsd`, 580 provisoire) : fixer le taux moyen officiel 2025.

## Historique des déploiements
| Date | Contenu |
|---|---|
| 19/10/2026 | Logos et photos de profil dans `uploads/`, galerie protégée (`private/`), `sharp`/`multer`, livrables par entreprise, règle d'écriture des outils |
