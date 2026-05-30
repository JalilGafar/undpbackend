const express = require('express');
const router = express.Router();
var con = require('./../config/dbcon');
var SQL = require('sql-template-strings');


router.use(function (req, res, next) {
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, Content-Type, Accept"
    );
    next();
});


router.post("/attribut", (req, res) => {
    var d = req.body
    console.log('begining Attribut tools insertion !');
    con.query(SQL
        `
           INSERT INTO mat_predia_crev_note (
                cons_id, comp_id,
                note_1, comment_1, note_2, comment_2, note_3, comment_3, note_4, comment_4,
                note_5, comment_5, note_6, comment_6, note_7, comment_7, note_8, comment_8,
                note_9, comment_9, note_10, comment_10, note_11, comment_11, note_12, comment_12,
                note_13, comment_13, note_14, comment_14, note_15, comment_15, note_16, comment_16,
                note_17, comment_17, note_18, comment_18, note_19, comment_19,
                gen_nom_prenom, gen_sexe, gen_age, gen_telephone, gen_adresse,
                gen_ville, gen_nom_entreprise, gen_type_entreprise, gen_email,
                gen_activite_principale, gen_activite_autre, gen_ventes_mensuelles,
                gen_role_entreprise, gen_situation_entreprise, gen_formation_interesse
            )
            VALUES (
                ${d.cons_id}, ${d.comp_id},
                ${d.note_1}, ${d.comment_1}, ${d.note_2}, ${d.comment_2}, ${d.note_3}, ${d.comment_3},
                ${d.note_4}, ${d.comment_4}, ${d.note_5}, ${d.comment_5}, ${d.note_6}, ${d.comment_6},
                ${d.note_7}, ${d.comment_7}, ${d.note_8}, ${d.comment_8}, ${d.note_9}, ${d.comment_9},
                ${d.note_10}, ${d.comment_10}, ${d.note_11}, ${d.comment_11}, ${d.note_12}, ${d.comment_12},
                ${d.note_13}, ${d.comment_13}, ${d.note_14}, ${d.comment_14}, ${d.note_15}, ${d.comment_15},
                ${d.note_16}, ${d.comment_16}, ${d.note_17}, ${d.comment_17}, ${d.note_18}, ${d.comment_18},
                ${d.note_19}, ${d.comment_19},
                ${d.gen_nom_prenom}, ${d.gen_sexe}, ${d.gen_age}, ${d.gen_telephone}, ${d.gen_adresse},
                ${d.gen_ville}, ${d.gen_nom_entreprise}, ${d.gen_type_entreprise}, ${d.gen_email},
                ${d.gen_activite_principale}, ${d.gen_activite_autre}, ${d.gen_ventes_mensuelles},
                ${d.gen_role_entreprise}, ${d.gen_situation_entreprise}, ${d.gen_formation_interesse}
            )
            ON DUPLICATE KEY UPDATE
                note_1 = VALUES(note_1), comment_1 = VALUES(comment_1),
                note_2 = VALUES(note_2), comment_2 = VALUES(comment_2),
                note_3 = VALUES(note_3), comment_3 = VALUES(comment_3),
                note_4 = VALUES(note_4), comment_4 = VALUES(comment_4),
                note_5 = VALUES(note_5), comment_5 = VALUES(comment_5),
                note_6 = VALUES(note_6), comment_6 = VALUES(comment_6),
                note_7 = VALUES(note_7), comment_7 = VALUES(comment_7),
                note_8 = VALUES(note_8), comment_8 = VALUES(comment_8),
                note_9 = VALUES(note_9), comment_9 = VALUES(comment_9),
                note_10 = VALUES(note_10), comment_10 = VALUES(comment_10),
                note_11 = VALUES(note_11), comment_11 = VALUES(comment_11),
                note_12 = VALUES(note_12), comment_12 = VALUES(comment_12),
                note_13 = VALUES(note_13), comment_13 = VALUES(comment_13),
                note_14 = VALUES(note_14), comment_14 = VALUES(comment_14),
                note_15 = VALUES(note_15), comment_15 = VALUES(comment_15),
                note_16 = VALUES(note_16), comment_16 = VALUES(comment_16),
                note_17 = VALUES(note_17), comment_17 = VALUES(comment_17),
                note_18 = VALUES(note_18), comment_18 = VALUES(comment_18),
                note_19 = VALUES(note_19), comment_19 = VALUES(comment_19),
                gen_nom_prenom          = VALUES(gen_nom_prenom),
                gen_sexe                = VALUES(gen_sexe),
                gen_age                 = VALUES(gen_age),
                gen_telephone           = VALUES(gen_telephone),
                gen_adresse             = VALUES(gen_adresse),
                gen_ville               = VALUES(gen_ville),
                gen_nom_entreprise      = VALUES(gen_nom_entreprise),
                gen_type_entreprise     = VALUES(gen_type_entreprise),
                gen_email               = VALUES(gen_email),
                gen_activite_principale = VALUES(gen_activite_principale),
                gen_activite_autre      = VALUES(gen_activite_autre),
                gen_ventes_mensuelles   = VALUES(gen_ventes_mensuelles),
                gen_role_entreprise     = VALUES(gen_role_entreprise),
                gen_situation_entreprise = VALUES(gen_situation_entreprise),
                gen_formation_interesse = VALUES(gen_formation_interesse)
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
    )
});

router.post("/activities", (req, res) =>{
    var activities = req.body
    con.query(SQL 
        `
            INSERT INTO activity_tab 
            (name, details, start, end, close, progress, status, dependencies, responsable, comments, cons_id, comp_id) 
            VALUES (
                ${activities.name}, 
                ${activities.details}, 
                ${activities.start}, 
                ${activities.end}, 
                ${activities.close}, 
                ${activities.progress}, 
                ${activities.status}, 
                ${activities.dependencies}, 
                ${activities.responsable}, 
                ${activities.comments}, 
                ${activities.cons_id}, 
                ${activities.comp_id}
            )  
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
     )
} )

