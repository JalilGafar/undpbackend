const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const router = express.Router();
const con = require('./../config/dbcon');
const { vagueLock, sendLock } = require('../config/vagues');
const SQL = require('sql-template-strings');
const db = require('../models');
const { companyGalleryDir, decodeImageDataUrl, MAX_UPLOAD_BYTES } = require('../middleware/upload');

// Galerie d'images par entreprise. Les fichiers sont dans private/companies/<id>/gallery
// (hors du dossier servi en statique) : on ne les lit que via GET /image/:id, avec le jeton.
// verifyToken est appliqué au montage dans app.js.

const CATEGORIES = ['entreprise', 'personnel', 'produits', 'locaux', 'autre'];
const STAGES = ['initiale', 'finale'];
const MAX_FILES_PER_REQUEST = 8;
const MAX_IMAGES_PER_COMPANY = 400;
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: MAX_FILES_PER_REQUEST },
    fileFilter: (req, file, cb) => cb(null, IMAGE_MIME.includes(file.mimetype))
}).array('images', MAX_FILES_PER_REQUEST);

const query = (sql) => new Promise((resolve, reject) =>
    con.query(sql, (err, result) => err ? reject(err) : resolve(result)));

async function userRoles(userId) {
    const user = await db.user.findByPk(userId);
    if (!user) return [];
    return (await user.getRoles()).map(r => r.name);
}

// Droits de l'utilisateur sur une entreprise : null si l'entreprise n'existe pas
async function accessFor(userId, compId) {
    const rows = await query(SQL`SELECT e.id_consl, v.nom AS vague_nom, v.statut AS vague_statut FROM entreprises e LEFT JOIN vagues v ON v.id = e.id_vague WHERE e.id = ${compId}`);
    if (rows.length === 0) return null;
    const roles = await userRoles(userId);
    const isManager = roles.includes('admin') || roles.includes('moderator') || roles.includes('evaluateur');
    const isOwner = rows[0].id_consl === userId;
    const lock = isOwner ? vagueLock(rows[0]) : null;           // vague clôturée : le consultant ne peut plus ajouter ni supprimer (l'administrateur, si)
    return {
        canRead: isManager || isOwner,
        canWrite: isOwner && !lock,
        canDelete: (isOwner && !lock) || roles.includes('admin'),
        lock
    };
}

const fail = (res, err) => { console.log(err); res.sendStatus(500); };

// Trace des envois d'images dans le journal du serveur (une ligne par étape, avec l'heure) : sert à situer un blocage éventuel.
const trace = (...args) => console.log('[gallery]', new Date().toISOString(), ...args);

// ── Liste ──────────────────────────────────────────────────────────────────

router.get('/company/:compId', async (req, res) => {
    try {
        const compId = parseInt(req.params.compId, 10);
        const access = await accessFor(req.userId, compId);
        if (!access) return res.sendStatus(404);
        if (!access.canRead) return res.status(403).json({ message: "Accès non autorisé." });
        const images = await query(SQL`
            SELECT id, comp_id, category, stage, legend, uploaded_by, created_at
            FROM entreprise_images WHERE comp_id = ${compId} ORDER BY created_at DESC, id DESC`);
        res.status(200).json({ images, canWrite: access.canWrite, canDelete: access.canDelete });
    } catch (err) { fail(res, err); }
});

// ── Ajout (plusieurs images) ───────────────────────────────────────────────

router.post('/company/:compId', (req, res) => {
    trace('POST reçu : entreprise', req.params.compId, ', taille annoncée', req.headers['content-length'], 'octets');
    upload(req, res, function (uploadErr) {
        trace('corps lu :', uploadErr ? 'erreur ' + uploadErr.code : (req.files ? req.files.length : 0) + ' fichier(s)');
        if (uploadErr) {
            const tooBig = uploadErr.code === 'LIMIT_FILE_SIZE';
            const tooMany = uploadErr.code === 'LIMIT_UNEXPECTED_FILE' || uploadErr.code === 'LIMIT_FILE_COUNT';
            return res.status(tooBig ? 413 : 400).json({
                message: tooBig ? "Image trop volumineuse (10 Mo maximum)."
                    : tooMany ? `Maximum ${MAX_FILES_PER_REQUEST} images par envoi.`
                    : "Échec de l'envoi."
            });
        }
        addImages(req, res);
    });
});

// Ajout d'UNE image envoyée en JSON : { image: "data:image/jpeg;base64,…", category, stage, legend }.
// La couche d'entrée de l'hébergeur refuse le multipart/form-data : le site envoie les images une par une, en JSON.
router.post('/company/:compId/json', (req, res) => {
    trace('POST JSON reçu : entreprise', req.params.compId, ', taille annoncée', req.headers['content-length'], 'octets');
    const buffer = decodeImageDataUrl(req.body && req.body.image);
    if (!buffer) return res.status(400).json({ message: "Aucune image valide (JPG, PNG ou WEBP)." });
    if (buffer.length > MAX_UPLOAD_BYTES) return res.status(413).json({ message: "Image trop volumineuse (10 Mo maximum)." });
    req.files = [{ buffer }];
    addImages(req, res);
});

