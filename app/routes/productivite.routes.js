const express = require('express');
const router = express.Router();
const { con, query, getConnection, toId, isEmpty } = require('../config/dbhelpers');
const { COMPANY_GUARD_SQL, vagueLock, sendLock } = require('../config/vagues');
const fx = require('../config/fx.config');
const { isManager } = require('../middleware/access');

// Outil 1J « Profil de productivité ». verifyToken est appliqué au montage dans app.js.
//  - GET  : le consultant concerné, ou un admin / moderator (lecture seule).
//  - POST : uniquement le consultant propriétaire de l'entreprise (cons_id du corps = jeton).
// Les montants sont saisis et stockés en FCFA ; fx indique le taux fixe pour l'affichage en USD.

const MAX_LINES = 100;
const MAX_INT = 1000000000;
const MAX_AMOUNT = 1000000000000;

// Champs acceptés : type, bornes / longueur max / valeurs autorisées
const FIELDS = {
    nb_gammes:                 { type: 'int', max: MAX_INT },
    nb_variantes:              { type: 'int', max: MAX_INT },

    production_quotidienne:    { type: 'text', max: 255 },
    heures_par_jour:           { type: 'dec', min: 0, max: 24 },
    jours_par_semaine:         { type: 'int', min: 0, max: 7 },
    mois_par_an:               { type: 'int', min: 0, max: 12 },
    capacite_utilisee_pct:     { type: 'int', min: 0, max: 100 },
    production_type:           { type: 'enum', values: ['stock', 'commande', 'les_deux'] },

    surface_m2:                { type: 'dec', min: 0, max: 1000000 },
    propriete:                 { type: 'enum', values: ['propriete', 'location'] },
    nb_machines_cles:          { type: 'int', max: MAX_INT },
    machine_principale:        { type: 'text', max: 255 },
    jours_perdus_mois:         { type: 'dec', min: 0, max: 31 },

    effectif_production:       { type: 'int', max: MAX_INT },
    effectif_temps_plein:      { type: 'int', max: MAX_INT },
    effectif_temps_partiel:    { type: 'int', max: MAX_INT },
    formes_securite:           { type: 'bool' },
    nb_formes_securite:        { type: 'int', max: MAX_INT },
    lacune_competences:        { type: 'text', max: 500 },

    saisonnalite:              { type: 'bool' },
    saisonnalite_detail:       { type: 'text', max: 500 },
    goulot:                    { type: 'text', max: 500 },
    augmentation_possible_pct: { type: 'int', min: 0, max: 1000 },
    commandes_refusees:        { type: 'bool' },
    commandes_refusees_fcfa:   { type: 'int', max: MAX_AMOUNT },
    certifications:            { type: 'text', max: 500 }
};

// Convertit une valeur du corps selon le type du champ ; renvoie { value } ou { error }
function clean(name, spec, raw) {
    if (isEmpty(raw)) return { value: null };
    switch (spec.type) {
        case 'text': {
            const s = String(raw).trim();
            return s.length > spec.max ? { error: `${name} : ${spec.max} caractères maximum` } : { value: s };
        }
        case 'int': {
            const n = Number(raw);
            const min = spec.min ?? 0;
            return Number.isInteger(n) && n >= min && n <= spec.max
                ? { value: n } : { error: `${name} : entier entre ${min} et ${spec.max} attendu` };
        }
        case 'dec': {
            const n = Number(raw);
            return Number.isFinite(n) && n >= spec.min && n <= spec.max
                ? { value: Math.round(n * 10) / 10 } : { error: `${name} : nombre entre ${spec.min} et ${spec.max} attendu` };
        }
        case 'bool':
            if (raw === true || raw === 1 || raw === '1' || raw === 'true') return { value: 1 };
            if (raw === false || raw === 0 || raw === '0' || raw === 'false') return { value: 0 };
            return { error: `${name} : oui ou non attendu` };
        case 'enum':
            return spec.values.includes(raw) ? { value: raw } : { error: `${name} : valeur non autorisée` };
    }
}

// ── Lecture ────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
    try {
        const consId = toId(req.query.idUser);
        const compId = toId(req.query.idComp);
        if (!consId || !compId) return res.status(400).json({ message: "Paramètres invalides." });
        if (consId !== req.userId && !(await isManager(req.userId))) {
            return res.status(403).json({ message: "Accès non autorisé." });
        }

        const [data] = await query(con, 'SELECT * FROM entreprise_productivite WHERE cons_id = ? AND comp_id = ?', [consId, compId]);
        const produits = data
            ? await query(con, 'SELECT produit, volume_mensuel, valeur_fcfa FROM entreprise_productivite_produits WHERE prod_id = ? ORDER BY position, id', [data.id])
            : [];
        const [company] = await query(con, 'SELECT id, name FROM entreprises WHERE id = ?', [compId]);
        const [consultant] = await query(con, 'SELECT username FROM users WHERE id = ?', [consId]);

        res.status(200).json({ data: data || null, produits, company: company || null, consultant: consultant || null, fx });
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

    const values = {};
    const errors = [];
    for (const [name, spec] of Object.entries(FIELDS)) {
        const r = clean(name, spec, body[name]);
        if (r.error) errors.push(r.error); else values[name] = r.value;
    }
    if (values.nb_variantes !== null && values.nb_gammes !== null && values.nb_variantes < values.nb_gammes) {
        errors.push("nb_variantes : ne peut pas être inférieur au nombre de gammes");
    }

    const produits = [];
    const rawLines = Array.isArray(body.produits) ? body.produits : [];
    if (rawLines.length > MAX_LINES) errors.push(`produits : ${MAX_LINES} lignes maximum`);
    rawLines.slice(0, MAX_LINES).forEach((l, i) => {
        const produit = isEmpty(l && l.produit) ? null : String(l.produit).trim();
        const volume = isEmpty(l && l.volume_mensuel) ? null : String(l.volume_mensuel).trim();
        if (produit && produit.length > 255) errors.push(`produits[${i}] : nom trop long`);
        if (volume && volume.length > 100) errors.push(`produits[${i}] : volume trop long`);
        const amount = isEmpty(l && l.valeur_fcfa) ? 0 : Number(l.valeur_fcfa);
        if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) {
            errors.push(`produits[${i}] : montant entier positif attendu`);
            return;
        }
        if (produit || volume || amount) produits.push([produit, volume, amount]);
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
        await query(c, 'INSERT INTO entreprise_productivite SET ? ON DUPLICATE KEY UPDATE ?', [{ cons_id: consId, comp_id: compId, ...values }, values]);
        const [row] = await query(c, 'SELECT id FROM entreprise_productivite WHERE cons_id = ? AND comp_id = ?', [consId, compId]);
        await query(c, 'DELETE FROM entreprise_productivite_produits WHERE prod_id = ?', [row.id]);
        if (produits.length) {
            await query(c, 'INSERT INTO entreprise_productivite_produits (prod_id, position, produit, volume_mensuel, valeur_fcfa) VALUES ?',
                [produits.map(([produit, volume, amount], i) => [row.id, i, produit, volume, amount])]);
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
