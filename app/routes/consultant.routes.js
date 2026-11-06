const express = require('express');
const { authJwt } = require("../middleware");
const router = express.Router();
const controller = require("../controllers/user.controller");
var con = require('./../config/dbcon');
var SQL = require('sql-template-strings');
const { query: dbQuery, toId } = require('../config/dbhelpers');
const { isManager } = require('../middleware/access');
const { vagueIds, vagueParams, COMPANY_GUARD_SQL, vagueLock, sendLock, vagueForNewCompany } = require('../config/vagues');
const { imageUpload, imageJsonUpload, uploadRef, removeUpload, companyPublicDir } = require('../middleware/upload');

// Logo : uploads/companies/<id>/logo-<horodatage>.webp (800 px max, 10 Mo acceptés en entrée)
const logoResize = { width: 800, height: 800, fit: 'inside' };
const logoUpload = imageUpload('logo', () => 'logo', req => companyPublicDir(req.params.id), logoResize);
const logoJsonUpload = imageJsonUpload(() => 'logo', req => companyPublicDir(req.params.id), logoResize);


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


// Entreprises visibles : un manager voit toutes les entreprises, un consultant uniquement les siennes.
// ?vagues=2,3 limite l'affichage à ces vagues (absent ou « all » = toutes) : la vague est un filtre d'affichage, elle n'ouvre aucun droit.
async function listCompanies(req, res, ownerId) {
    try {
        const where = [], params = [];
        if (ownerId) { where.push('e.id_consl = ?'); params.push(ownerId); }
        const ids = vagueIds(req);
        if (ids) { where.push('e.id_vague IN (?)'); params.push(ids); }
        const rows = await dbQuery(con,
            `SELECT e.*, v.nom AS vague_nom, v.statut AS vague_statut
             FROM entreprises e LEFT JOIN vagues v ON v.id = e.id_vague
             ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
             ORDER BY e.id`, params);
        res.status(200).json(rows);
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
}

router.get("/companies", async (req, res) => {
    try {
        const manager = await isManager(req.userId);
        await listCompanies(req, res, manager ? null : req.userId);
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

router.get("/companiesUser", async (req, res) => {
    try {
        // Un consultant ne consulte que ses propres entreprises, quel que soit l'identifiant demandé
        const manager = await isManager(req.userId);
        await listCompanies(req, res, manager ? (toId(req.query.idUser) || req.userId) : req.userId);
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

// ── Détail entreprise (consultant) ────────────────────────────────────────────

router.get("/company/:id", [authJwt.verifyToken], async (req, res) => {
    try {
        const id = toId(req.params.id);
        if (!id) return res.status(400).json({ message: "Paramètres invalides." });
        const [company] = await dbQuery(con,
            `SELECT e.*, e.id_consl AS idUser, u.username AS consultant, v.nom AS vague_nom, v.statut AS vague_statut
             FROM entreprises e LEFT JOIN vagues v ON v.id = e.id_vague LEFT JOIN users u ON u.id = e.id_consl WHERE e.id = ?`, [id]);
        if (!company) return res.sendStatus(404);
        if (company.id_consl !== req.userId && !(await isManager(req.userId))) {
            return res.status(403).json({ message: "Cette entreprise ne vous est pas attribuée." });
        }
        res.status(200).json(company);
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

// ── Tableau de bord d'une entreprise (consultant) : outils remplis et minutes de réunion ──────
// Réservé au consultant à qui l'entreprise est attribuée. Chaque outil rempli renvoie sa date de dernière modification.
router.get("/company/:id/dashboard", [authJwt.verifyToken], async (req, res) => {
    try {
        const compId = toId(req.params.id);
        if (!compId) return res.status(400).json({ message: "Paramètres invalides." });
        const [company] = await dbQuery(con, 'SELECT id_consl FROM entreprises WHERE id = ?', [compId]);
        if (!company) return res.sendStatus(404);
        if (company.id_consl !== req.userId) return res.status(403).json({ message: "Cette entreprise ne vous est pas attribuée." });

        const uid = req.userId;
        const last = async sql => (await dbQuery(con, sql, [uid, compId]))[0].last;
        const tools = {};
        const sources = {
            attribut: 'SELECT MAX(updated_at) AS last FROM mat_predia_crev_note WHERE cons_id = ? AND comp_id = ?',
            t1d: 'SELECT MAX(updated_at) AS last FROM matrice_diag_integral_note WHERE cons_id = ? AND comp_id = ?',
            t1l: 'SELECT MAX(updated_at) AS last FROM entreprise_profil WHERE cons_id = ? AND comp_id = ?',
            t1g: 'SELECT MAX(updated_at) AS last FROM cartographie_clients WHERE cons_id = ? AND comp_id = ?',
            t3h: 'SELECT MAX(updated_at) AS last FROM entreprise_finance WHERE cons_id = ? AND comp_id = ?',
            t5s: "SELECT MAX(updated_at) AS last FROM entreprise_5s WHERE cons_id = ? AND comp_id = ? AND phase = 'initial'",
            t5sf: "SELECT MAX(updated_at) AS last FROM entreprise_5s WHERE cons_id = ? AND comp_id = ? AND phase = 'final'",
            tse: "SELECT MAX(updated_at) AS last FROM entreprise_suivi WHERE cons_id = ? AND comp_id = ? AND phase = 'initial'",
            tsef: "SELECT MAX(updated_at) AS last FROM entreprise_suivi WHERE cons_id = ? AND comp_id = ? AND phase = 'final'",
            tqw1: "SELECT MAX(updated_at) AS last FROM entreprise_quickwins WHERE cons_id = ? AND comp_id = ? AND etape = 1",
            tqw2: "SELECT MAX(updated_at) AS last FROM entreprise_quickwins WHERE cons_id = ? AND comp_id = ? AND etape = 2",
            tqw3: "SELECT MAX(updated_at) AS last FROM entreprise_quickwins WHERE cons_id = ? AND comp_id = ? AND etape = 3",
            tqw4: "SELECT MAX(updated_at) AS last FROM entreprise_quickwins WHERE cons_id = ? AND comp_id = ? AND etape = 4",
            t1k: 'SELECT MAX(updated_at) AS last FROM entreprise_image_com WHERE cons_id = ? AND comp_id = ?',
            t1ea: 'SELECT MAX(updated_at) AS last FROM entreprise_bpf WHERE cons_id = ? AND comp_id = ?',
            t1j: 'SELECT MAX(updated_at) AS last FROM entreprise_productivite WHERE cons_id = ? AND comp_id = ?',
            t2d: 'SELECT IF(COUNT(*) > 0, COALESCE(MAX(updatedAt), MAX(createdAt), NOW()), NULL) AS last FROM bmc_data WHERE cons_id = ? AND comp_id = ?',
        };
        for (const [code, sql] of Object.entries(sources)) {
            const l = await last(sql);
            if (l) tools[code] = { updated_at: l };
        }
        // Photos (1H) : propres à l'entreprise, pas au consultant
        const [img] = await dbQuery(con, 'SELECT MAX(created_at) AS last FROM entreprise_images WHERE comp_id = ?', [compId]);
        if (img.last) tools.t1h = { updated_at: img.last };

        const minutes = await dbQuery(con,
            "SELECT id, etape, DATE_FORMAT(date_reunion, '%Y-%m-%d') AS date_reunion, updated_at FROM tool_minutes WHERE cons_id = ? AND comp_id = ? ORDER BY date_reunion DESC, id DESC",
            [uid, compId]);
        res.status(200).json({ tools, minutes });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

// ── Mise à jour entreprise (consultant — limité à ses propres entreprises) ────

router.put("/company/:id", [authJwt.verifyToken], async (req, res) => {
    const id = req.params.id;
    const userId = req.userId;
    const c = req.body;
    try {
        const [company] = await dbQuery(con, COMPANY_GUARD_SQL, [toId(id)]);
        const lock = company && company.id_consl === userId ? vagueLock(company) : null;
        if (lock) return sendLock(res, lock);
    } catch (err) {
        console.log(err); return res.sendStatus(500);
    }
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
        WHERE id = ${id} AND id_consl = ${userId}
    `, function (err, result) {
        if (err) { console.log(err); res.sendStatus(500); return; }
        if (result.affectedRows === 0) {
            res.status(403).json({ message: "Action non autorisée ou entreprise introuvable." });
            return;
        }
        res.status(200).json(result);
    });
});

// ── Logo entreprise (consultant — limité à ses propres entreprises) ──────────
// Le fichier est stocké dans /uploads, la colonne entreprises.logo reçoit "uploads/<fichier>"

// Enregistre le logo déjà traité par logoUpload / logoJsonUpload (req.file) et supprime l'ancien
function setCompanyLogo(req, res) {
    const id = req.params.id;
    const logo = uploadRef(req.file);
    con.query(SQL`SELECT e.logo, v.nom AS vague_nom, v.statut AS vague_statut FROM entreprises e LEFT JOIN vagues v ON v.id = e.id_vague WHERE e.id = ${id} AND e.id_consl = ${req.userId}`, function (err, rows) {
        if (err || rows.length === 0) {
            removeUpload(logo);
            if (err) { console.log(err); res.sendStatus(500); return; }
            res.status(403).json({ message: "Action non autorisée ou entreprise introuvable." });
            return;
        }
        const lock = vagueLock(rows[0]);
        if (lock) { removeUpload(logo); return sendLock(res, lock); }
        const previous = rows[0].logo;
        con.query(SQL`UPDATE entreprises SET logo = ${logo} WHERE id = ${id} AND id_consl = ${req.userId}`, function (err2) {
            if (err2) {
                removeUpload(logo);
                console.log(err2); res.sendStatus(500); return;
            }
            removeUpload(previous);
            res.status(200).json({ logo });
        });
    });
}

router.post("/company/:id/logo", [authJwt.verifyToken, logoUpload], setCompanyLogo);
// Même chose avec l'image en JSON (la couche d'entrée de l'hébergeur refuse le multipart)
router.post("/company/:id/logo-json", [authJwt.verifyToken, logoJsonUpload], setCompanyLogo);

// Outils déjà remplis, par entreprise du consultant connecté (un outil compte une fois, quel que soit son nombre de lignes)
router.get("/livrables-summary", (req, res) => {
    const uid = req.userId;
    const w = vagueParams(req);
    con.query(SQL`
        SELECT e.id AS comp_id, t.tool_code
        FROM entreprises e
        JOIN (
            SELECT comp_id, 'attribut' AS tool_code FROM mat_predia_crev_note WHERE cons_id = ${uid}
            UNION SELECT comp_id, 't1d' FROM matrice_diag_integral_note WHERE cons_id = ${uid}
            UNION SELECT comp_id, 't1l' FROM entreprise_profil WHERE cons_id = ${uid}
            UNION SELECT comp_id, 't1g' FROM cartographie_clients WHERE cons_id = ${uid}
            UNION SELECT comp_id, 't2d' FROM bmc_data WHERE cons_id = ${uid}
            UNION SELECT comp_id, 't1j' FROM entreprise_productivite WHERE cons_id = ${uid}
            UNION SELECT comp_id, 't1k' FROM entreprise_image_com WHERE cons_id = ${uid}
            UNION SELECT comp_id, 't1ea' FROM entreprise_bpf WHERE cons_id = ${uid}
            UNION SELECT comp_id, 't3h' FROM entreprise_finance WHERE cons_id = ${uid}
            UNION SELECT comp_id, 't5s' FROM entreprise_5s WHERE cons_id = ${uid} AND phase = 'initial'
            UNION SELECT comp_id, 't5sf' FROM entreprise_5s WHERE cons_id = ${uid} AND phase = 'final'
            UNION SELECT comp_id, 'tqw1' FROM entreprise_quickwins WHERE cons_id = ${uid} AND etape = 1
            UNION SELECT comp_id, 'tqw2' FROM entreprise_quickwins WHERE cons_id = ${uid} AND etape = 2
            UNION SELECT comp_id, 'tqw3' FROM entreprise_quickwins WHERE cons_id = ${uid} AND etape = 3
            UNION SELECT comp_id, 'tqw4' FROM entreprise_quickwins WHERE cons_id = ${uid} AND etape = 4
            UNION SELECT comp_id, 'tse' FROM entreprise_suivi WHERE cons_id = ${uid} AND phase = 'initial'
            UNION SELECT comp_id, 'tsef' FROM entreprise_suivi WHERE cons_id = ${uid} AND phase = 'final'
            UNION SELECT comp_id, 't1h' FROM entreprise_images
        ) t ON t.comp_id = e.id
        WHERE e.id_consl = ${uid} AND (${w.all} = 1 OR e.id_vague IN (${w.ids}))
        GROUP BY e.id, t.tool_code`,
        function (err, rows) {
            if (err) { console.log(err); res.sendStatus(500); return; }
            const companies = {};
            rows.forEach(r => { (companies[r.comp_id] = companies[r.comp_id] || []).push(r.tool_code); });
            // Chaque minute de réunion (1B) est un livrable : une entrée « t1b » par minute
            con.query(SQL`SELECT m.comp_id, COUNT(*) AS n FROM tool_minutes m JOIN entreprises e ON e.id = m.comp_id
                          WHERE m.cons_id = ${uid} AND e.id_consl = ${uid} AND (${w.all} = 1 OR e.id_vague IN (${w.ids})) GROUP BY m.comp_id`, function (err2, minutes) {
                if (err2) { console.log(err2); res.sendStatus(500); return; }
                minutes.forEach(m => { for (let i = 0; i < m.n; i++) (companies[m.comp_id] = companies[m.comp_id] || []).push('t1b'); });
                res.status(200).json({ companies });
            });
        });
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
                    console.log('record of Company done');
                }
            );
});

module.exports = router;