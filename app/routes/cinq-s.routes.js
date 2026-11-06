const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const router = express.Router();
const { con, query, getConnection, toId, isEmpty } = require('../config/dbhelpers');
const { COMPANY_GUARD_SQL, vagueLock, sendLock } = require('../config/vagues');
const { isManager } = require('../middleware/access');
const { PRIVATE_DIR, decodeImageDataUrl, MAX_UPLOAD_BYTES } = require('../middleware/upload');

// Outil 5S, en deux évaluations par (consultant, entreprise) : phase « initial » (étape 1) et « final » (étape 4). verifyToken est appliqué au montage dans app.js.
//  - Lecture : le consultant concerné, ou un admin / moderator (lecture seule).
//  - Écriture : uniquement le consultant propriétaire de l'entreprise (cons_id du corps = jeton).
// 5 « S » de 6 critères, notés de 1 à 5 ; plan d'action ; photos avant / après, plusieurs par évaluation avec une légende
// (images envoyées en JSON, fichiers protégés lus avec le jeton).

const S_COUNT = 5;
const CRITERIA_PER_S = 6;
const STATUTS = ['a_faire', 'en_cours', 'termine'];
const SLOTS = ['avant', 'apres'];
const PHASES = ['initial', 'final'];
// Phase demandée (initial par défaut) ; null si la valeur est inconnue
const phaseOf = v => (isEmpty(v) ? 'initial' : PHASES.includes(v) ? v : null);
const MAX_ACTIONS = 50;
const MAX_OBS = 1000;
const MAX_TEXT = 500;
const MAX_PHOTOS_PER_EVALUATION = 100;

const photosDir = compId => path.join(PRIVATE_DIR, 'companies', String(compId), '5s');