router.post("/bmc", (req, res) =>{
    var bmc = req.body
    console.log(bmc)
    con.query(SQL 
        `
            INSERT INTO bmc_data (
                cons_id, comp_id,
                customerSegments1, customerSegments2, customerSegments3,
                valuePropositions1, valuePropositions2, valuePropositions3,
                channels1, channels2, channels3,
                problemeIdentifie1, problemeIdentifie2, problemeIdentifie3,
                but1, but2, but3,
                mesureImpact1, mesureImpact2, mesureImpact3,
                customerRelationships1, customerRelationships2, customerRelationships3,
                revenueStreams1, revenueStreams2, revenueStreams3,
                keyResources1, keyResources2, keyResources3,
                keyActivities1, keyActivities2, keyActivities3,
                keyPartnerships1, keyPartnerships2, keyPartnerships3,
                costStructure1, costStructure2, costStructure3
                
            ) VALUES (
                ${bmc.cons_id}, ${bmc.comp_id},
                ${bmc.customerSegments1}, ${bmc.customerSegments2}, ${bmc.customerSegments3}, 
                ${bmc.valuePropositions1}, ${bmc.valuePropositions2}, ${bmc.valuePropositions3},
                ${bmc.channels1}, ${bmc.channels2}, ${bmc.channels3},
                ${bmc.problemeIdentifie1}, ${bmc.problemeIdentifie2}, ${bmc.problemeIdentifie3},
                ${bmc.but1}, ${bmc.but2}, ${bmc.but3},
                ${bmc.mesureImpact1}, ${bmc.mesureImpact2}, ${bmc.mesureImpact3},
                ${bmc.customerRelationships1}, ${bmc.customerRelationships2}, ${bmc.customerRelationships3},
                ${bmc.revenueStreams1}, ${bmc.revenueStreams2}, ${bmc.revenueStreams3},
                ${bmc.keyResources1}, ${bmc.keyResources2}, ${bmc.keyResources3},
                ${bmc.keyActivities1}, ${bmc.keyActivities2}, ${bmc.keyActivities3},
                ${bmc.keyPartnerships1}, ${bmc.keyPartnerships2}, ${bmc.keyPartnerships3},
                ${bmc.costStructure1}, ${bmc.costStructure2}, ${bmc.costStructure3}
        )
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
     )
} )

router.post("/integral", (req, res) => {
    var attribForm = req.body
    console.log('begining Mat Integ tools  insertion !');
    con.query(SQL 
        `
           INSERT INTO matrice_diag_integral_note (
                cons_id, comp_id,
                note_1, comt_1, 
                note_2, comt_2, 
                note_3, comt_3, 
                note_4, comt_4,
                note_5, comt_5, 
                note_6, comt_6, 
                note_7, comt_7, 
                note_8, comt_8,
                note_9, comt_9, 
                note_10, comt_10, 
                note_11, comt_11, 
                note_12, comt_12,
                note_13, comt_13, 
                note_14, comt_14,
                note_15, comt_15, 
                note_16, comt_16, 
                note_17, comt_17, 
                note_18, comt_18,
                note_19, comt_19, 
                note_20, comt_20, 
                note_21, comt_21, 
                note_22, comt_22,
                note_23, comt_23, 
                note_24, comt_24,
                note_25, comt_25, 
                note_26, comt_26, 
                note_27, comt_27, 
                note_28, comt_28,
                note_29, comt_29, 
                note_30, comt_30, 
                note_31, comt_31, 
                note_32, comt_32,
                note_33, comt_33, 
                note_34, comt_34,
                note_35, comt_35, 
                note_36, comt_36, 
                note_37, comt_37, 
                note_38, comt_38,
                note_39, comt_39, 
                note_40, comt_40, 
                note_41, comt_41, 
                note_42, comt_42,
                note_43, comt_43, 
                note_44, comt_44,
                note_45, comt_45, 
                note_46, comt_46, 
                note_47, comt_47, 
                note_48, comt_48,
                note_49, comt_49, 
                note_50, comt_50, 
                note_51, comt_51, 
                note_52, comt_52,
                note_53, comt_53, 
                note_54, comt_54,
                note_55, comt_55, 
                note_56, comt_56, 
                note_57, comt_57, 
                note_58, comt_58,
                note_59, comt_59, 
                note_60, comt_60, 
                note_61, comt_61, 
                note_62, comt_62,
                difficult_1, difficult_2, difficult_3,
                force_1, force_2, force_3,
                faiblesse_1, faiblesse_2, faiblesse_3,
                besoin_1, besoin_2, besoin_3
            )
            VALUES (
                ${attribForm.cons_id}, ${attribForm.comp_id},
                ${attribForm.note_1}, ${attribForm.comt_1}, 
                ${attribForm.note_2}, ${attribForm.comt_2}, 
                ${attribForm.note_3}, ${attribForm.comt_3},
                ${attribForm.note_4}, ${attribForm.comt_4},
                ${attribForm.note_5}, ${attribForm.comt_5}, 
                ${attribForm.note_6}, ${attribForm.comt_6},
                ${attribForm.note_7}, ${attribForm.comt_7},
                ${attribForm.note_8}, ${attribForm.comt_8},
                ${attribForm.note_9}, ${attribForm.comt_9},
                ${attribForm.note_10}, ${attribForm.comt_10}, 
                ${attribForm.note_11}, ${attribForm.comt_11},
                ${attribForm.note_12}, ${attribForm.comt_12},
                ${attribForm.note_13}, ${attribForm.comt_13},
                ${attribForm.note_14}, ${attribForm.comt_14},
                ${attribForm.note_15}, ${attribForm.comt_15}, 
                ${attribForm.note_16}, ${attribForm.comt_16},
                ${attribForm.note_17}, ${attribForm.comt_17},
                ${attribForm.note_18}, ${attribForm.comt_18},
                ${attribForm.note_19}, ${attribForm.comt_19},
                ${attribForm.note_20}, ${attribForm.comt_20}, 
                ${attribForm.note_21}, ${attribForm.comt_21},
                ${attribForm.note_22}, ${attribForm.comt_22},
                ${attribForm.note_23}, ${attribForm.comt_23},
                ${attribForm.note_24}, ${attribForm.comt_24},
                ${attribForm.note_25}, ${attribForm.comt_25}, 
                ${attribForm.note_26}, ${attribForm.comt_26},
                ${attribForm.note_27}, ${attribForm.comt_27},
                ${attribForm.note_28}, ${attribForm.comt_28},
                ${attribForm.note_29}, ${attribForm.comt_29},
                ${attribForm.note_30}, ${attribForm.comt_30}, 
                ${attribForm.note_31}, ${attribForm.comt_31},
                ${attribForm.note_32}, ${attribForm.comt_32},
                ${attribForm.note_33}, ${attribForm.comt_33},
                ${attribForm.note_34}, ${attribForm.comt_34},
                ${attribForm.note_35}, ${attribForm.comt_35}, 
                ${attribForm.note_36}, ${attribForm.comt_36},
                ${attribForm.note_37}, ${attribForm.comt_37},
                ${attribForm.note_38}, ${attribForm.comt_38},
                ${attribForm.note_39}, ${attribForm.comt_39},
                ${attribForm.note_40}, ${attribForm.comt_40}, 
                ${attribForm.note_41}, ${attribForm.comt_41},
                ${attribForm.note_42}, ${attribForm.comt_42},
                ${attribForm.note_43}, ${attribForm.comt_43},
                ${attribForm.note_44}, ${attribForm.comt_44},
                ${attribForm.note_45}, ${attribForm.comt_45}, 
                ${attribForm.note_46}, ${attribForm.comt_46},
                ${attribForm.note_47}, ${attribForm.comt_47},
                ${attribForm.note_48}, ${attribForm.comt_48},
                ${attribForm.note_49}, ${attribForm.comt_49},
                ${attribForm.note_50}, ${attribForm.comt_50}, 
                ${attribForm.note_51}, ${attribForm.comt_51},
                ${attribForm.note_52}, ${attribForm.comt_52},
                ${attribForm.note_53}, ${attribForm.comt_53},
                ${attribForm.note_54}, ${attribForm.comt_54},
                ${attribForm.note_55}, ${attribForm.comt_55}, 
                ${attribForm.note_56}, ${attribForm.comt_56},
                ${attribForm.note_57}, ${attribForm.comt_57},
                ${attribForm.note_58}, ${attribForm.comt_58},
                ${attribForm.note_59}, ${attribForm.comt_59},
                ${attribForm.note_60}, ${attribForm.comt_60}, 
                ${attribForm.note_61}, ${attribForm.comt_61},
                ${attribForm.note_62}, ${attribForm.comt_62},
                ${attribForm.difficult_1}, ${attribForm.difficult_2}, ${attribForm.difficult_3},
                ${attribForm.force_1}, ${attribForm.force_2}, ${attribForm.force_3},
                ${attribForm.faiblesse_1}, ${attribForm.faiblesse_2}, ${attribForm.faiblesse_3},
                ${attribForm.besoin_1}, ${attribForm.besoin_2}, ${attribForm.besoin_3}
            )
            ON DUPLICATE KEY UPDATE
                note_1 = VALUES(note_1), comt_1 = VALUES(comt_1),
                note_2 = VALUES(note_2), comt_2 = VALUES(comt_2),
                note_3 = VALUES(note_3), comt_3 = VALUES(comt_3),
                note_4 = VALUES(note_4), comt_4 = VALUES(comt_4),
                note_5 = VALUES(note_5), comt_5 = VALUES(comt_5),
                note_6 = VALUES(note_6), comt_6 = VALUES(comt_6),
                note_7 = VALUES(note_7), comt_7 = VALUES(comt_7),
                note_8 = VALUES(note_8), comt_8 = VALUES(comt_8),
                note_9 = VALUES(note_9), comt_9 = VALUES(comt_9),
                note_10 = VALUES(note_10), comt_10 = VALUES(comt_10),
                note_11 = VALUES(note_11), comt_11 = VALUES(comt_11),
                note_12 = VALUES(note_12), comt_12 = VALUES(comt_12),
                note_13 = VALUES(note_13), comt_13 = VALUES(comt_13),
                note_14 = VALUES(note_14), comt_14 = VALUES(comt_14),
                note_15 = VALUES(note_15), comt_15 = VALUES(comt_15),
                note_16 = VALUES(note_16), comt_16 = VALUES(comt_16),
                note_17 = VALUES(note_17), comt_17 = VALUES(comt_17),
                note_18 = VALUES(note_18), comt_18 = VALUES(comt_18),
                note_19 = VALUES(note_19), comt_19 = VALUES(comt_19),
                note_20 = VALUES(note_20), comt_20 = VALUES(comt_20),
                note_21 = VALUES(note_21), comt_21 = VALUES(comt_21),
                note_22 = VALUES(note_22), comt_22 = VALUES(comt_22),
                note_23 = VALUES(note_23), comt_23 = VALUES(comt_23),
                note_24 = VALUES(note_24), comt_24 = VALUES(comt_24),
                note_25 = VALUES(note_25), comt_25 = VALUES(comt_25),
                note_26 = VALUES(note_26), comt_26 = VALUES(comt_26),
                note_27 = VALUES(note_27), comt_27 = VALUES(comt_27),
                note_28 = VALUES(note_28), comt_28 = VALUES(comt_28),
                note_29 = VALUES(note_29), comt_29 = VALUES(comt_29),
                note_30 = VALUES(note_30), comt_30 = VALUES(comt_30),
                note_31 = VALUES(note_31), comt_31 = VALUES(comt_31),
                note_32 = VALUES(note_32), comt_32 = VALUES(comt_32),
                note_33 = VALUES(note_33), comt_33 = VALUES(comt_33),
                note_34 = VALUES(note_34), comt_34 = VALUES(comt_34),
                note_35 = VALUES(note_35), comt_35 = VALUES(comt_35),
                note_36 = VALUES(note_36), comt_36 = VALUES(comt_36),
                note_37 = VALUES(note_37), comt_37 = VALUES(comt_37),
                note_38 = VALUES(note_38), comt_38 = VALUES(comt_38),
                note_39 = VALUES(note_39), comt_39 = VALUES(comt_39),
                note_40 = VALUES(note_40), comt_40 = VALUES(comt_40),
                note_41 = VALUES(note_41), comt_41 = VALUES(comt_41),
                note_42 = VALUES(note_42), comt_42 = VALUES(comt_42),
                note_43 = VALUES(note_43), comt_43 = VALUES(comt_43),
                note_44 = VALUES(note_44), comt_44 = VALUES(comt_44),
                note_45 = VALUES(note_45), comt_45 = VALUES(comt_45),
                note_46 = VALUES(note_46), comt_46 = VALUES(comt_46),
                note_47 = VALUES(note_47), comt_47 = VALUES(comt_47),
                note_48 = VALUES(note_48), comt_48 = VALUES(comt_48),
                note_49 = VALUES(note_49), comt_49 = VALUES(comt_49),
                note_50 = VALUES(note_50), comt_50 = VALUES(comt_50),
                note_51 = VALUES(note_51), comt_51 = VALUES(comt_51),
                note_52 = VALUES(note_52), comt_52 = VALUES(comt_52),
                note_53 = VALUES(note_53), comt_53 = VALUES(comt_53),
                note_54 = VALUES(note_54), comt_54 = VALUES(comt_54),
                note_55 = VALUES(note_55), comt_55 = VALUES(comt_55),
                note_56 = VALUES(note_56), comt_56 = VALUES(comt_56),
                note_57 = VALUES(note_57), comt_57 = VALUES(comt_57),
                note_58 = VALUES(note_58), comt_58 = VALUES(comt_58),
                note_59 = VALUES(note_59), comt_59 = VALUES(comt_59),
                note_60 = VALUES(note_60), comt_60 = VALUES(comt_60),
                note_61 = VALUES(note_61), comt_61 = VALUES(comt_61),
                note_62 = VALUES(note_62), comt_62 = VALUES(comt_62),
                difficult_1 = VALUES(difficult_1), difficult_2 = VALUES(difficult_2), difficult_3 = VALUES(difficult_3),
                force_1 = VALUES(force_1), force_2 = VALUES(force_2), force_3 = VALUES(force_3),
                faiblesse_1 = VALUES(faiblesse_1), faiblesse_2 = VALUES(faiblesse_2), faiblesse_3 = VALUES(faiblesse_3),
                besoin_1 = VALUES(besoin_1), besoin_2 = VALUES(besoin_2), besoin_3 = VALUES(besoin_3)
                ;

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
    )
});

