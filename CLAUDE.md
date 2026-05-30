# CLAUDE.md — BackUndp

## Rôle de l'application

**BackUndp** est l'API REST du programme UNDP de consultance d'entreprises. Elle expose les données consommées par le frontend Angular (`undptools`, port 4200). Trois profils : **consultant** (saisit les diagnostics), **manager/admin** (supervise les livrables), **user** (rôle de base).

---

## Commandes

```bash
node server.js        # Démarre le serveur sur le port 8080 (ou process.env.PORT)
npm install           # Installe les dépendances
```

Pas de hot-reload — relancer manuellement après chaque modification.

---

## Architecture des fichiers

```
server.js                    → Crée le serveur HTTP
app.js                       → Express : CORS (origin: localhost:4200), cookie-session,
                               montage des routes, db.sequelize.sync()
app/config/
  auth.config.js             → Secret JWT
  db.config.js               → Config Sequelize (pool max 5, acquire 30s, idle 10s)
  dbcon.js                   → Connexion MySQL brute persistante (toutes les routes métier)
app/models/
  user.model.js              → Sequelize User (id, username, email, password, tel)
  role.model.js              → Sequelize Role (id, name)
  index.js                   → Many-to-Many user ↔ role via table user_roles
app/middleware/
  authJwt.js                 → verifyToken, isAdmin, isModerator, isModeratorOrAdmin
  verifySignUp.js            → checkDuplicateUsernameOrEmail, checkRolesExisted
  index.js                   → Export groupé
app/controllers/
  auth.controller.js         → signup, signin, signout
  user.controller.js         → handlers des routes de test par rôle
app/routes/
  auth.routes.js             → /api/auth/*      — style: reçoit app directement
  user.routes.js             → /api/test/*      — style: reçoit app directement
  consultant.routes.js       → /api/consultant/* — express.Router()
  manager.routes.js          → /api/manager/*   — express.Router()
  tools.routes.js            → /api/tools/*     — express.Router()
```

---

## Deux couches d'accès à la base de données — NE PAS CONFONDRE

| Couche | Fichier | Tables concernées |
|---|---|---|
| **Sequelize ORM** | `app/models/` | `users`, `roles`, `user_roles` uniquement |
| **MySQL brut** | `app/config/dbcon.js` | Toutes les tables métier |

