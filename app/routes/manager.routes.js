const express = require('express');
const { authJwt } = require("../middleware");
const router = express.Router();
const controller = require("../controllers/user.controller");
var con = require('./../config/dbcon');
var SQL = require('sql-template-strings');
const { removeCompanyFiles } = require('../middleware/upload');
const { isManager } = require('../middleware/access');
const fx = require('../config/fx.config');
const { query: dbQuery, getConnection, toId, isEmpty } = require('../config/dbhelpers');
const { vagueParams, isAdmin, vagueForNewCompany } = require('../config/vagues');

// module.exports = function (app) {
//     app.use(function (req, res, next) {
//         res.header(
//             "Access-Control-Allow-Headers",
//             "Origin, Content-Type, Accept"
//         );
//         next();
//     });
// };

router.use(function (req, res, next) {
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, Content-Type, Accept"
    );
    next();
});

// Tout /api/manager est réservé aux admin / moderator : sans ce contrôle, un consultant pouvait lire les livrables de toutes les
// entreprises (ou supprimer une entreprise) en appelant ces adresses directement.
router.use(async function (req, res, next) {
    try {
        if (await isManager(req.userId)) return next();
    } catch (err) {
        console.log(err); return res.sendStatus(500);
    }
    res.status(403).json({ message: "Accès réservé aux managers et modérateurs." });
});


router.get("/user", (req, res) => {
    // console.log('testeur')
    con.query(SQL
        `	SELECT userId AS id, name, username, email, tel, photo
                FROM roles
                JOIN (SELECT roleId, userId, username, email, tel, photo
		            FROM user_roles
		            INNER JOIN users ON user_roles.userId = users.id) JU ON JU.roleId = roles.id ;`,
        function (err, result, fields) {
            if (err) {
                console.log(err);
                res.sendStatus(500);
                return;
            };
            res.status(200).json(result);
            return;
        }
    )
});


/**Ajouter une nouvelle company */
router.post("/newCompany", async (req, res) => {
    var companyForm = req.body
    let vague;
    try { vague = await vagueForNewCompany(companyForm.id_vague); } catch (err) { console.log(err); return res.sendStatus(500); }
    if (vague.error) return res.status(400).json({ message: vague.error });
    con.query(SQL
                `
                INSERT INTO entreprises
                (name, region, ville, date_creation, nbr_employer, nbr_femme, secteur, produits, services, description,
                quartier, lieu, gerant, descrt_gerant, id_consl, id_vague, x, y)
                VALUES
                (${companyForm.name}, ${companyForm.region}, ${companyForm.ville}, ${companyForm.date_creation}, ${companyForm.nbr_employer},
                ${companyForm.nbr_femme}, ${companyForm.secteur}, ${companyForm.produits}, ${companyForm.services}, ${companyForm.description}, ${companyForm.quartier},
                ${companyForm.lieu}, ${companyForm.gerant}, ${companyForm.descrt_gerant}, ${companyForm.idUser}, ${vague.id}, ${companyForm.x}, ${companyForm.y});
                `,
                function (err, result, fields) {
                    if (err) {
                        console.log(err);
                        res.sendStatus(500);
                        return;
                    };
                    res.sendStatus(200);
                    // console.log('record of Company done');
                }
            );
});


//Get Livrable By UserId

