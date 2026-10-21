const express = require('express');
const router = express.Router();
const { con, query, getConnection, toId, isEmpty } = require('../config/dbhelpers');
const fx = require('../config/fx.config');
const { isManager } = require('../middleware/access');

// Outil 1G « Cartographie des clients B2B ». verifyToken est appliqué au montage dans app.js.
//  - GET  : le consultant concerné, ou un admin / moderator (lecture seule).
//  - POST : uniquement le consultant propriétaire de l'entreprise (cons_id du corps = jeton).
// Les montants sont saisis et stockés en FCFA ; fx indique le taux fixe pour l'affichage en USD.

const MAX_LINES = 200;
const MAX_AMOUNT = 1000000000000;

// Champs texte d'une ligne client : longueur maximale
const LINE_TEXT = {
    client: 255, secteur: 255, contact: 255, adresse: 255,
    telephone: 50, email: 255, produits: 255, remarques: 1000
};

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const PHONE_PATTERN = /^[0-9+().\s-]{6,50}$/;

const text = (v, max, label, errors) => {
    if (isEmpty(v)) return null;
    const s = String(v).trim();
    if (s.length > max) { errors.push(`${label} : ${max} caractères maximum`); return null; }
    return s;
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

        // DATE_FORMAT : évite le décalage d'un jour que le fuseau horaire introduit sur un type DATE sérialisé en JSON
        const [carto] = await query(con,
            "SELECT c.id, c.cons_id, c.comp_id, c.date, c.updated_at, DATE_FORMAT(c.date_cartographie, '%Y-%m-%d') AS date_cartographie " +
            "FROM cartographie_clients c WHERE c.cons_id = ? AND c.comp_id = ?", [consId, compId]);
        const lignes = carto
            ? await query(con,
                'SELECT client, secteur, contact, adresse, telephone, email, produits, montant_fcfa, remarques ' +
                'FROM cartographie_clients_lignes WHERE carto_id = ? ORDER BY position, id', [carto.id])
            : [];
        const [company] = await query(con, 'SELECT id, name FROM entreprises WHERE id = ?', [compId]);
        const [consultant] = await query(con, 'SELECT username FROM users WHERE id = ?', [consId]);

        res.status(200).json({ carto: carto || null, lignes, company: company || null, consultant: consultant || null, fx });
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

    let dateCarto = null;
    if (!isEmpty(body.date_cartographie)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(body.date_cartographie)) && !isNaN(Date.parse(body.date_cartographie))) {
            dateCarto = String(body.date_cartographie);
        } else {
            errors.push('date_cartographie : date invalide (AAAA-MM-JJ)');
        }
    }

    const rawLines = Array.isArray(body.lignes) ? body.lignes : [];
    if (rawLines.length > MAX_LINES) errors.push(`lignes : ${MAX_LINES} lignes maximum`);

    const lignes = [];
    rawLines.slice(0, MAX_LINES).forEach((l, i) => {
        const label = `lignes[${i}]`;
        const line = l || {};
        const row = {};
        for (const [name, max] of Object.entries(LINE_TEXT)) row[name] = text(line[name], max, `${label}.${name}`, errors);
        if (row.email && !EMAIL_PATTERN.test(row.email)) errors.push(`${label}.email : adresse e-mail invalide`);
        if (row.telephone && !PHONE_PATTERN.test(row.telephone)) errors.push(`${label}.telephone : numéro de téléphone invalide`);

        let amount = 0;
        if (!isEmpty(line.montant_fcfa)) {
            amount = Number(line.montant_fcfa);
            if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) {
                errors.push(`${label}.montant_fcfa : montant entier positif attendu`);
                amount = 0;
            }
        }
        row.montant_fcfa = amount;

        // Ligne entièrement vide : ignorée. Une ligne qui contient des informations doit avoir un nom de client.
        if (Object.values(row).some(v => v !== null && v !== 0)) {
            if (!row.client) errors.push(`${label}.client : le nom du client est requis`);
            lignes.push(row);
        }
    });

    if (errors.length) return res.status(400).json({ message: "Données invalides.", errors });

    let c;
    try {
        // L'entreprise doit exister et être suivie par ce consultant
        const [company] = await query(con, 'SELECT id_consl FROM entreprises WHERE id = ?', [compId]);
        if (!company) return res.status(404).json({ message: "Entreprise introuvable." });
        if (company.id_consl !== req.userId) return res.status(403).json({ message: "Cette entreprise ne vous est pas attribuée." });

        c = await getConnection();
        await query(c, 'START TRANSACTION');
        await query(c, 'INSERT INTO cartographie_clients SET ? ON DUPLICATE KEY UPDATE ?',
            [{ cons_id: consId, comp_id: compId, date_cartographie: dateCarto }, { date_cartographie: dateCarto }]);
        const [row] = await query(c, 'SELECT id FROM cartographie_clients WHERE cons_id = ? AND comp_id = ?', [consId, compId]);
        await query(c, 'DELETE FROM cartographie_clients_lignes WHERE carto_id = ?', [row.id]);
        if (lignes.length) {
            await query(c,
                'INSERT INTO cartographie_clients_lignes ' +
                '(carto_id, position, client, secteur, contact, adresse, telephone, email, produits, montant_fcfa, remarques) VALUES ?',
                [lignes.map((l, i) => [row.id, i, l.client, l.secteur, l.contact, l.adresse, l.telephone, l.email, l.produits, l.montant_fcfa, l.remarques])]);
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
