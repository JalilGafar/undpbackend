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


router.get("/companies", (req, res) => {

    con.query("SELECT * FROM entreprises;",
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

router.get("/companiesUser", (req, res) => {
    var userId = req.query.idUser
    console.log(userId)
    con.query(SQL
        `SELECT * FROM entreprises where (id_consl = ${userId})  ;`,
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
    console.log('begining company insertion !');
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
                    console.log('record of Company done');
                }
            );
});

module.exports = router;