router.get("/livrables", (req, res) => {
    var userId = req.query.idUser;
    const w = vagueParams(req);
    con.query(SQL
                `
                SELECT livrable, tableur, tool_code, id_livrable, comp_id,  name as company, date, updated_at
                FROM entreprises
                join (
                    (SELECT 'Diagnostic Général' as livrable, 'matrice_diag_integral_note' as tableur, 't1d' as tool_code, id_diag_integ_note as id_livrable , comp_id, date, updated_at
                    FROM matrice_diag_integral_note
                    WHERE cons_id = ${userId})
                    UNION
                    (SELECT 'Prédiagnostic', 'mat_predia_crev_note', 'attribut' as tool_code, attr_id as id_livrable, comp_id, date, updated_at
                    FROM mat_predia_crev_note
                    WHERE cons_id = ${userId})
                    UNION
                    (SELECT 'Profil des participants', 'entreprise_profil', 't1l' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_profil
                    WHERE cons_id = ${userId})
                    UNION
                    (SELECT 'Cartographie des clients', 'cartographie_clients', 't1g' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM cartographie_clients
                    WHERE cons_id = ${userId})
                    UNION
                    (SELECT 'Diagnostic d''image commerciale', 'entreprise_image_com', 't1k' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_image_com
                    WHERE cons_id = ${userId})
                    UNION
                    (SELECT 'Diagnostic BPF', 'entreprise_bpf', 't1ea' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_bpf
                    WHERE cons_id = ${userId})
                    UNION
                    (SELECT 'Analyse financière', 'entreprise_finance', 't3h' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_finance
                    WHERE cons_id = ${userId})
                    UNION
                    (SELECT 'Outil 5S – initial', 'entreprise_5s', 't5s' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_5s
                    WHERE cons_id = ${userId} AND phase = 'initial')
                    UNION
                    (SELECT 'Outil 5S – final', 'entreprise_5s', 't5sf' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_5s
                    WHERE cons_id = ${userId} AND phase = 'final')
                    UNION
                    (SELECT 'Registre des Quick Wins – étape 1', 'entreprise_quickwins', 'tqw1' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_quickwins
                    WHERE cons_id = ${userId} AND etape = 1)
                    UNION
                    (SELECT 'Registre des Quick Wins – étape 2', 'entreprise_quickwins', 'tqw2' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_quickwins
                    WHERE cons_id = ${userId} AND etape = 2)
                    UNION
                    (SELECT 'Registre des Quick Wins – étape 3', 'entreprise_quickwins', 'tqw3' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_quickwins
                    WHERE cons_id = ${userId} AND etape = 3)
                    UNION
                    (SELECT 'Registre des Quick Wins – étape 4', 'entreprise_quickwins', 'tqw4' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_quickwins
                    WHERE cons_id = ${userId} AND etape = 4)
                    UNION
                    (SELECT 'Suivi et évaluation – initial', 'entreprise_suivi', 'tse' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_suivi
                    WHERE cons_id = ${userId} AND phase = 'initial')
                    UNION
                    (SELECT 'Suivi et évaluation – final', 'entreprise_suivi', 'tsef' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_suivi
                    WHERE cons_id = ${userId} AND phase = 'final')
                    UNION
                    (SELECT 'Profil de productivité de l''entreprise', 'entreprise_productivite', 't1j' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_productivite
                    WHERE cons_id = ${userId})
                    UNION
                    (SELECT CONCAT('Minutes de réunion du ', DATE_FORMAT(date_reunion, '%d/%m/%Y')), 'tool_minutes', 't1b' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM tool_minutes
                    WHERE cons_id = ${userId})
                ) Livrable
                ON ( entreprises.id = Livrable.comp_id AND (${w.all} = 1 OR entreprises.id_vague IN (${w.ids})) );
                `,
                function (err, result, fields) {
                    if (err) {
                        console.log(err);
                        res.sendStatus(500);
                        return;
                    };
                    res.status(200).json(result);
                    return;
                }
            );
});


