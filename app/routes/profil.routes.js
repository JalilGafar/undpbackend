const express = require('express');
const router = express.Router();
const { con, query, getConnection, toId, isEmpty } = require('../config/dbhelpers');
const fx = require('../config/fx.config');
const { isManager } = require('../middleware/access');

// Outil 1L « Profil du participant ». verifyToken est appliqué au montage dans app.js.
//  - GET  : le consultant concerné, ou un admin / moderator (lecture seule).
//  - POST : uniquement le consultant propriétaire de l'entreprise (cons_id du corps = jeton).
// Les montants sont saisis et stockés en FCFA ; fx indique le taux fixe pour l'affichage en USD.

const MAX_SALES_LINES = 50;
const MAX_INT = 1000000;                 // effectifs, nombre de clients
const MAX_AMOUNT = 1000000000000;        // volume de ventes en FCFA

// Définition des champs acceptés : type, longueur max / valeurs autorisées
const FIELDS = {
    representant:    { type: 'text', max: 255 },
    telephone:       { type: 'text', max: 50 },
    adresse:         { type: 'text', max: 255 },
    email:           { type: 'text', max: 255 },
    activite:        { type: 'text', max: 255 },
    annees_activite: { type: 'text', max: 50 },
    organisation:    { type: 'text', max: 100 },
    date_reunion:    { type: 'date' },

    effectif_total:  { type: 'int' },
    effectif_femmes: { type: 'int' },

    etude_secondaire_chef:   { type: 'bool' },
    etude_secondaire_femmes: { type: 'int' },
    etude_secondaire_hommes: { type: 'int' },
    etude_universite_chef:   { type: 'bool' },
    etude_universite_femmes: { type: 'int' },
    etude_universite_hommes: { type: 'int' },
    etude_autre_chef:        { type: 'bool' },
    etude_autre_femmes:      { type: 'int' },
    etude_autre_hommes:      { type: 'int' },
    etude_autre_precision:   { type: 'text', max: 255 },

    type_entreprise:  { type: 'enum', values: ['familiale', 'independante', 'cooperative'] },

    enregistrement_fiscal: { type: 'bool' },
    type_facturation:      { type: 'enum', values: ['manuelle', 'electronique', 'aucune'] },
    compte_bancaire:       { type: 'bool' },
    suivi_ca:              { type: 'bool' },

    clients_reguliers:   { type: 'int' },
    canaux_vente:        { type: 'set', values: ['marches', 'en_ligne', 'entreprises', 'domicile', 'autre'] },
    type_clientele:      { type: 'enum', values: ['grand_public', 'particuliers', 'entreprises', 'autre'] },
    commentaires_marche: { type: 'text', max: 2000 },

    soutien_programme: { type: 'bool' },
    soutien_nom:       { type: 'text', max: 255 },
    subvention_recue:  { type: 'bool' }
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
            return Number.isInteger(n) && n >= 0 && n <= MAX_INT ? { value: n } : { error: `${name} : nombre entier positif attendu` };
        }
        case 'bool':
            if (raw === true || raw === 1 || raw === '1' || raw === 'true') return { value: 1 };
            if (raw === false || raw === 0 || raw === '0' || raw === 'false') return { value: 0 };
            return { error: `${name} : oui ou non attendu` };
        case 'date':
            return /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) && !isNaN(Date.parse(raw))
                ? { value: String(raw) } : { error: `${name} : date invalide (AAAA-MM-JJ)` };
        case 'enum':
            return spec.values.includes(raw) ? { value: raw } : { error: `${name} : valeur non autorisée` };
        case 'set': {
            const list = (Array.isArray(raw) ? raw : String(raw).split(',')).map(x => String(x).trim()).filter(Boolean);
            return list.every(x => spec.values.includes(x))
                ? { value: [...new Set(list)].join(',') } : { error: `${name} : valeur non autorisée` };
        }
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

        // DATE_FORMAT : évite le décalage d'un jour que le fuseau horaire introduit sur un type DATE sérialisé en JSON
        const [profil] = await query(con,
            "SELECT p.*, DATE_FORMAT(p.date_reunion, '%Y-%m-%d') AS date_reunion FROM entreprise_profil p WHERE p.cons_id = ? AND p.comp_id = ?", [consId, compId]);
        const ventes = profil
            ? await query(con, 'SELECT produit, volume_fcfa FROM entreprise_profil_ventes WHERE profil_id = ? ORDER BY position, id', [profil.id])
            : [];
        const [company] = await query(con,
            'SELECT id, name, gerant, quartier, lieu, ville, secteur, nbr_employer, nbr_femme FROM entreprises WHERE id = ?', [compId]);
        const [consultant] = await query(con, 'SELECT username FROM users WHERE id = ?', [consId]);

        res.status(200).json({ profil: profil || null, ventes, company: company || null, consultant: consultant || null, fx });
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
});

