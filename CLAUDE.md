# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rôle de l'application

**BackUndp** est une API REST pour la gestion de programmes de consultance d'entreprises dans le cadre de l'UNDP (Programme des Nations Unies pour le Développement). Elle permet à des **consultants** d'accompagner des **entreprises** à travers des outils de diagnostic, de planification stratégique et de suivi d'activités. Les **managers** supervisent l'ensemble des livrables produits par les consultants.

Le frontend consommateur est une application Angular sur `http://localhost:4200`.

---

## Commands

```bash
# Démarrer le serveur
node server.js

# Installer les dépendances
npm install
```

Le serveur démarre sur le port `8080` (ou `process.env.PORT`). Il n'y a pas de script `dev` avec hot-reload — relancer manuellement après chaque modification.

---

## Architecture globale

```
server.js           → Crée le serveur HTTP, écoute sur le port 8080
app.js              → Configure Express : CORS, cookie-session, montage des routes, sync Sequelize
app/
  config/
    auth.config.js  → Secret JWT
    db.config.js    → Config Sequelize (host, user, password, DB, pool)
    dbcon.js        → Connexion MySQL directe (partagée par les routes métier)
  models/           → Sequelize : User, Role, associations Many-to-Many via user_roles
  middleware/
    authJwt.js      → verifyToken, isAdmin, isModerator, isModeratorOrAdmin
    verifySignUp.js → checkDuplicateUsernameOrEmail, checkRolesExisted
    index.js        → Export groupé des middlewares
  controllers/
    auth.controller.js  → signup, signin, signout
    user.controller.js  → handlers des routes de test par rôle
  routes/
    auth.routes.js        → /api/auth/*
    user.routes.js        → /api/test/*
    consultant.routes.js  → /api/consultant/*
    manager.routes.js     → /api/manager/*
    tools.routes.js       → /api/tools/*
```

---

## Deux couches d'accès à la base de données

Ce projet mélange deux approches, chacune avec un périmètre distinct :

1. **Sequelize ORM** (`app/models/`) — utilisé exclusivement pour la gestion des utilisateurs et rôles (`users`, `roles`, `user_roles`). La synchronisation se fait au démarrage via `db.sequelize.sync()` dans `app.js`.

2. **MySQL brut** (`app/config/dbcon.js`) — connexion MySQL persistante partagée dans tous les fichiers de routes métier via `require('./../config/dbcon')`. Utilisée pour toutes les tables métier : `entreprises`, `mat_predia_crev_note`, `matrice_diag_integral_note`, `activity_tab`, `bmc_data`. Les requêtes utilisent la lib `sql-template-strings` (tagged template literals).

Ne pas confondre les deux : les routes `auth` et `user` passent par Sequelize, toutes les autres routes (`consultant`, `manager`, `tools`) passent par `dbcon`.

---

## Endpoints de l'API

### `/api/auth` — Authentification

| Méthode | Route | Middleware | Description |
|---|---|---|---|
| POST | `/signup` | checkDuplicateUsernameOrEmail, checkRolesExisted | Inscription, hash bcrypt (8 rounds), association rôles |
| POST | `/signin` | — | Login → retourne `{id, username, email, roles[], accessToken}` |
| POST | `/signout` | — | Efface la session cookie |

Le token JWT (HS256, 24h) est retourné dans `accessToken`. Les rôles sont retournés sous la forme `["ROLE_USER"]`, `["ROLE_ADMIN"]`, etc.

### `/api/test` — Vérification des accès par rôle

| Méthode | Route | Accès requis |
|---|---|---|
| GET | `/all` | Public |
| GET | `/user` | `verifyToken` |
| GET | `/mod` | `verifyToken` + `isModerator` |
| GET | `/admin` | `verifyToken` + `isAdmin` |

### `/api/consultant` — Gestion des entreprises (côté consultant)

| Méthode | Route | Description |
|---|---|---|
| GET | `/companies` | Toutes les entreprises |
| GET | `/companiesUser?idUser=` | Entreprises du consultant connecté |
| POST | `/newCompany` | Créer une nouvelle entreprise |

### `/api/manager` — Vue manager

