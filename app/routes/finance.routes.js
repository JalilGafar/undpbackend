const express = require('express');
const router = express.Router();
const { con, query, getConnection, toId, isEmpty } = require('../config/dbhelpers');
const { COMPANY_GUARD_SQL, vagueLock, sendLock } = require('../config/vagues');
const fx = require('../config/fx.config');
const { isManager } = require('../middleware/access');

// Outil « Analyse financière » (3H). verifyToken est appliqué au montage dans app.js.
//  - GET  : le consultant concerné, ou un admin / moderator (lecture seule).
//  - POST : uniquement le consultant propriétaire de l'entreprise (cons_id du corps = jeton).
// Montants saisis et stockés en FCFA (entiers) ; fx indique le taux fixe pour l'affichage en USD.
// Le compte de résultat est calculé par le frontend à partir des lignes enregistrées.

const SECTIONS = ['ventes', 'autres_revenus', 'materiaux', 'main_oeuvre', 'frais_vente', 'frais_admin', 'financier'];
const MONTHS = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10', 'm11', 'm12'];
const MAX_LINES = 400;
const MAX_AMOUNT = 1000000000000;
const CODE_PATTERN = /^[a-z0-9_]{1,40}$/;

// ── Lecture ────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
    try {
        const consId = toId(req.query.idUser);
        const compId = toId(req.query.idComp);
        if (!consId || !compId) return res.status(400).json({ message: "Paramètres invalides." });
        if (consId !== req.userId && !(await isManager(req.userId))) {
            return res.status(403).json({ message: "Accès non autorisé." });
        }

        const [data] = await query(con, 'SELECT id, annee, taux_impot, updated_at FROM entreprise_finance WHERE cons_id = ? AND comp_id = ?', [consId, compId]);
        const rows = data
            ? await query(con, `SELECT section, code, libelle, ${MONTHS.join(', ')} FROM entreprise_finance_lignes WHERE finance_id = ? ORDER BY section, position, id`, [data.id])
            : [];
        const [company] = await query(con, 'SELECT id, name FROM entreprises WHERE id = ?', [compId]);
        const [consultant] = await query(con, 'SELECT username FROM users WHERE id = ?', [consId]);

        res.status(200).json({
            data: data ? { annee: data.annee, taux_impot: data.taux_impot === null ? null : Number(data.taux_impot), updated_at: data.updated_at } : null,
            // m : les 12 montants du poste, de janvier à décembre (nombres, BIGINT peut arriver en texte)
            lignes: rows.map(r => ({ section: r.section, code: r.code, libelle: r.libelle, m: MONTHS.map(k => Number(r[k]) || 0) })),
            company: company || null,
            consultant: consultant || null,
            fx
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

    let annee = null;
    if (!isEmpty(body.annee)) {
        annee = Number(body.annee);
        if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) { errors.push("annee : année entre 2000 et 2100 attendue"); annee = null; }
    }
    let taux = null;
    if (!isEmpty(body.taux_impot)) {
        taux = Number(body.taux_impot);
        if (!Number.isFinite(taux) || taux < 0 || taux > 100) { errors.push("taux_impot : pourcentage entre 0 et 100 attendu"); taux = null; }
        else taux = Math.round(taux * 100) / 100;
    }

    const lignes = [];
    const raw = Array.isArray(body.lignes) ? body.lignes : [];
    if (raw.length > MAX_LINES) errors.push(`lignes : ${MAX_LINES} lignes maximum`);
    const positions = {};
    raw.slice(0, MAX_LINES).forEach((l, i) => {
        const label = `lignes[${i}]`;
        if (!l || !SECTIONS.includes(l.section)) { errors.push(`${label}.section : valeur non autorisée`); return; }
        const code = isEmpty(l.code) ? null : String(l.code);
        if (code !== null && !CODE_PATTERN.test(code)) { errors.push(`${label}.code : identifiant invalide`); return; }
        let libelle = isEmpty(l.libelle) ? null : String(l.libelle).trim();
        if (libelle && libelle.length > 255) { errors.push(`${label}.libelle : 255 caractères maximum`); return; }
        const m = Array.isArray(l.m) ? l.m : [];
        const amounts = [];
        for (let k = 0; k < 12; k++) {
            const v = isEmpty(m[k]) ? 0 : Number(m[k]);
            if (!Number.isInteger(v) || v < 0 || v > MAX_AMOUNT) { errors.push(`${label}.m[${k}] : montant entier positif attendu`); return; }
            amounts.push(v);
        }
        // Une ligne vide (ni nom saisi, ni montant) n'est pas enregistrée
        if (!libelle && amounts.every(v => v === 0)) return;
        positions[l.section] = (positions[l.section] ?? -1) + 1;
        lignes.push([l.section, positions[l.section], code, libelle, ...amounts]);
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
        const fields = { annee, taux_impot: taux };
        await query(c, 'INSERT INTO entreprise_finance SET ? ON DUPLICATE KEY UPDATE ?', [{ cons_id: consId, comp_id: compId, ...fields }, fields]);
        const [row] = await query(c, 'SELECT id FROM entreprise_finance WHERE cons_id = ? AND comp_id = ?', [consId, compId]);
        await query(c, 'DELETE FROM entreprise_finance_lignes WHERE finance_id = ?', [row.id]);
        if (lignes.length) {
            await query(c, `INSERT INTO entreprise_finance_lignes (finance_id, section, position, code, libelle, ${MONTHS.join(', ')}) VALUES ?`,
                [lignes.map(l => [row.id, ...l])]);
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