Les requêtes MySQL brutes utilisent `sql-template-strings` (tagged template literals SQL\`...\`).

> La route `GET /api/manager/user` requête directement `users`/`roles`/`user_roles` via `dbcon` (MySQL brut), même si ces tables sont gérées par Sequelize par ailleurs.

---

## Endpoints de l'API

### `/api/auth` — Authentification (via Sequelize)

| Méthode | Route | Middleware | Description |
|---|---|---|---|
| POST | `/signup` | checkDuplicateUsernameOrEmail, checkRolesExisted | Inscription, bcrypt 8 rounds |
| POST | `/signin` | — | Retourne `{id, username, email, roles[], accessToken}` |
| POST | `/signout` | — | Efface la session cookie |

Token JWT HS256, durée 24h, retourné dans `accessToken`. Rôles au format `["ROLE_USER"]`.

### `/api/test` — Vérification des accès par rôle

| Méthode | Route | Accès requis |
|---|---|---|
| GET | `/all` | Public |
| GET | `/user` | `verifyToken` |
| GET | `/mod` | `verifyToken` + `isModerator` |
| GET | `/admin` | `verifyToken` + `isAdmin` |

### `/api/consultant` — Gestion des entreprises

| Méthode | Route | Description |
|---|---|---|
| GET | `/companies` | Toutes les entreprises (`SELECT * FROM entreprises`) |
| GET | `/companiesUser?idUser=` | Entreprises filtrées par `id_consl` |
| POST | `/newCompany` | Insère dans `entreprises` (name, region, ville, date_creation, nbr_employer, nbr_femme, produits, services, description, quartier, lieu, gerant, descrt_gerant, id_consl, x, y) |

### `/api/manager` — Vue superviseur

| Méthode | Route | Description |
|---|---|---|
| GET | `/user` | JOIN `roles` + `user_roles` + `users` → retourne (id, name, username, email, tel) |
| GET | `/livrables?idUser=` | UNION des diagnostics intégraux et pré-diagnostics d'un consultant, jointés aux entreprises |
| POST | `/newCompany` | Identique à `/api/consultant/newCompany` |

### `/api/tools` — Outils métier

| Méthode | Route | Description |
|---|---|---|
| POST | `/attribut` | Upsert pré-diagnostic (19 notes + 19 commentaires + cons_id + comp_id) |
| GET | `/attribut?idUser=&idComp=` | Lecture pré-diagnostic par (cons_id, comp_id) |
| POST | `/integral` | Upsert diagnostic intégral (62 notes + 62 commentaires `comt_N` + SWOT 4×3 + cons_id + comp_id) |
| GET | `/integral?idUser=&idComp=` | Lecture diagnostic intégral |
| GET | `/matPrediaLabel` | `SELECT * FROM matrice_prediagnostic` (labels lecture seule) |
| GET | `/matIntegLabel` | `SELECT * FROM matrice_diag_integral` (labels lecture seule) |
| POST | `/activities` | INSERT dans `activity_tab` (pas d'upsert — insert pur) |
| GET | `/activities?idUser=&idComp=` | Activités filtrées par (cons_id, comp_id) |
| POST | `/bmc` | INSERT dans `bmc_data` (pas d'upsert) |
| GET | `/bmc?idUser=&idComp=` | BMC filtré par (cons_id, comp_id) |

**Route manquante :** Le frontend appelle `PUT /api/tools/activities/:id` pour mettre à jour une activité Gantt, mais cette route **n'est pas implémentée** dans `tools.routes.js`. C'est un gap à combler.

**Règle upsert :** `/attribut` et `/integral` utilisent `INSERT ... ON DUPLICATE KEY UPDATE` sur la clé composite `(cons_id, comp_id)`. `/activities` et `/bmc` font des INSERT simples.

**Nommage colonne — attention :** Dans `matrice_diag_integral_note`, les colonnes de commentaires s'appellent `comt_N` (underscore simple). Le service Angular utilise `comt__N` (double underscore) dans l'interface TypeScript mais envoie `comt_N` dans le corps HTTP — vérifier la cohérence lors de tout ajout de champ.

---

## Base de données : `undptools` (MySQL)

### Tables Sequelize (gérées par ORM)

| Table | Colonnes clés |
|---|---|
| `users` | id, username, email, password, tel |
| `roles` | id, name (`user`=1, `moderator`=2, `admin`=3) |
| `user_roles` | userId, roleId (Many-to-Many) |

Initialisation des rôles sur base vide : décommenter `db.sequelize.sync({force: true})` dans `app.js` pour déclencher `initial()`, puis remettre `sync()` sans `force`.

### Tables métier (MySQL brut via dbcon)

| Table | Clé composite | Description |
|---|---|---|
| `entreprises` | id, id_consl | Profil entreprise avec GPS (x, y), coordonnées, secteur |
| `mat_predia_crev_note` | (cons_id, comp_id) | 19 scores + 19 commentaires pré-diagnostic |
| `matrice_diag_integral_note` | (cons_id, comp_id) | 62 scores (`note_N`) + 62 commentaires (`comt_N`) + SWOT (difficult_1-3, force_1-3, faiblesse_1-3, besoin_1-3) |
| `matrice_prediagnostic` | — | Labels/descriptions pré-diag (lecture seule, `children` est un JSON sérialisé) |
| `matrice_diag_integral` | — | Labels/descriptions diagnostic intégral (lecture seule) |
| `activity_tab` | cons_id, comp_id | Activités : name, details, start, end, close, progress, status, dependencies, responsable, comments |
| `bmc_data` | cons_id, comp_id | BMC 12 sections × 3 champs (voir liste complète ci-dessous) |

### Colonnes BMC (`bmc_data`) — 12 sections × 3 champs

`customerSegments1-3`, `valuePropositions1-3`, `channels1-3`, `problemeIdentifie1-3`, `but1-3`, `mesureImpact1-3`, `customerRelationships1-3`, `revenueStreams1-3`, `keyResources1-3`, `keyActivities1-3`, `keyPartnerships1-3`, `costStructure1-3`

---

## Middleware

### `authJwt.js`

- `verifyToken` : extrait le JWT depuis `x-access-token` ou `Authorization: Bearer`, attache `req.userId`.
- `isAdmin` / `isModerator` / `isModeratorOrAdmin` : chargent les rôles via Sequelize, bloquent avec 403.

> **Important :** Les routes `/api/consultant`, `/api/manager` et `/api/tools` **n'appliquent pas `verifyToken`**. C'est un choix délibéré — ne pas changer sans validation explicite.

### `verifySignUp.js`

- `checkDuplicateUsernameOrEmail` : vérifie l'unicité via Sequelize.
- `checkRolesExisted` : valide que les rôles fournis sont parmi `["user", "admin", "moderator"]`.

---

## Montage des routes dans `app.js`

Deux styles coexistent — ne pas les mélanger :

| Style | Routes | Syntaxe |
|---|---|---|
| Module function | `auth.routes`, `user.routes` | `require('...')(app)` |
| express.Router | `consultant`, `manager`, `tools` | `app.use('/api/...', Router)` |

---

## CORS

Configuré pour `http://localhost:4200` uniquement. Pour la production, modifier `origin` dans `app.js` (une URL `jalilfonda.com` est en commentaire).

---

## Dépendances

| Package | Usage |
|---|---|
| `express` ^4.18 | Framework HTTP |
| `sequelize` | ORM pour users/roles |
| `mysql` + `mysql2` | Drivers MySQL |
| `sql-template-strings` | Tagged templates pour requêtes brutes |
| `jsonwebtoken` ^9 | JWT HS256 |
| `bcryptjs` ^2.4 | Hash passwords (8 rounds) |
| `cookie-session` | Session cookie |
| `cors` | CORS middleware |