// Get ALL livrables across every consultant, grouped by type, with consultant name
router.get("/all-livrables", (req, res) => {
    const w = vagueParams(req);
    con.query(SQL
                `
                SELECT livrable, tableur, tool_code, id_livrable, comp_id,
                       entreprises.name AS company, entreprises.ville, entreprises.region, entreprises.secteur,
                       entreprises.id_vague, vagues.nom AS vague,
                       Livrable.cons_id, users.username AS consultant,
                       (SELECT m.etape FROM tool_minutes m WHERE Livrable.tool_code = 't1b' AND m.id = Livrable.id_livrable) AS etape,
                       Livrable.date, Livrable.updated_at
                FROM entreprises
                JOIN (
                    (SELECT 'Diagnostic Général' AS livrable, 'matrice_diag_integral_note' AS tableur,
                            't1d' AS tool_code, id_diag_integ_note AS id_livrable, comp_id, cons_id, date, updated_at
                     FROM matrice_diag_integral_note)
                    UNION
                    (SELECT 'Prédiagnostic', 'mat_predia_crev_note', 'attribut', attr_id, comp_id, cons_id, date, updated_at
                     FROM mat_predia_crev_note)
                    UNION
                    (SELECT 'Profil des participants', 'entreprise_profil', 't1l', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_profil)
                    UNION
                    (SELECT 'Cartographie des clients', 'cartographie_clients', 't1g', id, comp_id, cons_id, date, updated_at
                     FROM cartographie_clients)
                    UNION
                    (SELECT 'Diagnostic d''image commerciale', 'entreprise_image_com', 't1k', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_image_com)
                    UNION
                    (SELECT 'Diagnostic BPF', 'entreprise_bpf', 't1ea', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_bpf)
                    UNION
                    (SELECT 'Analyse financière', 'entreprise_finance', 't3h', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_finance)
                    UNION
                    (SELECT 'Outil 5S – initial', 'entreprise_5s', 't5s', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_5s WHERE phase = 'initial')
                    UNION
                    (SELECT 'Outil 5S – final', 'entreprise_5s', 't5sf', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_5s WHERE phase = 'final')
                    UNION
                    (SELECT 'Registre des Quick Wins – étape 1', 'entreprise_quickwins', 'tqw1', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_quickwins WHERE etape = 1)
                    UNION
                    (SELECT 'Registre des Quick Wins – étape 2', 'entreprise_quickwins', 'tqw2', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_quickwins WHERE etape = 2)
                    UNION
                    (SELECT 'Registre des Quick Wins – étape 3', 'entreprise_quickwins', 'tqw3', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_quickwins WHERE etape = 3)
                    UNION
                    (SELECT 'Registre des Quick Wins – étape 4', 'entreprise_quickwins', 'tqw4', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_quickwins WHERE etape = 4)
                    UNION
                    (SELECT 'Suivi et évaluation – initial', 'entreprise_suivi', 'tse', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_suivi WHERE phase = 'initial')
                    UNION
                    (SELECT 'Suivi et évaluation – final', 'entreprise_suivi', 'tsef', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_suivi WHERE phase = 'final')
                    UNION
                    (SELECT 'Profil de productivité de l''entreprise', 'entreprise_productivite', 't1j', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_productivite)
                    UNION
                    (SELECT CONCAT('Minutes de réunion du ', DATE_FORMAT(date_reunion, '%d/%m/%Y')), 'tool_minutes', 't1b', id, comp_id, cons_id, date, updated_at
                     FROM tool_minutes)
                ) Livrable ON (entreprises.id = Livrable.comp_id AND (${w.all} = 1 OR entreprises.id_vague IN (${w.ids})))
                JOIN users ON (users.id = Livrable.cons_id)
                LEFT JOIN vagues ON (vagues.id = entreprises.id_vague)
                ORDER BY Livrable.updated_at DESC;
                `,
                function (err, result, fields) {
                    if (err) {
                        console.log(err);
                        res.sendStatus(500);
                        return;
                    };
                    res.status(200).json(result);
                    return;
                }
            );
});


