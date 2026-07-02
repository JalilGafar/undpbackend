# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rôle de l'application

**BackUndp** est l'API REST du programme **SDP-GYB-CMR** (UNDP) de consultance d'entreprises PME/PMI. Elle expose les données consommées par le frontend Angular (`undptools`, port 4200). Rôles applicatifs (`db.ROLES`, `app/models/index.js`) : **admin**, **moderator**, **consultant** (saisit les diagnostics), **entreprise**. Les middlewares `isAdmin`/`isModerator` (`app/middleware/authJwt.js`) ne testent que les rôles `"admin"`/`"moderator"`.

- **Dev** : `http://localhost:8080`
- **Prod** : `https://nodeapi.sdp-gyb-cmr.com`

---

## Commandes

```bash
node server.js        # Démarre le serveur sur le port 8080 (ou process.env.PORT)
npm install           # Installe les dépendances
```

Pas de hot-reload — relancer manuellement après chaque modification. Pas de script `start` défini dans `package.json`.

---

## Architecture des fichiers

```
server.js                    → Crée le serveur HTTP (port 8080), gère EACCES/EADDRINUSE
app.js                       → Express : CORS, cookie-session, montage routes, db.sequelize.sync()
app/config/
  auth.config.js             → Secret JWT (hardcodé — voir section Sécurité)
  db.config.js               → Config Sequelize MySQL (pool max 5, acquire 30s, idle 10s)
  dbcon.js                   → Connexion MySQL brute persistante (multipleStatements: true)
app/models/
  user.model.js              → Sequelize User (username, email, password)
  role.model.js              → Sequelize Role (id, name)
  index.js                   → Init Sequelize, Many-to-Many user ↔ role via user_roles, ROLES constant
app/middleware/
  authJwt.js                 → verifyToken, isAdmin, isModerator, isModeratorOrAdmin
  verifySignUp.js            → checkDuplicateUsernameOrEmail, checkRolesExisted
  index.js                   → Export groupé { authJwt, verifySignUp }
app/controllers/
  auth.controller.js         → signup, signin, signout
  user.controller.js         → handlers des routes de test par rôle
app/routes/
  auth.routes.js             → /api/auth/*       — style : function(app)
  user.routes.js             → /api/test/*       — style : function(app)
  consultant.routes.js       → /api/consultant/* — express.Router()
  manager.routes.js          → /api/manager/*    — express.Router()
  tools.routes.js            → /api/tools/*      — express.Router()
```

---

## Deux couches d'accès à la base de données — NE PAS CONFONDRE

| Couche | Fichier | Tables concernées |
|---|---|---|
| **Sequelize ORM** | `app/models/` | `users`, `roles`, `user_roles` uniquement |
| **MySQL brut** | `app/config/dbcon.js` | Toutes les tables métier |

Les requêtes MySQL brutes utilisent `sql-template-strings` (tagged template literals `` SQL`...` ``).

> La route `GET /api/manager/user` requête directement `users`/`roles`/`user_roles` via `dbcon` (MySQL brut), même si ces tables sont gérées par Sequelize par ailleurs. C'est intentionnel pour le JOIN multi-table.

---

## CORS (`app.js`)

```javascript
const allowedOrigins = [
  'http://localhost:4200',
  'https://sdp-gyb-cmr.com',
  'https://www.sdp-gyb-cmr.com'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));
```

Pour ajouter une nouvelle origine, modifier le tableau `allowedOrigins` dans `app.js`.

---

## Session & Cookie (`app.js`)

```javascript
cookieSession({
  name: 'bezkoder-session',
  keys: ["COOKIE_SECRET"],             // ⚠️ chaîne littérale, PAS process.env.COOKIE_SECRET
  httpOnly: true,
  sameSite: 'none',
  secure: true,
  domain: '.sdp-gyb-cmr.com',          // partage le cookie entre sous-domaines
  maxAge: 24 * 60 * 60 * 1000          // 24h
})
```

> **Bug connu :** `keys: ["COOKIE_SECRET"]` utilise la chaîne littérale `"COOKIE_SECRET"` comme clé de signature, pas la variable d'environnement `process.env.COOKIE_SECRET`. Le cookie de session est donc signé avec un secret prévisible/hardcodé en pratique. À corriger en `keys: [process.env.COOKIE_SECRET]`.

