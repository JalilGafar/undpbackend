const express = require('express');
const router = express.Router();
const { con, query, toId, isEmpty } = require('../config/dbhelpers');
const { isManager } = require('../middleware/access');
const { isAdmin } = require('../config/vagues');

// Vagues du programme GYB. verifyToken est appliqué au montage dans app.js.
//  - GET  /        : toute personne connectée. Un manager voit toutes les vagues ; un consultant, celles où il a des entreprises.
//  - POST, PUT, DELETE : administrateur uniquement (un modérateur consulte, il ne gère pas les vagues).
// Une vague « cloturee » verrouille les saisies des consultants sur ses entreprises (voir config/vagues.js).

const STATUTS = ['planifiee', 'en_cours', 'cloturee'];

const COLUMNS = `v.id, v.nom, DATE_FORMAT(v.date_debut, '%Y-%m-%d') AS date_debut, DATE_FORMAT(v.date_fin, '%Y-%m-%d') AS date_fin, v.statut`;

const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// Champs reçus -> { values } (colonnes à écrire) ou { error }. `partial` : seuls les champs présents sont contrôlés (modification).
function readBody(body, partial) {
    const out = {};
    if (!partial || body.nom !== undefined) {
        const nom = isEmpty(body.nom) ? '' : String(body.nom).trim();
        if (!nom || nom.length > 100) return { error: "Le nom de la vague est obligatoire (100 caractères maximum)." };
        out.nom = nom;
    }
    for (const key of ['date_debut', 'date_fin']) {
        if (!partial || body[key] !== undefined) {
            if (isEmpty(body[key])) out[key] = null;
            else if (isDate(body[key])) out[key] = body[key];
            else return { error: "Date invalide (format attendu : AAAA-MM-JJ)." };
        }
    }
    if (!partial || body.statut !== undefined) {
        if (isEmpty(body.statut)) { if (!partial) out.statut = 'planifiee'; }
        else if (STATUTS.includes(body.statut)) out.statut = body.statut;
        else return { error: "Statut invalide." };
    }
    return { values: out };
}

const datesCoherent = v => !(v.date_debut && v.date_fin && v.date_fin < v.date_debut);

const adminOnly = async (req, res) => {
    if (await isAdmin(req.userId)) return true;
    res.status(403).json({ message: "Seul l'administrateur gère les vagues." });
    return false;
};

// ── Liste ───────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
    try {
        const manager = await isManager(req.userId);
        const vagues = await query(con, `
            SELECT ${COLUMNS}, COUNT(e.id) AS nb_entreprises
            FROM vagues v
            LEFT JOIN entreprises e ON e.id_vague = v.id ${manager ? '' : 'AND e.id_consl = ?'}
            GROUP BY v.id
            ${manager ? '' : 'HAVING nb_entreprises > 0'}
            ORDER BY v.date_debut DESC, v.id DESC`, manager ? [] : [req.userId]);
        // Vagues où l'on peut ajouter une entreprise (formulaire de création) : toutes celles qui ne sont pas clôturées
        const ouvertes = await query(con, `SELECT v.id, v.nom, v.statut FROM vagues v WHERE v.statut <> 'cloturee' ORDER BY v.date_debut DESC, v.id DESC`);
        res.status(200).json({
            vagues: vagues.map(v => ({ ...v, nb_entreprises: Number(v.nb_entreprises) })),
            ouvertes,
            // Sélection proposée par défaut : les vagues en cours (liste vide = toutes les vagues)
            defaut: vagues.filter(v => v.statut === 'en_cours').map(v => v.id)
        });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

// ── Création / modification / suppression (administrateur) ──────────────────

router.post('/', async (req, res) => {
    try {
        if (!(await adminOnly(req, res))) return;
        const r = readBody(req.body || {}, false);
        if (r.error) return res.status(400).json({ message: r.error });
        if (!datesCoherent(r.values)) return res.status(400).json({ message: "La date de fin précède la date de début." });
        const result = await query(con, 'INSERT INTO vagues SET ?', [r.values]);
        res.status(201).json({ id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: "Une vague porte déjà ce nom." });
        console.log(err); res.sendStatus(500);
    }
});

router.put('/:id', async (req, res) => {
    try {
        if (!(await adminOnly(req, res))) return;
        const id = toId(req.params.id);
        if (!id) return res.status(400).json({ message: "Paramètres invalides." });
        const [current] = await query(con, `SELECT ${COLUMNS} FROM vagues v WHERE v.id = ?`, [id]);
        if (!current) return res.sendStatus(404);
        const r = readBody(req.body || {}, true);
        if (r.error) return res.status(400).json({ message: r.error });
        if (!Object.keys(r.values).length) return res.status(400).json({ message: "Rien à modifier." });
        if (!datesCoherent({ ...current, ...r.values })) return res.status(400).json({ message: "La date de fin précède la date de début." });
        await query(con, 'UPDATE vagues SET ? WHERE id = ?', [r.values, id]);
        res.status(200).json({ message: "Vague enregistrée." });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: "Une vague porte déjà ce nom." });
        console.log(err); res.sendStatus(500);
    }
});

// Déplace des entreprises vers cette vague : { ids: [entreprises] }. Plus sûr que de renvoyer la fiche complète de chaque entreprise.
router.put('/:id/entreprises', async (req, res) => {
    try {
        if (!(await adminOnly(req, res))) return;
        const id = toId(req.params.id);
        const ids = Array.isArray(req.body && req.body.ids) ? [...new Set(req.body.ids.map(toId).filter(Boolean))] : [];
        if (!id || !ids.length || ids.length > 500) return res.status(400).json({ message: "Paramètres invalides." });
        const [vague] = await query(con, 'SELECT id FROM vagues WHERE id = ?', [id]);
        if (!vague) return res.status(404).json({ message: "Vague introuvable." });
        const result = await query(con, 'UPDATE entreprises SET id_vague = ? WHERE id IN (?)', [id, ids]);
        res.status(200).json({ moved: result.affectedRows });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

router.delete('/:id', async (req, res) => {
    try {
        if (!(await adminOnly(req, res))) return;
        const id = toId(req.params.id);
        if (!id) return res.status(400).json({ message: "Paramètres invalides." });
        const [{ n }] = await query(con, 'SELECT COUNT(*) AS n FROM entreprises WHERE id_vague = ?', [id]);
        if (n > 0) return res.status(409).json({ message: `Cette vague contient ${n} entreprise${n > 1 ? 's' : ''} : déplacez-les d'abord dans une autre vague.` });
        const result = await query(con, 'DELETE FROM vagues WHERE id = ?', [id]);
        if (!result.affectedRows) return res.sendStatus(404);
        res.status(200).json({ message: "Vague supprimée." });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

module.exports = router;