// Tous les livrables d'une entreprise (tous consultants confondus), avec le nom du consultant
router.get("/company/:id/livrables", (req, res) => {
    const id = req.params.id;
    con.query(SQL
                `
                SELECT livrable, tableur, tool_code, id_livrable, Livrable.comp_id,
                       Livrable.cons_id, users.username AS consultant,
                       Livrable.date, Livrable.updated_at
                FROM (
                    (SELECT 'Diagnostic Général' AS livrable, 'matrice_diag_integral_note' AS tableur,
                            't1d' AS tool_code, id_diag_integ_note AS id_livrable, comp_id, cons_id, date, updated_at
                     FROM matrice_diag_integral_note WHERE comp_id = ${id})
                    UNION
                    (SELECT 'Prédiagnostic', 'mat_predia_crev_note', 'attribut', attr_id, comp_id, cons_id, date, updated_at
                     FROM mat_predia_crev_note WHERE comp_id = ${id})
                    UNION
                    (SELECT 'Profil des participants', 'entreprise_profil', 't1l', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_profil WHERE comp_id = ${id})
                    UNION
                    (SELECT 'Cartographie des clients', 'cartographie_clients', 't1g', id, comp_id, cons_id, date, updated_at
                     FROM cartographie_clients WHERE comp_id = ${id})
                    UNION
                    (SELECT 'Diagnostic d''image commerciale', 'entreprise_image_com', 't1k', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_image_com WHERE comp_id = ${id})
                    UNION
                    (SELECT 'Diagnostic BPF', 'entreprise_bpf', 't1ea', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_bpf WHERE comp_id = ${id})
                    UNION
                    (SELECT 'Analyse financière', 'entreprise_finance', 't3h', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_finance WHERE comp_id = ${id})
                    UNION
                    (SELECT 'Outil 5S – initial', 'entreprise_5s', 't5s', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_5s WHERE comp_id = ${id} AND phase = 'initial')
                    UNION
                    (SELECT 'Outil 5S – final', 'entreprise_5s', 't5sf', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_5s WHERE comp_id = ${id} AND phase = 'final')
                    UNION
                    (SELECT 'Registre des Quick Wins – étape 1', 'entreprise_quickwins', 'tqw1', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_quickwins WHERE comp_id = ${id} AND etape = 1)
                    UNION
                    (SELECT 'Registre des Quick Wins – étape 2', 'entreprise_quickwins', 'tqw2', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_quickwins WHERE comp_id = ${id} AND etape = 2)
                    UNION
                    (SELECT 'Registre des Quick Wins – étape 3', 'entreprise_quickwins', 'tqw3', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_quickwins WHERE comp_id = ${id} AND etape = 3)
                    UNION
                    (SELECT 'Registre des Quick Wins – étape 4', 'entreprise_quickwins', 'tqw4', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_quickwins WHERE comp_id = ${id} AND etape = 4)
                    UNION
                    (SELECT 'Suivi et évaluation – initial', 'entreprise_suivi', 'tse', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_suivi WHERE comp_id = ${id} AND phase = 'initial')
                    UNION
                    (SELECT 'Suivi et évaluation – final', 'entreprise_suivi', 'tsef', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_suivi WHERE comp_id = ${id} AND phase = 'final')
                    UNION
                    (SELECT 'Profil de productivité de l''entreprise', 'entreprise_productivite', 't1j', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_productivite WHERE comp_id = ${id})
                    UNION
                    (SELECT CONCAT('Minutes de réunion du ', DATE_FORMAT(date_reunion, '%d/%m/%Y')), 'tool_minutes', 't1b', id, comp_id, cons_id, date, updated_at
                     FROM tool_minutes WHERE comp_id = ${id})
                ) Livrable
                LEFT JOIN users ON (users.id = Livrable.cons_id)
                ORDER BY Livrable.updated_at DESC;
                `,
                function (err, result, fields) {
                    if (err) {
                        console.log(err);
                        res.sendStatus(500);
                        return;
                    };
                    res.status(200).json(result);
                }
            );
});