---

## Endpoints de l'API

### `/api/auth` — Authentification (via Sequelize)

| Méthode | Route | Middleware | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | checkDuplicateUsernameOrEmail, checkRolesExisted | Inscription, bcrypt 8 rounds, retourne message succès |
| POST | `/api/auth/signin` | — | Retourne `{id, username, email, roles[], accessToken}` |
| POST | `/api/auth/signout` | — | Efface la session cookie |

**Token JWT HS256, durée 24h (86400s), retourné dans `accessToken`.** Rôles au format `["ROLE_USER"]`, `["ROLE_ADMIN"]`, `["ROLE_MODERATOR"]`.

### `/api/test` — Vérification des accès par rôle

| Méthode | Route | Middleware | Réponse |
|---|---|---|---|
| GET | `/api/test/all` | — | "Public Content." |
| GET | `/api/test/user` | verifyToken | "User Content." |
| GET | `/api/test/mod` | verifyToken + isModerator | "Moderator Content." |
| GET | `/api/test/admin` | verifyToken + isAdmin | "Admin Content." |

### `/api/consultant` — Gestion des entreprises consultant

> **`verifyToken` appliqué** via `app.use('/api/consultant', [verifyToken], ConsultantRoute)` dans `app.js`.

| Méthode | Route | Query/Param | Description |
|---|---|---|---|
| GET | `/api/consultant/companies` | — | `SELECT * FROM entreprises` |
| GET | `/api/consultant/companiesUser` | `?idUser=` | Filtre par `id_consl` |
| GET | `/api/consultant/company/:id` | `:id` URL | Détail entreprise par ID (alias `idUser` renvoyé pour `id_consl`) |
| PUT | `/api/consultant/company/:id` | `:id` URL + body | Met à jour l'entreprise **uniquement si `id_consl = req.userId`** (403 sinon) — contrairement à `PUT /api/manager/company/:id` qui n'a pas cette vérification de propriété |
| POST | `/api/consultant/newCompany` | body | INSERT dans `entreprises` (name, region, ville, date_creation, nbr_employer, nbr_femme, produits, services, description, quartier, lieu, gerant, descrt_gerant, **idUser** → stocké comme `id_consl`, x, y) |

> **Attention nommage :** Le frontend envoie `idUser` dans le body ; la colonne SQL s'appelle `id_consl`.

### `/api/manager` — Vue superviseur

> **`verifyToken` appliqué** via `app.use('/api/manager', [verifyToken], ManagerRoute)` dans `app.js`.

| Méthode | Route | Query/Param | Description |
|---|---|---|---|
| GET | `/api/manager/user` | — | JOIN `roles` + `user_roles` + `users` → retourne (id, name, username, email, tel) |
| GET | `/api/manager/livrables` | `?idUser=` | UNION diagnostics intégraux + pré-diagnostics d'un consultant, jointés aux entreprises → (livrable, tableur, tool_code, id_livrable, comp_id, company, date) |
| GET | `/api/manager/all-livrables` | — | UNION diagnostics intégraux + pré-diagnostics de TOUS les consultants (pas de filtre idUser), jointés aux entreprises et à users (nom du consultant) → (livrable, tableur, tool_code, id_livrable, comp_id, company, cons_id, consultant, date, updated_at) |
| POST | `/api/manager/newCompany` | body | Identique à `/api/consultant/newCompany` |
| GET | `/api/manager/company/:id` | `:id` URL | Détail entreprise par ID |
| PUT | `/api/manager/company/:id` | `:id` URL + body | Met à jour les champs entreprise |
| DELETE | `/api/manager/company/:id` | `:id` URL | Supprime l'entreprise |

### `/api/tools` — Outils métier

> **`verifyToken` appliqué** via `app.use('/api/tools', [verifyToken], ToolsRoute)` dans `app.js`.

