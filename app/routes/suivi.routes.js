const express = require('express');
const router = express.Router();
const { con, query, getConnection, toId, isEmpty } = require('../config/dbhelpers');
const { COMPANY_GUARD_SQL, vagueLock, sendLock } = require('../config/vagues');
const { isManager } = require('../middleware/access');
const fx = require('../config/fx.config');
const { vagueIds } = require('../config/vagues');
const { SECTIONS, QUESTIONS, LISTS, LIST_CODES, BY_KEY, questionsOf } = require('../config/suivi.catalog');

// Outil « Suivi et évaluation » : une saisie par (consultant, entreprise, phase), phase « initial » (étape 1) ou « final » (étape 4).
// verifyToken est appliqué au montage dans app.js.
//  - Lecture d'une saisie : le consultant concerné, ou un admin / moderator (lecture seule).
//  - Écriture : uniquement le consultant propriétaire de l'entreprise (cons_id du corps = jeton).
//  - /portfolio : tableau de bord agrégé sur toutes les entreprises, réservé aux admin / moderator.

const PHASES = ['initial', 'final'];
const phaseOf = v => (isEmpty(v) ? 'initial' : PHASES.includes(v) ? v : null);

// ── Questionnaire (une seule source : le catalogue serveur) ─────────────────

router.get('/questionnaire', (req, res) => {
    res.status(200).json({ sections: SECTIONS, questions: QUESTIONS, lists: LISTS, fx });
});

// ── Conversion des valeurs enregistrées ↔ valeurs de l'API ──────────────────

const isNumeric = q => q.type === 'number' || q.type === 'money' || q.type === 'percent';

/** Valeur(s) lue(s) en base → valeur de l'API (nombre, liste de numéros, code ou texte) */
function fromRows(q, values) {
    if (q.type === 'multi') return values.map(Number);
    const v = values[0];
    if (q.type === 'choice' || isNumeric(q)) return Number(v);
    return v;
}

/** Valeur reçue → liste de chaînes à enregistrer ; null si la réponse est vide ; { error } si elle est invalide */
function toRows(q, raw) {
    if (raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && !raw.length)) return null;
    switch (q.type) {
        case 'choice': {
            const n = Number(raw);
            if (!Number.isInteger(n) || n < 1 || n > q.options.length) return { error: 'option inconnue' };
            return [String(n)];
        }
        case 'multi': {
            if (!Array.isArray(raw)) return { error: 'liste attendue' };
            const nums = [...new Set(raw.map(Number))];
            if (nums.some(n => !Number.isInteger(n) || n < 1 || n > q.options.length)) return { error: 'option inconnue' };
            return nums.map(String);
        }
        case 'number': case 'money': case 'percent': {
            const n = Number(raw);
            if (!Number.isFinite(n)) return { error: 'nombre attendu' };
            const min = q.min ?? 0;
            if (n < min) return { error: `minimum ${min}` };
            if (q.max !== undefined && n > q.max) return { error: `maximum ${q.max}` };
            return [String(Math.round(n * 100) / 100)];
        }
        case 'list': {
            const code = String(raw);
            return LIST_CODES[q.list].has(code) ? [code] : { error: 'valeur inconnue' };
        }
        case 'text': case 'longtext': {
            const s = String(raw).trim();
            if (!s) return null;
            const max = q.type === 'text' ? 255 : 2000;
            return s.length > max ? { error: `${max} caractères maximum` } : [s];
        }
        default: return { error: 'type inconnu' };
    }
}

/** La question est-elle posée compte tenu des réponses déjà données ? (showIf) */
function applicable(q, answers) {
    if (!q.showIf) return true;
    const dep = answers[q.showIf.key];
    return dep !== undefined && q.showIf.anyOf.includes(dep);
}

// Réponses enregistrées d'une saisie : { qkey: valeur }
async function loadAnswers(suiviId) {
    const rows = await query(con, 'SELECT qkey, valeur FROM entreprise_suivi_reponses WHERE suivi_id = ? ORDER BY id', [suiviId]);
    const grouped = {};
    rows.forEach(r => (grouped[r.qkey] = grouped[r.qkey] || []).push(r.valeur));
    const out = {};
    Object.entries(grouped).forEach(([key, values]) => { if (BY_KEY[key]) out[key] = fromRows(BY_KEY[key], values); });
    return out;
}