// Statistiques : une ligne par entreprise (identité + profil 1L le plus récent + nombre de livrables).
// Les agrégats, filtres et tris sont calculés côté frontend. Réservé aux admins et moderators.
router.get("/stats", async (req, res) => {
    try {
        if (!(await isManager(req.userId))) {
            return res.status(403).json({ message: "Accès non autorisé." });
        }
        const w = vagueParams(req);
        con.query(`
            SELECT e.id, e.name, e.region, e.departement, e.ville, e.secteur, e.date_creation,
                   e.nbr_employer, e.nbr_femme, e.id_consl AS cons_id, u.username AS consultant,
                   p.id AS profil_id, p.updated_at AS profil_updated_at,
                   p.effectif_total, p.effectif_femmes, p.type_entreprise,
                   p.enregistrement_fiscal, p.type_facturation, p.compte_bancaire, p.suivi_ca,
                   p.clients_reguliers, p.canaux_vente, p.type_clientele,
                   p.soutien_programme, p.subvention_recue,
                   (SELECT COALESCE(SUM(v.volume_fcfa), 0) FROM entreprise_profil_ventes v WHERE v.profil_id = p.id) AS ca_total_fcfa,
                   (SELECT COUNT(*) FROM mat_predia_crev_note n WHERE n.comp_id = e.id) AS nb_predia,
                   (SELECT COUNT(*) FROM matrice_diag_integral_note d WHERE d.comp_id = e.id) AS nb_diag
            FROM entreprises e
            LEFT JOIN users u ON u.id = e.id_consl
            LEFT JOIN entreprise_profil p ON p.id = (
                SELECT p2.id FROM entreprise_profil p2 WHERE p2.comp_id = e.id
                ORDER BY p2.updated_at DESC, p2.id DESC LIMIT 1)
            WHERE (? = 1 OR e.id_vague IN (?))
            ORDER BY e.name`, [w.all, w.ids],
            function (err, result) {
                if (err) { console.log(err); res.sendStatus(500); return; }
                res.status(200).json({ entreprises: result, fx });
            });
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
});

// ── Détail entreprise ──────────────────────────────────────────────────────────

router.get("/company/:id", (req, res) => {
    const id = req.params.id;
    con.query(SQL`SELECT e.*, e.id_consl AS idUser, u.username AS consultant, v.nom AS vague_nom, v.statut AS vague_statut
                  FROM entreprises e LEFT JOIN vagues v ON v.id = e.id_vague LEFT JOIN users u ON u.id = e.id_consl WHERE e.id = ${id}`,
        function (err, result) {
            if (err) { console.log(err); res.sendStatus(500); return; }
            if (result.length === 0) { res.sendStatus(404); return; }
            res.status(200).json(result[0]);
        }
    );
});

// Champs de la fiche entreprise que le manager peut modifier. Seuls les champs ENVOYÉS sont mis à jour : un formulaire
// qui n'envoie pas un champ (ex. « secteur ») ne l'efface plus.
const COMPANY_FIELDS = ['name', 'region', 'departement', 'ville', 'commune', 'date_creation', 'nbr_employer', 'nbr_femme',
    'secteur', 'produits', 'services', 'description', 'quartier', 'lieu', 'gerant', 'descrt_gerant', 'x', 'y'];

// Tables dont chaque ligne porte le consultant qui l'a saisie (cons_id) et l'entreprise (comp_id). Quand une entreprise change de
// consultant, ses livrables le suivent : les outils et les listes du consultant se lisent par (entreprise, consultant), et une
// évaluation est rattachée au même couple. livrable_reviews.reviewer_id (qui a évalué) et entreprise_images.uploaded_by (qui a
// téléversé la photo) ne changent pas.
const TRANSFER_TABLES = ['mat_predia_crev_note', 'matrice_diag_integral_note', 'matrice_diag_integral_note_archive', 'activity_tab',
    'bmc_data', 'cartographie_clients', 'entreprise_5s', 'entreprise_bpf', 'entreprise_finance', 'entreprise_image_com', 'entreprise_productivite',
    'entreprise_profil', 'entreprise_quickwins', 'entreprise_suivi', 'minutes_reunion', 'tool_minutes', 'livrable_reviews'];

// Parmi les tables candidates, celles qui existent vraiment dans CETTE base avec les colonnes cons_id et comp_id. La base en ligne n'a pas
// forcément toutes les tables historiques du poste local (ex. minutes_reunion, ancienne version des minutes, plus utilisée) : une table absente
// n'a aucune ligne à déplacer et ne doit pas faire échouer le transfert.
async function transferableTables(run) {
    const rows = await run(`SELECT table_name AS t, column_name AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name IN (?) AND column_name IN ('cons_id', 'comp_id')`, [[...TRANSFER_TABLES, 'livrable_review_seen']]);
    const cols = {};
    rows.forEach(r => (cols[r.t] = cols[r.t] || new Set()).add(r.c));
    const has = (t, c) => !!(cols[t] && cols[t].has(c));
    return {
        tables: TRANSFER_TABLES.filter(t => has(t, 'cons_id') && has(t, 'comp_id')),
        seen: has('livrable_review_seen', 'comp_id')
    };
}

// Message renvoyé à l'écran quand la base refuse l'opération : le code d'erreur aide à diagnostiquer sans ouvrir les journaux
const dbFailure = err => ({ message: `Enregistrement impossible (erreur de base de données${err && err.code ? ' ' + err.code : ''}). Rien n'a été modifié.` });

// Enregistre la fiche et, si besoin, transfère l'entreprise à un autre consultant, en une seule transaction (tout ou rien).
// Renvoie le nombre de lignes de livrables déplacées.
async function saveCompany(compId, sets, params, transfer) {
    const c = await getConnection();
    const run = (sql, p) => dbQuery(c, sql, p);
    try {
        await new Promise((ok, ko) => c.beginTransaction(e => e ? ko(e) : ok()));
        if (sets.length) await run(`UPDATE entreprises SET ${sets.join(', ')} WHERE id = ?`, [...params, compId]);
        let moved = 0;
        if (transfer) {
            const { tables, seen } = await transferableTables(run);
            const skipped = TRANSFER_TABLES.filter(t => !tables.includes(t));
            if (skipped.length) console.log(`[transfert] tables ignorées (absentes de cette base ou sans cons_id / comp_id) : ${skipped.join(', ')}`);
            for (const table of tables) {
                const r = await run(`UPDATE ${table} SET cons_id = ? WHERE comp_id = ? AND cons_id = ?`, [transfer.to, compId, transfer.from]);
                moved += r.affectedRows;
            }
            // « vu » est propre à chaque consultant : le nouveau n'a encore rien lu, les évaluations lui apparaissent comme nouvelles
            if (seen) await run('DELETE FROM livrable_review_seen WHERE comp_id = ?', [compId]);
            await run('UPDATE entreprises SET id_consl = ? WHERE id = ?', [transfer.to, compId]);
        }
        await new Promise((ok, ko) => c.commit(e => e ? ko(e) : ok()));
        return moved;
    } catch (err) {
        await new Promise(ok => c.rollback(() => ok()));
        throw err;
    } finally {
        c.release();
    }
}

router.put("/company/:id", async (req, res) => {
    const id = toId(req.params.id);
    const c = req.body || {};
    if (!id) return res.sendStatus(400);
    if ('name' in c && isEmpty(c.name)) return res.status(400).json({ message: "Le nom de l'entreprise est obligatoire." });

    // La vague et le consultant en charge ne changent que par l'administrateur (un modérateur qui renvoie la même valeur n'est pas bloqué)
    let newVague = null, newConsultant = null, current;
    try {
        [current] = await dbQuery(con, 'SELECT id_vague, id_consl FROM entreprises WHERE id = ?', [id]);
        if (!current) return res.sendStatus(404);

        const wantedVague = toId(c.id_vague);
        if (wantedVague && wantedVague !== current.id_vague) {
            if (!(await isAdmin(req.userId))) return res.status(403).json({ message: "Seul l'administrateur peut changer la vague d'une entreprise." });
            const [v] = await dbQuery(con, 'SELECT id FROM vagues WHERE id = ?', [wantedVague]);
            if (!v) return res.status(400).json({ message: "Vague introuvable." });
            newVague = wantedVague;
        }

        const wantedCons = toId(c.id_consl);
        if (wantedCons && wantedCons !== current.id_consl) {
            if (!(await isAdmin(req.userId))) return res.status(403).json({ message: "Seul l'administrateur peut changer le consultant en charge d'une entreprise." });
            const [u] = await dbQuery(con, `
                SELECT u.id, u.username FROM users u
                JOIN user_roles ur ON ur.userId = u.id JOIN roles r ON r.id = ur.roleId
                WHERE u.id = ? AND r.name = 'consultant'`, [wantedCons]);
            if (!u) return res.status(400).json({ message: "Le consultant choisi est introuvable ou n'a pas le rôle consultant." });
            newConsultant = u;
        }
    } catch (err) {
        console.log(err); return res.status(500).json(dbFailure(err));
    }

    const sets = [], params = [];
    for (const f of COMPANY_FIELDS) {
        if (c[f] !== undefined) { sets.push(`${f} = ?`); params.push(c[f]); }
    }
    if (newVague) { sets.push('id_vague = ?'); params.push(newVague); }

    try {
        const moved = await saveCompany(id, sets, params, newConsultant && { from: current.id_consl, to: newConsultant.id });
        if (newConsultant) {
            console.log(`[transfert] entreprise ${id} : consultant ${current.id_consl} -> ${newConsultant.id} (${newConsultant.username}) par l'utilisateur ${req.userId}, ${moved} ligne(s) de livrables déplacée(s)`);
        }
        res.status(200).json({ message: "Entreprise mise à jour.", transferred: moved, consultant: newConsultant ? { id: newConsultant.id, username: newConsultant.username } : null });
    } catch (err) {
        console.log(err);
        // Clé unique (consultant, entreprise) : le nouveau consultant a déjà saisi un livrable de même type pour cette entreprise
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "Enregistrement annulé : le consultant choisi a déjà saisi des livrables pour cette entreprise. Rien n'a été modifié." });
        }
        res.status(500).json(dbFailure(err));
    }
});

