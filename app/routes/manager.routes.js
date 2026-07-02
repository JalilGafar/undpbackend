const express = require('express');
const { authJwt } = require("../middleware");
const router = express.Router();
const controller = require("../controllers/user.controller");
var con = require('./../config/dbcon');
var SQL = require('sql-template-strings');

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
        `	SELECT userId AS id, name, username, email, tel
                FROM roles
                JOIN (SELECT roleId, userId, username, email, tel
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
                (name, region, ville, date_creation, nbr_employer, nbr_femme, produits, services, description, 
                quartier, lieu, gerant, descrt_gerant, id_consl, x, y) 
                VALUES 
                (${companyForm.name}, ${companyForm.region}, ${companyForm.ville}, ${companyForm.date_creation}, ${companyForm.nbr_employer}, 
                ${companyForm.nbr_femme}, ${companyForm.produits}, ${companyForm.services}, ${companyForm.description}, ${companyForm.quartier}, 
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
                SELECT livrable, tableur, tool_code, id_livrable, comp_id,  name as company, date
                FROM entreprises
                join (
                    (SELECT 'Diagnostic integrale' as livrable, 'matrice_diag_integral_note' as tableur, 't1d' as tool_code, id_diag_integ_note as id_livrable , comp_id, date
                    FROM matrice_diag_integral_note
                    WHERE cons_id = ${userId})
                    UNION
                    (SELECT 'prediagnostic', 'mat_predia_crev_note', 'attribut' as tool_code, attr_id as id_livrable, comp_id, date
                    FROM mat_predia_crev_note
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
            res.status(200).json(result);
        }
    );
});

module.exports = router;