// ── Lecture d'une saisie ────────────────────────────────────────────────────

router.get('/', async (req, res) => {
    try {
        const consId = toId(req.query.idUser);
        const compId = toId(req.query.idComp);
        const phase = phaseOf(req.query.phase);
        if (!consId || !compId || !phase) return res.status(400).json({ message: "Paramètres invalides." });
        if (consId !== req.userId && !(await isManager(req.userId))) {
            return res.status(403).json({ message: "Accès non autorisé." });
        }

        const find = p => query(con, 'SELECT id, updated_at FROM entreprise_suivi WHERE cons_id = ? AND comp_id = ? AND phase = ?', [consId, compId, p]);
        const [row] = await find(phase);
        const answers = row ? await loadAnswers(row.id) : {};
        // Saisie finale : on affiche aussi les réponses du démarrage pour mesurer ce qui a changé
        let initial = null;
        if (phase === 'final') {
            const [ini] = await find('initial');
            initial = ini ? await loadAnswers(ini.id) : null;
        }
        const [company] = await query(con,
            'SELECT id, name, region, ville, secteur, nbr_employer, nbr_femme FROM entreprises WHERE id = ?', [compId]);
        const [consultant] = await query(con, 'SELECT username FROM users WHERE id = ?', [consId]);

        res.status(200).json({
            phase,
            data: row ? { id: row.id, updated_at: row.updated_at } : null,
            answers, initial,
            company: company || null,
            consultant: consultant || null,
            fx
        });
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
});

// ── Enregistrement (upsert ; la saisie peut être partielle et reprise plus tard) ─────

router.post('/', async (req, res) => {
    const body = req.body || {};
    const consId = toId(body.cons_id);
    const compId = toId(body.comp_id);
    const phase = phaseOf(body.phase);
    if (!consId || !compId || !phase) return res.status(400).json({ message: "Paramètres invalides." });
    if (consId !== req.userId) return res.status(403).json({ message: "Seul le consultant concerné peut enregistrer cet outil." });

    const raw = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const errors = [];
    const asked = new Set(questionsOf(phase).map(q => q.key));
    Object.keys(raw).forEach(k => { if (!asked.has(k)) errors.push(`${k} : question non posée dans cette saisie`); });

    // Réponses valides, dans l'ordre du questionnaire (les conditions showIf dépendent des réponses précédentes)
    const answers = {};
    const rows = [];
    questionsOf(phase).forEach(q => {
        if (!(q.key in raw)) return;
        const rowsOf = toRows(q, raw[q.key]);
        if (rowsOf === null) return;
        if (rowsOf.error) { errors.push(`${q.key} : ${rowsOf.error}`); return; }
        answers[q.key] = q.type === 'multi' ? rowsOf.map(Number) : fromRows(q, rowsOf);
        if (!applicable(q, answers)) { delete answers[q.key]; return; }   // réponse devenue sans objet : non conservée
        rowsOf.forEach(v => rows.push([q.key, v]));
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
        await query(c, 'INSERT INTO entreprise_suivi (cons_id, comp_id, phase) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE cons_id = cons_id', [consId, compId, phase]);
        const [row] = await query(c, 'SELECT id FROM entreprise_suivi WHERE cons_id = ? AND comp_id = ? AND phase = ?', [consId, compId, phase]);
        await query(c, 'DELETE FROM entreprise_suivi_reponses WHERE suivi_id = ?', [row.id]);
        if (rows.length) {
            await query(c, 'INSERT INTO entreprise_suivi_reponses (suivi_id, qkey, valeur) VALUES ?', [rows.map(r => [row.id, ...r])]);
        }
        // Marque la saisie comme modifiée même si seules des réponses ont changé
        await query(c, 'UPDATE entreprise_suivi SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
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

// ── Tableau de bord du portefeuille (managers) ──────────────────────────────

const sum = a => a.reduce((x, y) => x + y, 0);
const avg = a => (a.length ? sum(a) / a.length : null);
const median = a => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Part d'un effectif dans l'effectif total, sur les entreprises qui ont renseigné les deux (null si aucune)
function ratio(items, key) {
    const ok = items.filter(a => a.q13 > 0 && a[key] !== undefined);
    const total = sum(ok.map(a => a.q13));
    return total ? { part: sum(ok.map(a => a[key])) / total, n: ok.length, effectif: sum(ok.map(a => a[key])) } : null;
}

function indicators(items) {
    const withJobs = items.filter(a => a.q13 !== undefined);
    return {
        entreprises: items.length,
        emplois: withJobs.length ? sum(withJobs.map(a => a.q13)) : null,
        femmes: ratio(items, 'q14'),
        jeunes: ratio(items, 'q16'),
        handicap: ratio(items, 'q17'),
        vulnerables: ratio(items, 'q18'),
        ca_moyen: avg(items.filter(a => a.q21 !== undefined).map(a => a.q21)),
        marge_moyenne: avg(items.filter(a => a.q22 !== undefined).map(a => a.q22))
    };
}

// Répartition des réponses d'une question sur un ensemble de saisies
function distribution(q, items) {
    const answered = items.filter(a => a[q.key] !== undefined && a[q.key] !== null);
    const out = { n: answered.length };
    if (isNumeric(q)) {
        const values = answered.map(a => a[q.key]);
        Object.assign(out, { somme: sum(values), moyenne: avg(values), mediane: median(values) });
    } else if (q.type === 'choice' || q.type === 'multi' || q.type === 'list') {
        const counts = {};
        answered.forEach(a => [].concat(a[q.key]).forEach(v => { counts[v] = (counts[v] || 0) + 1; }));
        out.counts = counts;
    }
    return out;
}

router.get('/portfolio', async (req, res) => {
    try {
        if (!(await isManager(req.userId))) return res.status(403).json({ message: "Réservé aux managers et modérateurs." });

        const all = await query(con, `
            SELECT s.id, s.phase, s.cons_id, s.comp_id, e.id_vague, e.name AS company, e.region, u.username AS consultant
            FROM entreprise_suivi s
            JOIN entreprises e ON e.id = s.comp_id
            JOIN users u ON u.id = s.cons_id
            ORDER BY e.name`);
        // Vagues choisies (?vagues=…) : tout le tableau de bord, y compris les listes de filtres, ne porte que sur elles
        const waves = vagueIds(req);
        const inWaves = all.filter(s => !waves || waves.includes(s.id_vague));
        const region = isEmpty(req.query.region) ? null : String(req.query.region);
        const cons = toId(req.query.cons);
        const filtered = inWaves.filter(s => (!region || s.region === region) && (!cons || s.cons_id === cons));

        const answersBySuivi = {};
        if (filtered.length) {
            const rows = await query(con, 'SELECT suivi_id, qkey, valeur FROM entreprise_suivi_reponses WHERE suivi_id IN (?)', [filtered.map(s => s.id)]);
            const grouped = {};
            rows.forEach(r => {
                const byQuestion = grouped[r.suivi_id] = grouped[r.suivi_id] || {};
                (byQuestion[r.qkey] = byQuestion[r.qkey] || []).push(r.valeur);
            });
            filtered.forEach(s => {
                const a = {};
                Object.entries(grouped[s.id] || {}).forEach(([k, v]) => { if (BY_KEY[k]) a[k] = fromRows(BY_KEY[k], v); });
                answersBySuivi[s.id] = a;
            });
        }
        const itemsOf = phase => filtered.filter(s => s.phase === phase).map(s => ({ ...answersBySuivi[s.id], _comp: s.comp_id }));

        const phases = {};
        PHASES.forEach(p => {
            const items = itemsOf(p);
            phases[p] = { indicateurs: indicators(items), questions: {} };
            QUESTIONS.forEach(q => { if (p === 'initial' || !q.once) phases[p].questions[q.key] = distribution(q, items); });
        });

        // Comparaison à entreprises constantes : seules celles qui ont une saisie initiale ET finale
        const ini = itemsOf('initial'), fin = itemsOf('final');
        const both = new Set(fin.map(a => a._comp).filter(c => ini.some(i => i._comp === c)));
        const paired = {
            entreprises: both.size,
            initial: indicators(ini.filter(a => both.has(a._comp))),
            final: indicators(fin.filter(a => both.has(a._comp)))
        };

        res.status(200).json({
            phases, paired, fx,
            filtres: {
                regions: [...new Set(inWaves.map(s => s.region).filter(Boolean))].sort(),
                consultants: [...new Map(inWaves.map(s => [s.cons_id, s.consultant])).entries()].map(([id, username]) => ({ id, username }))
            }
        });
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
});

module.exports = router;