router.delete("/company/:id", (req, res) => {
    const id = req.params.id;
    con.query(SQL`DELETE FROM entreprises WHERE id = ${id}`,
        function (err, result) {
            if (err) { console.log(err); res.sendStatus(500); return; }
            if (result.affectedRows > 0) {
                con.query(SQL`DELETE FROM entreprise_images WHERE comp_id = ${id}`, e => e && console.log(e));
                con.query(SQL`DELETE r FROM entreprise_suivi_reponses r JOIN entreprise_suivi s ON s.id = r.suivi_id WHERE s.comp_id = ${id}`, es => {
                    if (es) console.log(es);
                    con.query(SQL`DELETE FROM entreprise_suivi WHERE comp_id = ${id}`, es2 => es2 && console.log(es2));
                });
                con.query(SQL`DELETE q FROM entreprise_quickwins_actions q JOIN entreprise_quickwins r ON r.id = q.registre_id WHERE r.comp_id = ${id}`, eq => {
                    if (eq) console.log(eq);
                    con.query(SQL`DELETE FROM entreprise_quickwins WHERE comp_id = ${id}`, eq2 => eq2 && console.log(eq2));
                });
                con.query(SQL`DELETE p FROM tool_minutes_presents p JOIN tool_minutes m ON m.id = p.minute_id WHERE m.comp_id = ${id}`, e => {
                    if (e) console.log(e);
                    con.query(SQL`DELETE g FROM tool_minutes_engagements g JOIN tool_minutes m ON m.id = g.minute_id WHERE m.comp_id = ${id}`, e0 => {
                        if (e0) console.log(e0);
                        con.query(SQL`DELETE FROM tool_minutes WHERE comp_id = ${id}`, e2 => e2 && console.log(e2));
                    });
                });
                removeCompanyFiles(id);
            }
            res.status(200).json(result);
        }
    );
});

module.exports = router;