| Méthode | Route | Query/Param | Description |
|---|---|---|---|
| POST | `/api/tools/attribut` | body | **Upsert** pré-diagnostic (19 notes + 19 commentaires + 15 champs gen_*) dans `mat_predia_crev_note` — `INSERT ... ON DUPLICATE KEY UPDATE` sur (cons_id, comp_id) |
| GET | `/api/tools/attribut` | `?idUser=&idComp=` | Lecture pré-diagnostic |
| POST | `/api/tools/integral` | body | **Upsert** diagnostic intégral (62 notes + 62 commentaires + SWOT 4×3) dans `matrice_diag_integral_note` — `INSERT ... ON DUPLICATE KEY UPDATE` sur (cons_id, comp_id) |
| GET | `/api/tools/integral` | `?idUser=&idComp=` | Lecture diagnostic intégral |
| GET | `/api/tools/matPrediaLabel` | — | `SELECT * FROM matrice_prediagnostic` (labels lecture seule, `children` est un JSON sérialisé) |
| GET | `/api/tools/matIntegLabel` | — | `SELECT * FROM matrice_diag_integral` (labels lecture seule) |
| POST | `/api/tools/activities` | body | **INSERT pur** (pas d'upsert) dans `activity_tab` |
| GET | `/api/tools/activities` | `?idUser=&idComp=` | Activités filtrées par (cons_id, comp_id) |
| ~~PUT~~ | ~~`/api/tools/activities/:id`~~ | — | **❌ NON IMPLÉMENTÉ** — appelé par le frontend, absent du routeur |
| POST | `/api/tools/bmc` | body | **INSERT pur** (pas d'upsert) dans `bmc_data` |
| GET | `/api/tools/bmc` | `?idUser=&idComp=` | BMC filtré par (cons_id, comp_id) |

**Règles upsert :**
- `/attribut` et `/integral` → `INSERT ... ON DUPLICATE KEY UPDATE` sur clé composite (cons_id, comp_id). Un seul enregistrement par (consultant, entreprise).
- `/activities` et `/bmc` → `INSERT` simple. Plusieurs enregistrements possibles par (cons_id, comp_id).

**Nommage colonne — attention :** Dans `matrice_diag_integral_note`, les colonnes de commentaires s'appellent `comt_N` (underscore simple). Le modèle TypeScript frontend utilise `comt__N` (double underscore) mais envoie `comt_N` dans le corps HTTP — vérifier la cohérence lors de tout ajout de champ.

---

## Base de données : `undptools` (MySQL localhost)

### Configuration (`app/config/db.config.js`)

```
HOST: localhost
USER: root
DB: undptools
DIALECT: mysql
POOL: max 5, min 0, acquire 30000ms, idle 10000ms
```

### Tables Sequelize (gérées par ORM)

| Table | Colonnes |
|---|---|
| `users` | id, username, email, password, (tel via dbcon uniquement) |
| `roles` | id, name — voir `db.ROLES` dans `app/models/index.js` |
| `user_roles` | userId, roleId (Many-to-Many) |

`db.ROLES` (utilisé par `verifySignUp.checkRolesExisted` pour valider `req.body.roles` au signup) = `["admin", "moderator", "consultant", "entreprise"]`. **Ne contient plus `"user"`.**

> **⚠️ Incohérence connue :** la fonction `initial()` dans `app.js` (appelée seulement si `db.sequelize.sync({force: true})` est décommenté) crée encore les 3 anciens rôles `id:1 "user"`, `id:2 "moderator"`, `id:3 "admin"` — elle ne correspond plus à `db.ROLES`. Si `signup` est appelé sans `roles` dans le body, `auth.controller.js` assigne par défaut `setRoles([3])` en supposant que l'id 3 = "consultant" (nouveau schéma), alors que `initial()` assignerait l'id 3 à "admin". Avant de réactiver `force: true` ou de traiter des signups sans rôle explicite, aligner `initial()` sur `db.ROLES` et vérifier les ID réels en base.

**Initialisation des rôles sur base vide :** décommenter `db.sequelize.sync({force: true})` dans `app.js` pour déclencher `initial()`, puis remettre `sync()` sans `force` — mais voir l'incohérence ci-dessus avant de le faire.

### Tables métier (MySQL brut via `dbcon.js`)

| Table | Clé / Contrainte | Description |
|---|---|---|
| `entreprises` | id, `id_consl` | Profil entreprise : name, region, departement, ville, commune, quartier, lieu, date_creation, nbr_employer, nbr_femme, produits, services, description, gerant, descrt_gerant, x (GPS lng), y (GPS lat) |
| `mat_predia_crev_note` | UNIQUE (cons_id, comp_id) | 19 notes (`note_1`→`note_19`) + 19 commentaires (`comment_1`→`comment_19`) + 15 champs génériques entreprise (`gen_nom_prenom`, `gen_sexe`, `gen_age`, `gen_telephone`, `gen_adresse`, `gen_ville`, `gen_nom_entreprise`, `gen_type_entreprise`, `gen_email`, `gen_activite_principale`, `gen_activite_autre`, `gen_ventes_mensuelles`, `gen_role_entreprise`, `gen_situation_entreprise`, `gen_formation_interesse`) |
| `matrice_diag_integral_note` | UNIQUE (cons_id, comp_id) | 62 notes (`note_1`→`note_62`) + 62 commentaires (`comt_1`→`comt_62`) + SWOT : `difficult_1-3`, `force_1-3`, `faiblesse_1-3`, `besoin_1-3` |
| `matrice_prediagnostic` | — | Labels/descriptions pré-diagnostic (lecture seule). Colonne `children` = JSON sérialisé en string. |
| `matrice_diag_integral` | — | Labels/descriptions diagnostic intégral (lecture seule) |
| `activity_tab` | cons_id, comp_id | Gantt : name, details, start (`YYYY-MM-DD`), end (`YYYY-MM-DD`), close, progress, status, dependencies, responsable, comments |
| `bmc_data` | cons_id, comp_id | BMC 12 sections × 3 champs (voir ci-dessous) |

> **⚠️ Colonne `updated_at` ajoutée manuellement :** `matrice_diag_integral_note` et `mat_predia_crev_note` ont reçu une colonne `updated_at` (`TIMESTAMP ... ON UPDATE CURRENT_TIMESTAMP`) ajoutée manuellement (hors migration Sequelize) pour la feature `GET /api/manager/all-livrables`. Cette colonne doit exister dans tout environnement (y compris production) avant d'utiliser cet endpoint, sinon la requête échoue en 500.

### Colonnes BMC (`bmc_data`) — 12 sections × 3 champs

`customerSegments1-3`, `valuePropositions1-3`, `channels1-3`, `problemeIdentifie1-3`, `but1-3`, `mesureImpact1-3`, `customerRelationships1-3`, `revenueStreams1-3`, `keyResources1-3`, `keyActivities1-3`, `keyPartnerships1-3`, `costStructure1-3` + cons_id, comp_id, date, createdAt, updatedAt

---

## Middleware

### `authJwt.js`

- **`verifyToken`** : extrait le JWT depuis `x-access-token` ou `Authorization: Bearer <token>`, vérifie HS256, attache `req.userId`. Retourne 403 si absent, 401 si invalide.
- **`isAdmin`** : charge les rôles via Sequelize, bloque avec 403 si pas admin.
- **`isModerator`** : idem pour le rôle moderator.
- **`isModeratorOrAdmin`** : accepte l'un ou l'autre.

> **Important :** Les routes `/api/consultant/*`, `/api/manager/*` et `/api/tools/*` **appliquent `verifyToken`** au niveau du montage dans `app.js` (`app.use('/api/consultant', [verifyToken], ...)`). Le token JWT doit donc être présent dans chaque requête via `Authorization: Bearer <token>` ou `x-access-token`.

### `verifySignUp.js`

- **`checkDuplicateUsernameOrEmail`** : vérifie l'unicité via Sequelize, retourne 400 si doublon.
- **`checkRolesExisted`** : valide que les rôles fournis sont dans `["user", "admin", "moderator"]`, retourne 400 si invalide.

---

## Flux d'authentification

```
1. POST /api/auth/signup
   → verifySignUp middleware (unicité, rôles valides contre db.ROLES)
   → bcrypt.hashSync(password, 8)
   → User.create() via Sequelize
   → si req.body.roles non vide : Role.findAll() puis user.setRoles(roles)
   → sinon : user.setRoles([3])  // rôle par défaut supposé "consultant"
   ← 200 "User registered successfully!"

2. POST /api/auth/signin
   → User.findOne({ where: { username } })
   → bcryptjs.compareSync(password, user.password)
   → jwt.sign({ id: user.id }, secret, { expiresIn: 86400 })
   → getRoles() → formatter en ["ROLE_*"]
   ← 200 { id, username, email, roles[], accessToken }

3. Token usage (routes protégées uniquement : /api/test/*)
   → Header: x-access-token: <token>
   → OU Header: Authorization: Bearer <token>
   → verifyToken middleware → req.userId
```

---

## Montage des routes dans `app.js` — deux styles coexistent

| Style | Routes | Syntaxe dans app.js |
|---|---|---|
| Module function | `auth.routes`, `user.routes` | `require('./app/routes/auth.routes')(app)` |
| express.Router | `consultant`, `manager`, `tools` | `app.use('/api/consultant', [verifyToken], consultantRouter)` |

Ne pas mélanger les styles dans un même fichier de route.

---

## Sécurité — points de vigilance

| Problème | Localisation | Recommandation |
|---|---|---|
| Mot de passe DB hardcodé | `app/config/db.config.js` | Migrer vers `process.env.DB_PASSWORD` |
| Secret JWT hardcodé | `app/config/auth.config.js` | Migrer vers `process.env.JWT_SECRET` |
| `verifyToken` appliqué sur routes métier | `app.js` montage | `verifyToken` est bien en place sur consultant/manager/tools — toute requête sans token valide retourne 403/401 |
| `multipleStatements: true` | `app/config/dbcon.js` | Risque SQL injection si entrées non filtrées — utiliser `sql-template-strings` |
| Pas de validation des entrées | Routes consultant/manager/tools | Les handlers font confiance aux données reçues |
| Cookie de session signé avec une chaîne littérale | `app.js` — `cookieSession({ keys: ["COOKIE_SECRET"] })` | Remplacer par `keys: [process.env.COOKIE_SECRET]` |
| `db.ROLES` désynchronisé de `initial()` | `app/models/index.js` vs `app.js` | Voir section "Incohérence connue" plus haut — aligner avant réactivation de `sync({force:true})` |

---

## Gap à combler : `PUT /api/tools/activities/:id`

Le frontend (`ConsultantService.updateActivities(id, payload)`) appelle cette route pour mettre à jour une activité Gantt existante. Elle **n'existe pas** dans `tools.routes.js`. À implémenter :

```javascript
// Dans tools.routes.js
router.put('/activities/:id', (req, res) => {
  const { id } = req.params;
  const { start, end, progress, responsable, status, details, comments, close } = req.body;
  dbcon.query(
    SQL`UPDATE activity_tab SET start=${start}, end=${end}, progress=${progress},
        responsable=${responsable}, status=${status}, details=${details},
        comments=${comments}, close=${close} WHERE id=${id}`,
    (err, results) => {
      if (err) return res.status(500).send(err);
      res.status(200).json(results);
    }
  );
});
```

---

## Dépendances

| Package | Version | Usage |
|---|---|---|
| `express` | ^4.18.2 | Framework HTTP |
| `sequelize` | ^6.31.1 | ORM pour users/roles uniquement |
| `mysql` | ^2.18.1 | Driver MySQL legacy (dbcon.js) |
| `mysql2` | ^2.3.3 | Driver MySQL moderne (Sequelize) |
| `sql-template-strings` | ^2.2.2 | Tagged templates SQL injection-safe |
| `sql-template` | ^1.3.2 | Utilitaire SQL template |
| `jsonwebtoken` | ^9.0.0 | JWT HS256 sign/verify |
| `bcryptjs` | ^2.4.3 | Hash passwords (8 rounds) |
| `cors` | ^2.8.5 | CORS middleware |
| `express-session` | ^1.18.2 | Session middleware |
| `cookie-session` | ^2.0.0 | Session cookie (utilisé en prod) |
