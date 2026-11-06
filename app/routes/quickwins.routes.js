const express = require('express');
const router = express.Router();
const { con, query, getConnection, toId, isEmpty } = require('../config/dbhelpers');
const { COMPANY_GUARD_SQL, vagueLock, sendLock } = require('../config/vagues');
const { isManager } = require('../middleware/access');

// Outil transversal « Registre des Quick Wins » : un registre par (consultant, entreprise, étape de 1 à 4). verifyToken est appliqué au montage dans app.js.
//  - Lecture : le consultant concerné, ou un admin / moderator (lecture seule).
//  - Écriture : uniquement le consultant propriétaire de l'entreprise (cons_id du corps = jeton).
// Chaque action d'amélioration a un statut (a_faire → en_cours → termine), un responsable, une échéance et un indicateur (valeur avant / après).

const STATUTS = ['a_faire', 'en_cours', 'termine'];
const MAX_ACTIONS = 60;
const MAX_TEXT = 1000;
const MAX_DOCS = 3000;

const etapeOf = v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null; };

const text = (v, max, label, errors) => {
    if (isEmpty(v)) return null;
    const s = String(v).trim();
    if (s.length > max) { errors.push(`${label} : ${max} caractères maximum`); return null; }
    return s || null;
};
const date = (v, label, errors) => {
    if (isEmpty(v)) return null;
    const s = String(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) { errors.push(`${label} : date invalide (AAAA-MM-JJ)`); return null; }
    return s;
};

// ── Lecture ────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
    try {
        const consId = toId(req.query.idUser);
        const compId = toId(req.query.idComp);
        const etape = etapeOf(req.query.etape);
        if (!consId || !compId || !etape) return res.status(400).json({ message: "Paramètres invalides." });
        if (consId !== req.userId && !(await isManager(req.userId))) {
            return res.status(403).json({ message: "Accès non autorisé." });
        }

        const [row] = await query(con,
            "SELECT id, DATE_FORMAT(date_debut, '%Y-%m-%d') AS date_debut, docs_crees, docs_partages, updated_at " +
            "FROM entreprise_quickwins WHERE cons_id = ? AND comp_id = ? AND etape = ?", [consId, compId, etape]);
        const actions = row
            ? await query(con,
                "SELECT action, domaine, responsable, DATE_FORMAT(echeance, '%Y-%m-%d') AS echeance, statut, indicateur, valeur_avant, valeur_apres, commentaires " +
                "FROM entreprise_quickwins_actions WHERE registre_id = ? ORDER BY position, id", [row.id])
            : [];
        const [company] = await query(con, 'SELECT id, name FROM entreprises WHERE id = ?', [compId]);
        const [consultant] = await query(con, 'SELECT username FROM users WHERE id = ?', [consId]);

        res.status(200).json({
            etape,
            data: row || null,
            actions,
            company: company || null,
            consultant: consultant || null
        });
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
});

// ── Enregistrement (upsert du registre et remplacement de ses actions) ─────

router.post('/', async (req, res) => {
    const body = req.body || {};
    const consId = toId(body.cons_id);
    const compId = toId(body.comp_id);
    const etape = etapeOf(body.etape);
    if (!consId || !compId || !etape) return res.status(400).json({ message: "Paramètres invalides." });
    if (consId !== req.userId) return res.status(403).json({ message: "Seul le consultant concerné peut enregistrer cet outil." });

    const errors = [];
    const dateDebut = date(body.date_debut, 'date_debut', errors);
    const docsCrees = text(body.docs_crees, MAX_DOCS, 'docs_crees', errors);
    const docsPartages = text(body.docs_partages, MAX_DOCS, 'docs_partages', errors);

    const rawActions = Array.isArray(body.actions) ? body.actions : [];
    if (rawActions.length > MAX_ACTIONS) errors.push(`actions : ${MAX_ACTIONS} lignes maximum`);
    const actions = [];
    rawActions.slice(0, MAX_ACTIONS).forEach((a, i) => {
        const label = `actions[${i}]`;
        const action = text(a && a.action, MAX_TEXT, `${label}.action`, errors);
        const domaine = text(a && a.domaine, 100, `${label}.domaine`, errors);
        const responsable = text(a && a.responsable, 255, `${label}.responsable`, errors);
        const echeance = date(a && a.echeance, `${label}.echeance`, errors);
        const indicateur = text(a && a.indicateur, 255, `${label}.indicateur`, errors);
        const avant = text(a && a.valeur_avant, 100, `${label}.valeur_avant`, errors);
        const apres = text(a && a.valeur_apres, 100, `${label}.valeur_apres`, errors);
        const commentaires = text(a && a.commentaires, MAX_TEXT, `${label}.commentaires`, errors);
        let statut = isEmpty(a && a.statut) ? 'a_faire' : a.statut;
        if (!STATUTS.includes(statut)) { errors.push(`${label}.statut : valeur non autorisée`); statut = 'a_faire'; }
        // Une ligne vide (statut par défaut compris) n'est pas enregistrée
        if (action || domaine || responsable || echeance || indicateur || avant || apres || commentaires || statut !== 'a_faire') {
            actions.push([action, domaine, responsable, echeance, statut, indicateur, avant, apres, commentaires]);
        }
    });
    if (errors.length) return res.status(400).json({ message: "Données invalides.", errors });

    let c;
    try {
        const [company] = await query(con, COMPANY_GUARD_SQL, [compId]);
        if (!company) return res.status(404).json({ message: "Entreprise introuvable." });
        if (company.id_consl !== req.userId) return res.status(403).json({ message: "Cette entreprise ne vous est pas attribuée." });
        { const lock = vagueLock(company); if (lock) return sendLock(res, lock); }

        c = await getConnection();
        await query(c, 'START TRANSACTION');
        const fields = { date_debut: dateDebut, docs_crees: docsCrees, docs_partages: docsPartages };
        await query(c, 'INSERT INTO entreprise_quickwins SET ? ON DUPLICATE KEY UPDATE ?', [{ cons_id: consId, comp_id: compId, etape, ...fields }, fields]);
        const [row] = await query(c, 'SELECT id FROM entreprise_quickwins WHERE cons_id = ? AND comp_id = ? AND etape = ?', [consId, compId, etape]);
        await query(c, 'DELETE FROM entreprise_quickwins_actions WHERE registre_id = ?', [row.id]);
        if (actions.length) {
            await query(c,
                'INSERT INTO entreprise_quickwins_actions (registre_id, position, action, domaine, responsable, echeance, statut, indicateur, valeur_avant, valeur_apres, commentaires) VALUES ?',
                [actions.map((a, i) => [row.id, i, ...a])]);
        }
        await query(c, 'COMMIT');
        res.status(200).json({ id: row.id });
    } catch (err) {
        if (c) await query(c, 'ROLLBACK').catch(() => {});
        console.log(err);
        res.sendStatus(500);
    } finally {
        if (c) c.release();
    }
});

module.exports = router;