| Méthode | Route | Description |
|---|---|---|
| GET | `/user` | Liste des utilisateurs avec leurs rôles (JOIN `roles` + `user_roles` + `users`) |
| GET | `/livrables?idUser=` | Tous les diagnostics (prediag + intégral) d'un consultant avec infos entreprise |
| POST | `/newCompany` | Créer une nouvelle entreprise |

### `/api/tools` — Outils métier

| Méthode | Route | Description |
|---|---|---|
| POST/GET | `/attribut` | Prediagnostic : 19 scores + commentaires par couple `(cons_id, comp_id)` |
| GET | `/matPrediaLabel` | Labels de référence du prediagnostic |
| POST/GET | `/integral` | Diagnostic intégral : 62 scores + SWOT `(difficultés, forces, faiblesses, besoins)` |
| GET | `/matIntegLabel` | Labels de référence du diagnostic intégral |
| POST/GET | `/activities` | Activités : planning, dépendances, responsable, suivi progression |
| POST/GET | `/bmc` | Business Model Canvas : 9 sections × 3 champs |

Les POST de `/attribut` et `/integral` utilisent `INSERT ... ON DUPLICATE KEY UPDATE` — ils font office d'upsert sur la clé composite `(cons_id, comp_id)`.

---

## Modèles Sequelize

**User** (`users`) : `id`, `username`, `email`, `password`
**Role** (`roles`) : `id`, `name`
Relation Many-to-Many via table `user_roles` définie dans `app/models/index.js`.

---

## Middleware

### `authJwt.js`

- **`verifyToken`** : extrait le JWT depuis `x-access-token` ou `Authorization: Bearer <token>`, vérifie la signature, attache `req.userId`.
- **`isAdmin`** / **`isModerator`** / **`isModeratorOrAdmin`** : chargent les rôles de l'utilisateur via Sequelize et bloquent avec 403 si le rôle requis est absent.

> Les routes métier `/api/consultant`, `/api/manager` et `/api/tools` **n'appliquent pas `verifyToken`** — elles sont non protégées côté API.

### `verifySignUp.js`

- **`checkDuplicateUsernameOrEmail`** : requête Sequelize pour vérifier l'unicité avant création.
- **`checkRolesExisted`** : valide que les rôles fournis font partie de `["user", "admin", "moderator"]`.

---

## Base de données

- **Nom** : `undptools` — MySQL
- **Credentials** : en dur dans `app/config/db.config.js` et `app/config/dbcon.js` (à externaliser en `.env`)
- **Pool Sequelize** : max 5 connexions, acquire 30s, idle 10s

### Tables métier

| Table | Clé métier | Rôle |
|---|---|---|
| `entreprises` | `id`, `id_consl` | Profils entreprises avec coordonnées GPS (`x`, `y`) |
| `mat_predia_crev_note` | `(cons_id, comp_id)` | 19 scores + commentaires de prediagnostic |
| `matrice_diag_integral_note` | `(cons_id, comp_id)` | 62 scores + SWOT (difficultés, forces, faiblesses, besoins) |
| `matrice_prediagnostic` | — | Labels/descriptions du prediagnostic (lecture seule) |
| `matrice_diag_integral` | — | Labels/descriptions du diagnostic intégral (lecture seule) |
| `activity_tab` | `(cons_id, comp_id)` | Activités avec planning, dépendances, responsable, progress |
| `bmc_data` | `(cons_id, comp_id)` | Business Model Canvas 9 sections × 3 champs |

### Initialisation des rôles

La table `roles` doit contenir les 3 entrées `{id:1, user}`, `{id:2, moderator}`, `{id:3, admin}`. Sur une base vide, décommenter `db.sequelize.sync({force: true})` dans `app.js` pour appeler `initial()` au démarrage, puis remettre `sync()` sans `force`.

---

## CORS

Configuré uniquement pour `http://localhost:4200`. Pour la production, modifier l'`origin` dans `app.js` — une URL `jalilfonda.com` est déjà présente en commentaire.

### Enregistrement des routes dans `app.js`

Il y a deux styles de montage :
- `auth.routes` et `user.routes` : `require('...')(app)` — reçoivent `app` directement (style module function).
- `consultant`, `manager`, `tools` : `express.Router()` montés via `app.use('/api/...', Route)`.