router.get("/attribut", (req, res) => {
    var userId = req.query.idUser
    var compId = req.query.idComp
    console.log(userId, compId)
    con.query(SQL
        `SELECT * FROM mat_predia_crev_note where (cons_id = ${userId} && comp_id = ${compId} )  ;`,
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

router.get("/activities", (req, res) => {
    var userId = req.query.idUser
    var compId = req.query.idComp
    console.log('Visualisation '+userId, compId)
    con.query(SQL
        `SELECT * FROM activity_tab where (cons_id = ${userId} && comp_id = ${compId} )  ;`,
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

router.get("/integral", (req, res) => {
    var userId = req.query.idUser
    var compId = req.query.idComp
    console.log(userId, compId)
    con.query(SQL
        `SELECT * FROM matrice_diag_integral_note where (cons_id = ${userId} && comp_id = ${compId} )  ;`,
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

///*********** Route to get mat Predia Label */
router.get("/matPrediaLabel", (req, res) => {
    con.query(SQL
        `SELECT * FROM matrice_prediagnostic;`,
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

//************Route to get Mat Integ Label */
router.get("/matIntegLabel", (req, res) => {
    con.query(SQL
        `SELECT * FROM matrice_diag_integral;`,
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

//************Route to get Business Model Canvas */
router.get("/bmc", (req, res) => {
    var userId = req.query.idUser
    var compId = req.query.idComp
    console.log(userId, compId)
    con.query(SQL
        `SELECT * FROM bmc_data where (cons_id = ${userId} && comp_id = ${compId} )  ;`,
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



module.exports = router;