// Traite et enregistre les images de req.files (envoi multipart ou JSON)
async function addImages(req, res) {
    try {
        const compId = parseInt(req.params.compId, 10);
        const access = await accessFor(req.userId, compId);
        trace('droits vérifiés');
        if (!access) return res.sendStatus(404);
        if (access.lock && !access.canWrite) return sendLock(res, access.lock);
        if (!access.canWrite) return res.status(403).json({ message: "Action non autorisée." });
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: "Aucune image valide (JPG, PNG ou WEBP)." });
        }

        const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'autre';
        const stage = STAGES.includes(req.body.stage) ? req.body.stage : 'initiale';
        const legend = (req.body.legend || '').toString().trim().slice(0, 255) || null;

        const [{ total }] = await query(SQL`SELECT COUNT(*) AS total FROM entreprise_images WHERE comp_id = ${compId}`);
        if (total + req.files.length > MAX_IMAGES_PER_COMPANY) {
            return res.status(400).json({ message: `Limite de ${MAX_IMAGES_PER_COMPANY} images par entreprise atteinte.` });
        }

        const dir = companyGalleryDir(compId);
        await fs.promises.mkdir(dir, { recursive: true });
        trace('dossier prêt');

        const saved = [];
        try {
            for (const f of req.files) {
                const name = crypto.randomBytes(12).toString('hex');
                const full = path.join(dir, name + '.jpg');
                const thumb = path.join(dir, name + '_thumb.jpg');
                // rotate() applique l'orientation EXIF des photos de téléphone ; flatten() évite un fond noir sur les PNG transparents
                const base = () => sharp(f.buffer).rotate().flatten({ background: '#ffffff' });
                await base().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(full);
                await base().resize(400, 400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 }).toFile(thumb);
                saved.push({ file: name + '.jpg', thumb: name + '_thumb.jpg' });
                trace('image traitée', saved.length, '/', req.files.length);
            }
        } catch (procErr) {
            for (const s of saved) {
                fs.unlink(path.join(dir, s.file), () => {});
                fs.unlink(path.join(dir, s.thumb), () => {});
            }
            console.log(procErr);
            return res.status(400).json({ message: "Une des images est illisible ou corrompue." });
        }

        for (const s of saved) {
            await query(SQL`
                INSERT INTO entreprise_images (comp_id, file, thumb, category, stage, legend, uploaded_by)
                VALUES (${compId}, ${s.file}, ${s.thumb}, ${category}, ${stage}, ${legend}, ${req.userId})`);
        }
        trace('terminé :', saved.length, 'image(s) enregistrée(s)');
        res.status(201).json({ added: saved.length });
    } catch (err) { fail(res, err); }
}

// ── Lecture d'une image (protégée) ─────────────────────────────────────────

router.get('/image/:id', async (req, res) => {
    try {
        const rows = await query(SQL`SELECT comp_id, file, thumb FROM entreprise_images WHERE id = ${parseInt(req.params.id, 10)}`);
        if (rows.length === 0) return res.sendStatus(404);
        const access = await accessFor(req.userId, rows[0].comp_id);
        if (!access || !access.canRead) return res.status(403).json({ message: "Accès non autorisé." });
        const name = req.query.size === 'thumb' ? rows[0].thumb : rows[0].file;
        res.set('Cache-Control', 'private, max-age=86400');
        res.sendFile(path.join(companyGalleryDir(rows[0].comp_id), path.basename(name)), err => {
            if (err && !res.headersSent) res.sendStatus(404);
        });
    } catch (err) { fail(res, err); }
});

// ── Suppression ────────────────────────────────────────────────────────────

router.delete('/image/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const rows = await query(SQL`SELECT comp_id, file, thumb FROM entreprise_images WHERE id = ${id}`);
        if (rows.length === 0) return res.sendStatus(404);
        const access = await accessFor(req.userId, rows[0].comp_id);
        if (access && access.lock && !access.canDelete) return sendLock(res, access.lock);
        if (!access || !access.canDelete) return res.status(403).json({ message: "Action non autorisée." });
        await query(SQL`DELETE FROM entreprise_images WHERE id = ${id}`);
        const dir = companyGalleryDir(rows[0].comp_id);
        fs.unlink(path.join(dir, path.basename(rows[0].file)), () => {});
        fs.unlink(path.join(dir, path.basename(rows[0].thumb)), () => {});
        res.sendStatus(204);
    } catch (err) { fail(res, err); }
});

module.exports = router;
