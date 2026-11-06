const express = require('express');
const router = express.Router();
const { con, query, getConnection, toId, isEmpty } = require('../config/dbhelpers');
const { COMPANY_GUARD_SQL, vagueLock, sendLock } = require('../config/vagues');
const { isManager } = require('../middleware/access');

// Outil 1E_a « Diagnostic BPF » (bonnes pratiques de fabrication). verifyToken est appliqué au montage dans app.js.
//  - GET  : le consultant concerné, ou un admin / moderator (lecture seule).
//  - POST : uniquement le consultant propriétaire de l'entreprise (cons_id du corps = jeton).
// Un seul passage par (consultant, entreprise). 92 exigences en 9 catégories ; chacune reçoit des points entiers de 0 au maximum de
// l'exigence, ou « non applicable » (alors sans points : elle sort du calcul). Les scores ne sont pas enregistrés, le site les calcule.

// Points maximum de chaque exigence, dans l'ordre de l'identifiant interne (1 à 92). Identique à core/model/bpf-content.ts du site :
// toute modification doit être faite aux deux endroits (somme : 666).
const BPF_MAX = [
    10, 15, 10, 15, 15, 10, 10, 5, 5, 5, 5, 5, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
    10, 10, 15, 10, 10, 3, 3, 10, 5, 10, 5, 3, 10, 10, 5, 5, 3, 5, 5, 5, 3, 3, 10,
    10, 10, 5, 5, 5, 5, 5, 10, 5, 15, 10, 10, 10, 5, 5, 10, 5, 3, 5, 10, 5, 10, 5,
    5, 5, 5, 5, 5, 10, 5, 3, 15, 5, 3, 5, 5, 5, 5, 5, 5, 3, 3, 5, 3, 5, 5
];
const ITEM_COUNT = BPF_MAX.length;
const CATEGORY_COUNT = 9;
const MAX_ACTIONS = 10;       // identique à BPF_MAX_ACTIONS du site
const MAX_OBS = 1000;
const MAX_ACTION_TEXT = 1000;
const MAX_LONG_TEXT = 3000;

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
const asBool = (raw, label, errors) => {
    if (isEmpty(raw) || raw === false || raw === 0 || raw === '0' || raw === 'false') return 0;
    if (raw === true || raw === 1 || raw === '1' || raw === 'true') return 1;
    errors.push(`${label} : oui ou non attendu`);
    return 0;
};

// ── Lecture ────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
    try {
        const consId = toId(req.query.idUser);
        const compId = toId(req.query.idComp);
        if (!consId || !compId) return res.status(400).json({ message: "Paramètres invalides." });
        if (consId !== req.userId && !(await isManager(req.userId))) {
            return res.status(403).json({ message: "Accès non autorisé." });
        }

        const [row] = await query(con,
            "SELECT id, DATE_FORMAT(date_evaluation, '%Y-%m-%d') AS date_evaluation, remarques_generales, updated_at " +
            "FROM entreprise_bpf WHERE cons_id = ? AND comp_id = ?", [consId, compId]);
        const items = row
            ? await query(con, 'SELECT item, points, na, observations FROM entreprise_bpf_items WHERE diag_id = ? ORDER BY item', [row.id])
            : [];
        const categories = row
            ? await query(con, 'SELECT cat, conclusions, recommandations FROM entreprise_bpf_categories WHERE diag_id = ? ORDER BY cat', [row.id])
            : [];
        const actions = row
            ? await query(con, 'SELECT action FROM entreprise_bpf_actions WHERE diag_id = ? ORDER BY position, id', [row.id])
            : [];
        const [company] = await query(con, 'SELECT id, name FROM entreprises WHERE id = ?', [compId]);
        const [consultant] = await query(con, 'SELECT username FROM users WHERE id = ?', [consId]);

        res.status(200).json({
            data: row || null,
            items: items.map(i => ({ ...i, na: !!i.na })),
            categories, actions,
            company: company || null,
            consultant: consultant || null
        });
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
});

// ── Enregistrement (upsert) ────────────────────────────────────────────────