// ── Profil le plus récent d'une entreprise (managers : vue dans company-detail) ─────

router.get('/company/:compId', async (req, res) => {
    try {
        const compId = toId(req.params.compId);
        if (!compId) return res.status(400).json({ message: "Paramètres invalides." });
        if (!(await isManager(req.userId))) return res.status(403).json({ message: "Accès non autorisé." });

        const [profil] = await query(con,
            "SELECT p.*, DATE_FORMAT(p.date_reunion, '%Y-%m-%d') AS date_reunion, u.username AS consultant " +
            "FROM entreprise_profil p LEFT JOIN users u ON u.id = p.cons_id " +
            "WHERE p.comp_id = ? ORDER BY p.updated_at DESC, p.id DESC LIMIT 1", [compId]);
        const ventes = profil
            ? await query(con, 'SELECT produit, volume_fcfa FROM entreprise_profil_ventes WHERE profil_id = ? ORDER BY position, id', [profil.id])
            : [];
        res.status(200).json({ profil: profil || null, ventes, fx });
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

    // Validation et nettoyage
    const values = {};
    const errors = [];
    for (const [name, spec] of Object.entries(FIELDS)) {
        const r = clean(name, spec, body[name]);
        if (r.error) errors.push(r.error); else values[name] = r.value;
    }
    if (values.effectif_total !== null && values.effectif_femmes !== null && values.effectif_femmes > values.effectif_total) {
        errors.push("effectif_femmes : ne peut pas dépasser l'effectif total");
    }

    const ventes = [];
    const rawLines = Array.isArray(body.ventes) ? body.ventes : [];
    if (rawLines.length > MAX_SALES_LINES) errors.push(`ventes : ${MAX_SALES_LINES} lignes maximum`);
    rawLines.slice(0, MAX_SALES_LINES).forEach((l, i) => {
        const produit = isEmpty(l && l.produit) ? null : String(l.produit).trim();
        if (produit && produit.length > 255) errors.push(`ventes[${i}] : produit trop long`);
        const amount = isEmpty(l && l.volume_fcfa) ? 0 : Number(l.volume_fcfa);
        if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) {
            errors.push(`ventes[${i}] : montant entier positif attendu`);
            return;
        }
        if (produit || amount) ventes.push([produit, amount]);
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
        await query(c, 'INSERT INTO entreprise_profil SET ? ON DUPLICATE KEY UPDATE ?', [{ cons_id: consId, comp_id: compId, ...values }, values]);
        const [row] = await query(c, 'SELECT id FROM entreprise_profil WHERE cons_id = ? AND comp_id = ?', [consId, compId]);
        await query(c, 'DELETE FROM entreprise_profil_ventes WHERE profil_id = ?', [row.id]);
        if (ventes.length) {
            await query(c, 'INSERT INTO entreprise_profil_ventes (profil_id, position, produit, volume_fcfa) VALUES ?',
                [ventes.map(([produit, amount], i) => [row.id, i, produit, amount])]);
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
