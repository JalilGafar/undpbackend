const express = require('express');
const router = express.Router();
const { con, query, getConnection, toId, isEmpty } = require('../config/dbhelpers');
const { COMPANY_GUARD_SQL, vagueLock, sendLock } = require('../config/vagues');
const { isManager } = require('../middleware/access');

// Outil 1K « Diagnostic d'image commerciale ». verifyToken est appliqué au montage dans app.js.
//  - GET  : le consultant concerné, ou un admin / moderator (lecture seule).
//  - POST : uniquement le consultant propriétaire de l'entreprise (cons_id du corps = jeton).
// 11 éléments fixes (1 à 11) ; chacun : existe (oui / non / partiellement), situation actuelle, besoin d'accompagnement, observations.

const ELEMENT_COUNT = 11;
const EXISTE = ['oui', 'non', 'partiellement'];
const SITUATION = ['bonne', 'moyenne', 'mediocre', 'non_applicable'];   // doit rester identique à l'ENUM de entreprise_image_com_elements.situation
const MAX_OBS = 1000;
const MAX_REMARQUES = 3000;

const asBool = (raw, label, errors) => {
    if (isEmpty(raw)) return null;
    if (raw === true || raw === 1 || raw === '1' || raw === 'true') return 1;
    if (raw === false || raw === 0 || raw === '0' || raw === 'false') return 0;
    errors.push(`${label} : oui ou non attendu`);
    return null;
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

        const [data] = await query(con, 'SELECT id, remarques_generales, updated_at FROM entreprise_image_com WHERE cons_id = ? AND comp_id = ?', [consId, compId]);
        const elements = data
            ? await query(con, 'SELECT element, existe, situation, besoin, observations FROM entreprise_image_com_elements WHERE diag_id = ? ORDER BY element', [data.id])
            : [];
        const [company] = await query(con, 'SELECT id, name FROM entreprises WHERE id = ?', [compId]);
        const [consultant] = await query(con, 'SELECT username FROM users WHERE id = ?', [consId]);

        res.status(200).json({
            data: data || null,
            elements: elements.map(e => ({ ...e, besoin: e.besoin === null ? null : !!e.besoin })),
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
    let remarques = isEmpty(body.remarques_generales) ? null : String(body.remarques_generales).trim();
    if (remarques && remarques.length > MAX_REMARQUES) { errors.push(`remarques_generales : ${MAX_REMARQUES} caractères maximum`); remarques = null; }

    const rawElements = Array.isArray(body.elements) ? body.elements : [];
    const seen = new Set();
    const elements = [];
    rawElements.forEach((e, i) => {
        const label = `elements[${i}]`;
        const n = Number(e && e.element);
        if (!Number.isInteger(n) || n < 1 || n > ELEMENT_COUNT) { errors.push(`${label} : élément de 1 à ${ELEMENT_COUNT} attendu`); return; }
        if (seen.has(n)) { errors.push(`${label} : élément ${n} en double`); return; }
        seen.add(n);
        const existe = isEmpty(e.existe) ? null : e.existe;
        const situation = isEmpty(e.situation) ? null : e.situation;
        if (existe !== null && !EXISTE.includes(existe)) errors.push(`${label}.existe : valeur non autorisée`);
        if (situation !== null && !SITUATION.includes(situation)) errors.push(`${label}.situation : valeur non autorisée`);
        const besoin = asBool(e.besoin, `${label}.besoin`, errors);
        const obs = isEmpty(e.observations) ? null : String(e.observations).trim();
        if (obs && obs.length > MAX_OBS) errors.push(`${label}.observations : ${MAX_OBS} caractères maximum`);
        if (existe !== null || situation !== null || besoin !== null || obs) elements.push([n, existe, situation, besoin, obs]);
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
        await query(c, 'INSERT INTO entreprise_image_com SET ? ON DUPLICATE KEY UPDATE ?',
            [{ cons_id: consId, comp_id: compId, remarques_generales: remarques }, { remarques_generales: remarques }]);
        const [row] = await query(c, 'SELECT id FROM entreprise_image_com WHERE cons_id = ? AND comp_id = ?', [consId, compId]);
        await query(c, 'DELETE FROM entreprise_image_com_elements WHERE diag_id = ?', [row.id]);
        if (elements.length) {
            await query(c, 'INSERT INTO entreprise_image_com_elements (diag_id, element, existe, situation, besoin, observations) VALUES ?',
                [elements.map(e => [row.id, ...e])]);
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
