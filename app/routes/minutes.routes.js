const express = require('express');
const router = express.Router();
const { con, query, getConnection, toId, isEmpty } = require('../config/dbhelpers');
const { COMPANY_GUARD_SQL, vagueLock, sendLock } = require('../config/vagues');
const { isManager } = require('../middleware/access');

// Outil 1B « Minutes de réunion ». verifyToken est appliqué au montage dans app.js.
//  - Lecture : le consultant concerné, ou un admin / moderator (lecture seule).
//  - Écriture (création, modification, suppression) : uniquement le consultant propriétaire de l'entreprise.
// Une minute appartient à (cons_id, comp_id) ; chaque minute est un livrable.
// Signatures : tracées au doigt sur l'écran (image PNG en data URL), une par participant + une du consultant.
// Le contenu d'une minute reste modifiable à tout moment (les comptes rendus sont souvent rédigés après la réunion) : les signatures ne sont jamais effacées.

const MAX_MINUTES_PER_COMPANY = 300;
const MAX_PRESENTS = 50;
const MAX_ENGAGEMENTS = 30;
const MAX_TEXT = 5000;
const MAX_SIGNATURE_CHARS = 200000;   // ~150 Ko d'image : une signature tracée en fait quelques Ko
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_SQL = "DATE_FORMAT(m.date_reunion, '%Y-%m-%d') AS date_reunion";

// ── Validation ─────────────────────────────────────────────────────────────

function text(value, max, label, errors) {
    if (isEmpty(value)) return null;
    const v = String(value).trim();
    if (v.length > max) { errors.push(`${label} : ${max} caractères maximum`); return null; }
    return v;
}

// Une signature valide est une image PNG en data URL de taille raisonnable ; vide = pas de signature
function signature(value, label, errors) {
    if (isEmpty(value)) return null;
    const v = String(value);
    if (v.length > MAX_SIGNATURE_CHARS || !PNG_DATA_URL.test(v)
        || !Buffer.from(v.slice(v.indexOf(',') + 1), 'base64').subarray(0, 4).equals(PNG_MAGIC)) {
        errors.push(`${label} : signature invalide`);
        return null;
    }
    return v;
}

function isoDate(value, label, errors) {
    if (isEmpty(value)) return null;
    const v = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) { errors.push(`${label} : date invalide`); return null; }
    return v;
}

function hour(value, label, errors) {
    if (isEmpty(value)) return null;
    const v = String(value).slice(0, 5);
    if (!TIME_PATTERN.test(v)) { errors.push(`${label} : heure invalide`); return null; }
    return v;
}

function cleanMinute(body, errors) {
    const etape = Number(body.etape);
    if (!Number.isInteger(etape) || etape < 1 || etape > 4) errors.push("etape : valeur de 1 à 4 attendue");

    const date = String(body.date_reunion || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) errors.push("date_reunion : date invalide");

    const values = {
        etape,
        numero: isEmpty(body.numero) ? null : Number(body.numero),
        date_reunion: date,
        heure_debut: hour(body.heure_debut, 'heure_debut', errors),
        heure_fin: hour(body.heure_fin, 'heure_fin', errors),
        lieu: text(body.lieu, 255, 'lieu', errors),
        objectif: text(body.objectif, 500, 'sujet principal', errors),
        ordre_jour: text(body.ordre_jour, MAX_TEXT, 'ordre_jour', errors),
        discussion: text(body.discussion, MAX_TEXT, 'discussion', errors),
        resultats: text(body.resultats, MAX_TEXT, 'resultats', errors),
        remarques: text(body.remarques, MAX_TEXT, 'remarques', errors)
    };
    if (!values.objectif) errors.push("objectif : requis");
    if (values.numero !== null && (!Number.isInteger(values.numero) || values.numero < 1 || values.numero > 9999)) errors.push("numero : entier de 1 à 9999 attendu");
    if (values.heure_debut && values.heure_fin && values.heure_fin < values.heure_debut) errors.push("heure_fin : antérieure à l'heure de début");

    const rawPresents = Array.isArray(body.presents) ? body.presents : [];
    if (rawPresents.length > MAX_PRESENTS) errors.push(`presents : ${MAX_PRESENTS} personnes maximum`);
    const presents = [];
    rawPresents.slice(0, MAX_PRESENTS).forEach((p, i) => {
        const nom = text(p && p.nom, 255, `presents[${i}].nom`, errors);
        const poste = text(p && p.poste, 255, `presents[${i}].poste`, errors);
        const sig = signature(p && p.signature, `presents[${i}]`, errors);
        if (nom) presents.push({ nom, poste, signature: sig });
    });

    const rawEngagements = Array.isArray(body.engagements) ? body.engagements : [];
    if (rawEngagements.length > MAX_ENGAGEMENTS) errors.push(`engagements : ${MAX_ENGAGEMENTS} lignes maximum`);
    const engagements = [];
    rawEngagements.slice(0, MAX_ENGAGEMENTS).forEach((e, i) => {
        const tache = text(e && e.tache, 1000, `engagements[${i}].tache`, errors);
        const responsable = text(e && e.responsable, 255, `engagements[${i}].responsable`, errors);
        const echeance = isoDate(e && e.echeance, `engagements[${i}].echeance`, errors);
        if (tache || responsable || echeance) engagements.push({ tache, responsable, echeance });
    });
    const consultantSignature = signature(body.consultant_signature, 'consultant_signature', errors);
    return { values, presents, engagements, consultantSignature };
}