const text = (v, max, label, errors) => {
    if (isEmpty(v)) return null;
    const s = String(v).trim();
    if (s.length > max) { errors.push(`${label} : ${max} caractères maximum`); return null; }
    return s;
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
        const phase = phaseOf(req.query.phase);
        if (!consId || !compId || !phase) return res.status(400).json({ message: "Paramètres invalides." });
        if (consId !== req.userId && !(await isManager(req.userId))) {
            return res.status(403).json({ message: "Accès non autorisé." });
        }

        const [row] = await query(con,
            "SELECT id, responsable, DATE_FORMAT(date_evaluation, '%Y-%m-%d') AS date_evaluation, updated_at " +
            "FROM entreprise_5s WHERE cons_id = ? AND comp_id = ? AND phase = ?", [consId, compId, phase]);
        const notes = row
            ? await query(con, 'SELECT s, critere, note, observations FROM entreprise_5s_notes WHERE diag_id = ? ORDER BY s, critere', [row.id])
            : [];
        const actions = row
            ? await query(con,
                "SELECT s, probleme, action, DATE_FORMAT(date_limite, '%Y-%m-%d') AS date_limite, statut, resultat " +
                "FROM entreprise_5s_actions WHERE diag_id = ? ORDER BY position, id", [row.id])
            : [];
        const [company] = await query(con, 'SELECT id, name FROM entreprises WHERE id = ?', [compId]);
        const [consultant] = await query(con, 'SELECT username FROM users WHERE id = ?', [consId]);

        res.status(200).json({
            phase,
            data: row ? { id: row.id, responsable: row.responsable, date_evaluation: row.date_evaluation, updated_at: row.updated_at } : null,
            notes, actions,
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
    const phase = phaseOf(body.phase);
    if (!consId || !compId || !phase) return res.status(400).json({ message: "Paramètres invalides." });
    if (consId !== req.userId) return res.status(403).json({ message: "Seul le consultant concerné peut enregistrer cet outil." });

    const errors = [];
    const responsable = text(body.responsable, 255, 'responsable', errors);
    const dateEvaluation = date(body.date_evaluation, 'date_evaluation', errors);

    const seen = new Set();
    const notes = [];
    (Array.isArray(body.notes) ? body.notes : []).forEach((n, i) => {
        const label = `notes[${i}]`;
        const s = Number(n && n.s), critere = Number(n && n.critere);
        if (!Number.isInteger(s) || s < 1 || s > S_COUNT || !Number.isInteger(critere) || critere < 1 || critere > CRITERIA_PER_S) {
            errors.push(`${label} : critère inconnu`); return;
        }
        const key = `${s}-${critere}`;
        if (seen.has(key)) { errors.push(`${label} : critère ${s}.${critere} en double`); return; }
        seen.add(key);
        let note = null;
        if (!isEmpty(n.note)) {
            note = Number(n.note);
            if (!Number.isInteger(note) || note < 1 || note > 5) { errors.push(`${label}.note : entier de 1 à 5 attendu`); note = null; }
        }
        const obs = text(n.observations, MAX_OBS, `${label}.observations`, errors);
        if (note !== null || obs) notes.push([s, critere, note, obs]);
    });

    const actions = [];
    const rawActions = Array.isArray(body.actions) ? body.actions : [];
    if (rawActions.length > MAX_ACTIONS) errors.push(`actions : ${MAX_ACTIONS} lignes maximum`);
    rawActions.slice(0, MAX_ACTIONS).forEach((a, i) => {
        const label = `actions[${i}]`;
        let s = null;
        if (!isEmpty(a && a.s)) {
            s = Number(a.s);
            if (!Number.isInteger(s) || s < 1 || s > S_COUNT) { errors.push(`${label}.s : de 1 à ${S_COUNT} attendu`); s = null; }
        }
        const probleme = text(a && a.probleme, MAX_TEXT, `${label}.probleme`, errors);
        const action = text(a && a.action, MAX_TEXT, `${label}.action`, errors);
        const dateLimite = date(a && a.date_limite, `${label}.date_limite`, errors);
        const resultat = text(a && a.resultat, MAX_TEXT, `${label}.resultat`, errors);
        let statut = isEmpty(a && a.statut) ? null : a.statut;
        if (statut !== null && !STATUTS.includes(statut)) { errors.push(`${label}.statut : valeur non autorisée`); statut = null; }
        if (s !== null || probleme || action || dateLimite || statut || resultat) actions.push([s, probleme, action, dateLimite, statut, resultat]);
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
        const fields = { responsable, date_evaluation: dateEvaluation };
        await query(c, 'INSERT INTO entreprise_5s SET ? ON DUPLICATE KEY UPDATE ?', [{ cons_id: consId, comp_id: compId, phase, ...fields }, fields]);
        const [row] = await query(c, 'SELECT id FROM entreprise_5s WHERE cons_id = ? AND comp_id = ? AND phase = ?', [consId, compId, phase]);
        await query(c, 'DELETE FROM entreprise_5s_notes WHERE diag_id = ?', [row.id]);
        if (notes.length) {
            await query(c, 'INSERT INTO entreprise_5s_notes (diag_id, s, critere, note, observations) VALUES ?', [notes.map(n => [row.id, ...n])]);
        }
        await query(c, 'DELETE FROM entreprise_5s_actions WHERE diag_id = ?', [row.id]);
        if (actions.length) {
            await query(c, 'INSERT INTO entreprise_5s_actions (diag_id, position, s, probleme, action, date_limite, statut, resultat) VALUES ?',
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

// ── Photos avant / après : plusieurs par évaluation, avec une légende (image en JSON, fichiers protégés) ─────

// Liste des photos d'un emplacement : ?idUser&idComp&phase&slot
router.get('/photos', async (req, res) => {
    try {
        const consId = toId(req.query.idUser);
        const compId = toId(req.query.idComp);
        const slot = req.query.slot;
        const phase = phaseOf(req.query.phase);
        if (!consId || !compId || !phase || !SLOTS.includes(slot)) return res.status(400).json({ message: "Paramètres invalides." });
        if (consId !== req.userId && !(await isManager(req.userId))) return res.status(403).json({ message: "Accès non autorisé." });
        const photos = await query(con,
            `SELECT p.id, p.slot, p.legend, p.created_at
             FROM entreprise_5s_photos p JOIN entreprise_5s d ON d.id = p.diag_id
             WHERE d.cons_id = ? AND d.comp_id = ? AND d.phase = ? AND p.slot = ?
             ORDER BY p.created_at, p.id`, [consId, compId, phase, slot]);
        res.status(200).json({ photos });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

// Ajoute une photo : { comp_id, phase, slot: 'avant' | 'apres', image: "data:image/jpeg;base64,…", legend }
router.post('/photo', async (req, res) => {
    try {
        const body = req.body || {};
        const compId = toId(body.comp_id);
        const slot = body.slot;
        const phase = phaseOf(body.phase);
        if (!compId || !phase || !SLOTS.includes(slot)) return res.status(400).json({ message: "Paramètres invalides." });
        const buffer = decodeImageDataUrl(body.image);
        if (!buffer) return res.status(400).json({ message: "Format non supporté (JPG, PNG ou WEBP)." });
        if (buffer.length > MAX_UPLOAD_BYTES) return res.status(413).json({ message: "Image trop volumineuse (10 Mo maximum)." });
        const legend = isEmpty(body.legend) ? null : String(body.legend).trim().slice(0, 255) || null;

        const [company] = await query(con, COMPANY_GUARD_SQL, [compId]);
        if (!company) return res.status(404).json({ message: "Entreprise introuvable." });
        if (company.id_consl !== req.userId) return res.status(403).json({ message: "Cette entreprise ne vous est pas attribuée." });
        { const lock = vagueLock(company); if (lock) return sendLock(res, lock); }

        // L'évaluation est créée si elle n'existe pas encore (on peut ajouter des photos avant d'avoir enregistré les notes)
        await query(con, 'INSERT INTO entreprise_5s (cons_id, comp_id, phase) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE cons_id = cons_id', [req.userId, compId, phase]);
        const [diag] = await query(con, 'SELECT id FROM entreprise_5s WHERE cons_id = ? AND comp_id = ? AND phase = ?', [req.userId, compId, phase]);
        const [{ total }] = await query(con, 'SELECT COUNT(*) AS total FROM entreprise_5s_photos WHERE diag_id = ?', [diag.id]);
        if (total >= MAX_PHOTOS_PER_EVALUATION) return res.status(400).json({ message: `Limite de ${MAX_PHOTOS_PER_EVALUATION} photos atteinte.` });

        const dir = photosDir(compId);
        await fs.promises.mkdir(dir, { recursive: true });
        const base = crypto.randomBytes(12).toString('hex');
        const file = base + '.jpg';
        const thumb = base + '_thumb.jpg';
        try {
            // rotate() applique l'orientation EXIF des photos de téléphone ; flatten() évite un fond noir sur les PNG transparents
            const source = () => sharp(buffer).rotate().flatten({ background: '#ffffff' });
            await source().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(path.join(dir, file));
            await source().resize(400, 400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 }).toFile(path.join(dir, thumb));
        } catch (procErr) {
            console.log(procErr);
            fs.unlink(path.join(dir, file), () => {});
            fs.unlink(path.join(dir, thumb), () => {});
            return res.status(400).json({ message: "Image illisible ou corrompue." });
        }
        const result = await query(con, 'INSERT INTO entreprise_5s_photos (diag_id, slot, file, thumb, legend) VALUES (?, ?, ?, ?, ?)', [diag.id, slot, file, thumb, legend]);
        res.status(201).json({ id: result.insertId });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

// Lecture d'une photo (protégée) : ?size=thumb pour la miniature
router.get('/photo/:id', async (req, res) => {
    try {
        const id = toId(req.params.id);
        if (!id) return res.status(400).json({ message: "Paramètres invalides." });
        const [row] = await query(con,
            `SELECT p.file, p.thumb, d.comp_id, d.cons_id FROM entreprise_5s_photos p JOIN entreprise_5s d ON d.id = p.diag_id WHERE p.id = ?`, [id]);
        if (!row) return res.sendStatus(404);
        if (row.cons_id !== req.userId && !(await isManager(req.userId))) return res.status(403).json({ message: "Accès non autorisé." });
        const name = req.query.size === 'thumb' ? row.thumb : row.file;
        res.set('Cache-Control', 'private, max-age=86400');
        res.type('image/jpeg');
        res.sendFile(path.join(photosDir(row.comp_id), path.basename(name)), err => {
            if (err && !res.headersSent) res.sendStatus(404);
        });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

router.delete('/photo/:id', async (req, res) => {
    try {
        const id = toId(req.params.id);
        if (!id) return res.status(400).json({ message: "Paramètres invalides." });
        const [row] = await query(con,
            `SELECT p.file, p.thumb, d.comp_id, d.cons_id FROM entreprise_5s_photos p JOIN entreprise_5s d ON d.id = p.diag_id WHERE p.id = ?`, [id]);
        if (!row) return res.sendStatus(404);
        if (row.cons_id !== req.userId) return res.status(403).json({ message: "Seul le consultant concerné peut supprimer cette photo." });
        const [company] = await query(con, COMPANY_GUARD_SQL, [row.comp_id]);
        { const lock = vagueLock(company); if (lock) return sendLock(res, lock); }
        await query(con, 'DELETE FROM entreprise_5s_photos WHERE id = ?', [id]);
        const dir = photosDir(row.comp_id);
        fs.unlink(path.join(dir, path.basename(row.file)), () => {});
        fs.unlink(path.join(dir, path.basename(row.thumb)), () => {});
        res.status(200).json({ message: "Photo supprimée." });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

module.exports = router;
