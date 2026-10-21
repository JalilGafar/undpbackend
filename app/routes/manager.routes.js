const express = require('express');
const { authJwt } = require("../middleware");
const router = express.Router();
const controller = require("../controllers/user.controller");
var con = require('./../config/dbcon');
var SQL = require('sql-template-strings');
const { removeCompanyFiles } = require('../middleware/upload');
const { isManager } = require('../middleware/access');
const fx = require('../config/fx.config');

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
router.post("/newCompany", (req, res) => {
    var companyForm = req.body
    // console.log(companyForm);
    con.query(SQL
                `
                INSERT INTO entreprises
                (name, region, ville, date_creation, nbr_employer, nbr_femme, secteur, produits, services, description,
                quartier, lieu, gerant, descrt_gerant, id_consl, x, y)
                VALUES
                (${companyForm.name}, ${companyForm.region}, ${companyForm.ville}, ${companyForm.date_creation}, ${companyForm.nbr_employer},
                ${companyForm.nbr_femme}, ${companyForm.secteur}, ${companyForm.produits}, ${companyForm.services}, ${companyForm.description}, ${companyForm.quartier},
                ${companyForm.lieu}, ${companyForm.gerant}, ${companyForm.descrt_gerant}, ${companyForm.idUser}, ${companyForm.x}, ${companyForm.y});
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
    con.query(SQL
                `
                SELECT livrable, tableur, tool_code, id_livrable, comp_id,  name as company, date, updated_at
                FROM entreprises
                join (
                    (SELECT 'Diagnostic intégral' as livrable, 'matrice_diag_integral_note' as tableur, 't1d' as tool_code, id_diag_integ_note as id_livrable , comp_id, date, updated_at
                    FROM matrice_diag_integral_note
                    WHERE cons_id = ${userId})
                    UNION
                    (SELECT 'Prédiagnostic', 'mat_predia_crev_note', 'attribut' as tool_code, attr_id as id_livrable, comp_id, date, updated_at
                    FROM mat_predia_crev_note
                    WHERE cons_id = ${userId})
                    UNION
                    (SELECT 'Profil d''informations', 'entreprise_profil', 't1l' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM entreprise_profil
                    WHERE cons_id = ${userId})
                    UNION
                    (SELECT 'Cartographie des clients', 'cartographie_clients', 't1g' as tool_code, id as id_livrable, comp_id, date, updated_at
                    FROM cartographie_clients
                    WHERE cons_id = ${userId})
                ) Livrable
                ON ( entreprises.id = Livrable.comp_id);
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
    con.query(SQL
                `
                SELECT livrable, tableur, tool_code, id_livrable, comp_id,
                       entreprises.name AS company, entreprises.ville, entreprises.secteur,
                       Livrable.cons_id, users.username AS consultant,
                       Livrable.date, Livrable.updated_at
                FROM entreprises
                JOIN (
                    (SELECT 'Diagnostic intégral' AS livrable, 'matrice_diag_integral_note' AS tableur,
                            't1d' AS tool_code, id_diag_integ_note AS id_livrable, comp_id, cons_id, date, updated_at
                     FROM matrice_diag_integral_note)
                    UNION
                    (SELECT 'Prédiagnostic', 'mat_predia_crev_note', 'attribut', attr_id, comp_id, cons_id, date, updated_at
                     FROM mat_predia_crev_note)
                    UNION
                    (SELECT 'Profil d''informations', 'entreprise_profil', 't1l', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_profil)
                    UNION
                    (SELECT 'Cartographie des clients', 'cartographie_clients', 't1g', id, comp_id, cons_id, date, updated_at
                     FROM cartographie_clients)
                ) Livrable ON (entreprises.id = Livrable.comp_id)
                JOIN users ON (users.id = Livrable.cons_id)
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
                    (SELECT 'Diagnostic intégral' AS livrable, 'matrice_diag_integral_note' AS tableur,
                            't1d' AS tool_code, id_diag_integ_note AS id_livrable, comp_id, cons_id, date, updated_at
                     FROM matrice_diag_integral_note WHERE comp_id = ${id})
                    UNION
                    (SELECT 'Prédiagnostic', 'mat_predia_crev_note', 'attribut', attr_id, comp_id, cons_id, date, updated_at
                     FROM mat_predia_crev_note WHERE comp_id = ${id})
                    UNION
                    (SELECT 'Profil d''informations', 'entreprise_profil', 't1l', id, comp_id, cons_id, date, updated_at
                     FROM entreprise_profil WHERE comp_id = ${id})
                    UNION
                    (SELECT 'Cartographie des clients', 'cartographie_clients', 't1g', id, comp_id, cons_id, date, updated_at
                     FROM cartographie_clients WHERE comp_id = ${id})
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
            ORDER BY e.name`,
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
    con.query(SQL`SELECT *, id_consl AS idUser FROM entreprises WHERE id = ${id}`,
        function (err, result) {
            if (err) { console.log(err); res.sendStatus(500); return; }
            if (result.length === 0) { res.sendStatus(404); return; }
            res.status(200).json(result[0]);
        }
    );
});

router.put("/company/:id", (req, res) => {
    const id = req.params.id;
    const c = req.body;
    con.query(SQL`
        UPDATE entreprises SET
            name          = ${c.name},
            region        = ${c.region},
            departement   = ${c.departement},
            ville         = ${c.ville},
            commune       = ${c.commune},
            date_creation = ${c.date_creation},
            nbr_employer  = ${c.nbr_employer},
            nbr_femme     = ${c.nbr_femme},
            secteur       = ${c.secteur},
            produits      = ${c.produits},
            services      = ${c.services},
            description   = ${c.description},
            quartier      = ${c.quartier},
            lieu          = ${c.lieu},
            gerant        = ${c.gerant},
            descrt_gerant = ${c.descrt_gerant},
            x             = ${c.x},
            y             = ${c.y}
        WHERE id = ${id}
    `, function (err, result) {
        if (err) { console.log(err); res.sendStatus(500); return; }
        res.status(200).json(result);
    });
});

router.delete("/company/:id", (req, res) => {
    const id = req.params.id;
    con.query(SQL`DELETE FROM entreprises WHERE id = ${id}`,
        function (err, result) {
            if (err) { console.log(err); res.sendStatus(500); return; }
            if (result.affectedRows > 0) {
                con.query(SQL`DELETE FROM entreprise_images WHERE comp_id = ${id}`, e => e && console.log(e));
                removeCompanyFiles(id);
            }
            res.status(200).json(result);
        }
    );
});

module.exports = router;