router.post('/', async (req, res) => {
    const body = req.body || {};
    const consId = toId(body.cons_id);
    const compId = toId(body.comp_id);
    if (!consId || !compId) return res.status(400).json({ message: "Paramètres invalides." });
    if (consId !== req.userId) return res.status(403).json({ message: "Seul le consultant concerné peut enregistrer cet outil." });

    const errors = [];
    const dateEvaluation = date(body.date_evaluation, 'date_evaluation', errors);
    const remarques = text(body.remarques_generales, MAX_LONG_TEXT, 'remarques_generales', errors);

    // Exigences : points entiers de 0 au maximum de l'exigence, ou non applicable (incompatible avec des points)
    const seen = new Set();
    const items = [];
    (Array.isArray(body.items) ? body.items : []).forEach((e, i) => {
        const label = `items[${i}]`;
        const n = Number(e && e.item);
        if (!Number.isInteger(n) || n < 1 || n > ITEM_COUNT) { errors.push(`${label} : exigence de 1 à ${ITEM_COUNT} attendue`); return; }
        if (seen.has(n)) { errors.push(`${label} : exigence ${n} en double`); return; }
        seen.add(n);
        const na = asBool(e.na, `${label}.na`, errors);
        let points = null;
        if (!isEmpty(e.points)) {
            points = Number(e.points);
            const max = BPF_MAX[n - 1];
            if (!Number.isInteger(points) || points < 0 || points > max) {
                errors.push(`${label}.points : entier de 0 à ${max} attendu`);
                points = null;
            } else if (na) {
                errors.push(`${label} : des points ne peuvent pas accompagner « non applicable »`);
                points = null;
            }
        }
        const obs = text(e.observations, MAX_OBS, `${label}.observations`, errors);
        if (points !== null || na || obs) items.push([n, points, na, obs]);
    });

    // Conclusions et recommandations par catégorie
    const seenCat = new Set();
    const categories = [];
    (Array.isArray(body.categories) ? body.categories : []).forEach((c, i) => {
        const label = `categories[${i}]`;
        const n = Number(c && c.cat);
        if (!Number.isInteger(n) || n < 1 || n > CATEGORY_COUNT) { errors.push(`${label} : catégorie de 1 à ${CATEGORY_COUNT} attendue`); return; }
        if (seenCat.has(n)) { errors.push(`${label} : catégorie ${n} en double`); return; }
        seenCat.add(n);
        const conclusions = text(c.conclusions, MAX_LONG_TEXT, `${label}.conclusions`, errors);
        const recommandations = text(c.recommandations, MAX_LONG_TEXT, `${label}.recommandations`, errors);
        if (conclusions || recommandations) categories.push([n, conclusions, recommandations]);
    });

    // Actions prioritaires : une phrase chacune
    const rawActions = Array.isArray(body.actions) ? body.actions : [];
    if (rawActions.length > MAX_ACTIONS) errors.push(`actions : ${MAX_ACTIONS} lignes maximum`);
    const actions = [];
    rawActions.slice(0, MAX_ACTIONS).forEach((a, i) => {
        const t = text(a && typeof a === 'object' ? a.action : a, MAX_ACTION_TEXT, `actions[${i}]`, errors);
        if (t) actions.push(t);
    });
    if (errors.length) return res.status(400).json({ message: "Données invalides.", errors });

    let c;
    try {
        // L'entreprise doit exister et être suivie par ce consultant
        const [company] = await query(con, COMPANY_GUARD_SQL, [compId]);
        if (!company) return res.status(404).json({ message: "Entreprise introuvable." });
        if (company.id_consl !== req.userId) return res.status(403).json({ message: "Cette entreprise ne vous est pas attribuée." });
        { const lock = vagueLock(company); if (lock) return sendLock(res, lock); }

        c = await getConnection();
        await query(c, 'START TRANSACTION');
        const fields = { date_evaluation: dateEvaluation, remarques_generales: remarques };
        await query(c, 'INSERT INTO entreprise_bpf SET ? ON DUPLICATE KEY UPDATE ?', [{ cons_id: consId, comp_id: compId, ...fields }, fields]);
        const [row] = await query(c, 'SELECT id FROM entreprise_bpf WHERE cons_id = ? AND comp_id = ?', [consId, compId]);
        await query(c, 'DELETE FROM entreprise_bpf_items WHERE diag_id = ?', [row.id]);
        if (items.length) {
            await query(c, 'INSERT INTO entreprise_bpf_items (diag_id, item, points, na, observations) VALUES ?',
                [items.map(e => [row.id, ...e])]);
        }
        await query(c, 'DELETE FROM entreprise_bpf_categories WHERE diag_id = ?', [row.id]);
        if (categories.length) {
            await query(c, 'INSERT INTO entreprise_bpf_categories (diag_id, cat, conclusions, recommandations) VALUES ?',
                [categories.map(e => [row.id, ...e])]);
        }
        await query(c, 'DELETE FROM entreprise_bpf_actions WHERE diag_id = ?', [row.id]);
        if (actions.length) {
            await query(c, 'INSERT INTO entreprise_bpf_actions (diag_id, position, action) VALUES ?', [actions.map((a, i) => [row.id, i, a])]);
        }
        // Un enregistrement qui ne change aucune valeur de la fiche doit tout de même dater la dernière modification
        await query(c, 'UPDATE entreprise_bpf SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
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