// ── Accès ──────────────────────────────────────────────────────────────────

// Charge une minute et vérifie les droits : { minute, canWrite } ou { status } en cas d'échec
async function loadForUser(id, userId) {
    const [minute] = await query(con, `SELECT m.*, ${DATE_SQL} FROM tool_minutes m WHERE m.id = ?`, [id]);
    if (!minute) return { status: 404 };
    const manager = await isManager(userId);
    if (!manager && minute.cons_id !== userId) return { status: 403 };
    const [company] = await query(con, COMPANY_GUARD_SQL, [minute.comp_id]);
    return { minute, canWrite: minute.cons_id === userId && !!company && company.id_consl === userId, lock: vagueLock(company) };
}

// ── Liste (un consultant, une entreprise) ───────────────────────────────────

router.get('/', async (req, res) => {
    try {
        const consId = toId(req.query.idUser);
        const compId = toId(req.query.idComp);
        if (!consId || !compId) return res.status(400).json({ message: "Paramètres invalides." });
        if (consId !== req.userId && !(await isManager(req.userId))) return res.status(403).json({ message: "Accès non autorisé." });

        const minutes = await query(con, `
            SELECT m.id, m.etape, m.numero, ${DATE_SQL}, m.lieu, m.objectif, m.updated_at,
                   (SELECT COUNT(*) FROM tool_minutes_presents p WHERE p.minute_id = m.id) AS nb_presents,
                   (SELECT COUNT(*) FROM tool_minutes_presents p WHERE p.minute_id = m.id AND p.signature IS NULL) AS nb_unsigned,
                   (m.consultant_signature IS NOT NULL) AS consultant_signed
            FROM tool_minutes m WHERE m.cons_id = ? AND m.comp_id = ?
            ORDER BY m.date_reunion DESC, m.id DESC`, [consId, compId]);
        const [company] = await query(con, 'SELECT id, name FROM entreprises WHERE id = ?', [compId]);
        const [consultant] = await query(con, 'SELECT username FROM users WHERE id = ?', [consId]);
        res.status(200).json({
            minutes: minutes.map(m => {
                const { nb_unsigned, consultant_signed, ...rest } = m;
                // « Signée » = le consultant et tous les participants ont signé
                return { ...rest, signed_complete: !!consultant_signed && m.nb_presents > 0 && nb_unsigned === 0 };
            }),
            company: company || null,
            consultant: consultant || null
        });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

// ── Détail d'une minute ────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
    try {
        const id = toId(req.params.id);
        if (!id) return res.status(400).json({ message: "Paramètres invalides." });
        const r = await loadForUser(id, req.userId);
        if (r.status) return res.sendStatus(r.status);
        const presents = await query(con,
            'SELECT nom, poste, signature FROM tool_minutes_presents WHERE minute_id = ? ORDER BY position, id', [id]);
        const engagements = await query(con,
            "SELECT tache, responsable, DATE_FORMAT(echeance, '%Y-%m-%d') AS echeance FROM tool_minutes_engagements WHERE minute_id = ? ORDER BY position, id", [id]);
        const { heure_debut, heure_fin, ...minute } = r.minute;
        res.status(200).json({
            minute: { ...minute, heure_debut: heure_debut ? String(heure_debut).slice(0, 5) : null, heure_fin: heure_fin ? String(heure_fin).slice(0, 5) : null },
            presents,
            engagements,
            canWrite: r.canWrite && !r.lock,
            locked: !!r.lock
        });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

// ── Création / modification ────────────────────────────────────────────────

async function saveMinute(req, res, existingId) {
    const body = req.body || {};
    const errors = [];
    const { values, presents, engagements, consultantSignature } = cleanMinute(body, errors);
    if (errors.length) return res.status(400).json({ message: "Données invalides.", errors });

    let c;
    try {
        let compId, consId;
        if (existingId) {
            const r = await loadForUser(existingId, req.userId);
            if (r.status) return res.sendStatus(r.status);
            if (!r.canWrite) return res.status(403).json({ message: "Seul le consultant concerné peut modifier cette minute." });
            if (r.lock) return sendLock(res, r.lock);
            compId = r.minute.comp_id; consId = r.minute.cons_id;
        } else {
            compId = toId(body.comp_id); consId = toId(body.cons_id);
            if (!compId || !consId) return res.status(400).json({ message: "Paramètres invalides." });
            if (consId !== req.userId) return res.status(403).json({ message: "Seul le consultant concerné peut enregistrer cet outil." });
            const [company] = await query(con, COMPANY_GUARD_SQL, [compId]);
            if (!company) return res.status(404).json({ message: "Entreprise introuvable." });
            if (company.id_consl !== req.userId) return res.status(403).json({ message: "Cette entreprise ne vous est pas attribuée." });
            { const lock = vagueLock(company); if (lock) return sendLock(res, lock); }
            const [{ total }] = await query(con, 'SELECT COUNT(*) AS total FROM tool_minutes WHERE comp_id = ? AND cons_id = ?', [compId, consId]);
            if (total >= MAX_MINUTES_PER_COMPANY) return res.status(400).json({ message: `Limite de ${MAX_MINUTES_PER_COMPANY} minutes atteinte.` });
        }

        c = await getConnection();
        await query(c, 'START TRANSACTION');
        let id = existingId;
        const row = { ...values, consultant_signature: consultantSignature };
        if (existingId) {
            await query(c, 'UPDATE tool_minutes SET ? WHERE id = ?', [row, existingId]);
            await query(c, 'DELETE FROM tool_minutes_presents WHERE minute_id = ?', [existingId]);
            await query(c, 'DELETE FROM tool_minutes_engagements WHERE minute_id = ?', [existingId]);
        } else {
            const ins = await query(c, 'INSERT INTO tool_minutes SET ?', [{ cons_id: consId, comp_id: compId, ...row }]);
            id = ins.insertId;
        }
        if (presents.length) {
            await query(c, 'INSERT INTO tool_minutes_presents (minute_id, position, nom, poste, signature) VALUES ?',
                [presents.map((p, i) => [id, i, p.nom, p.poste, p.signature])]);
        }
        if (engagements.length) {
            await query(c, 'INSERT INTO tool_minutes_engagements (minute_id, position, tache, responsable, echeance) VALUES ?',
                [engagements.map((e, i) => [id, i, e.tache, e.responsable, e.echeance])]);
        }
        await query(c, 'COMMIT');
        res.status(existingId ? 200 : 201).json({ id });
    } catch (err) {
        if (c) await query(c, 'ROLLBACK').catch(() => {});
        console.log(err); res.sendStatus(500);
    } finally {
        if (c) c.release();
    }
}

router.post('/', (req, res) => saveMinute(req, res, null));

router.put('/:id', (req, res) => {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ message: "Paramètres invalides." });
    saveMinute(req, res, id);
});

// ── Suppression ────────────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
    try {
        const id = toId(req.params.id);
        if (!id) return res.status(400).json({ message: "Paramètres invalides." });
        const r = await loadForUser(id, req.userId);
        if (r.status) return res.sendStatus(r.status);
        if (!r.canWrite) return res.status(403).json({ message: "Seul le consultant concerné peut supprimer cette minute." });
        if (r.lock) return sendLock(res, r.lock);
        await query(con, 'DELETE FROM tool_minutes_presents WHERE minute_id = ?', [id]);
        await query(con, 'DELETE FROM tool_minutes_engagements WHERE minute_id = ?', [id]);
        await query(con, 'DELETE FROM tool_minutes WHERE id = ?', [id]);
        res.status(200).json({ message: "Minute supprimée." });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

module.exports = router;
