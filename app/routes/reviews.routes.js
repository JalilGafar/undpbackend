const express = require('express');
const router = express.Router();
const { con, query, toId } = require('../config/dbhelpers');
const { isManager, reviewerInstance } = require('../middleware/access');
const { vagueIds } = require('../config/vagues');

// Évaluation des livrables. verifyToken est appliqué au montage dans app.js.
//  - GET /summary : mention la plus récente de chaque livrable évalué (managers : tous ; consultant : les siens, avec « unseen ») ; compte les évaluations de chaque mention.
//  - GET    : équipe de supervision (admin, évaluateur, modérateur : tous les livrables) ou le consultant auteur du livrable.
//  - PUT    : équipe de supervision ; crée ou remplace SON propre avis sur le livrable (mention facultative + commentaire).
//             Seuls l'administrateur (Bureau Pays) et l'évaluateur (RBLAC) peuvent poser une mention ; le modérateur commente seulement.
//             L'instance (bureau_pays / rblac) est posée par le serveur d'après le rôle de l'auteur, jamais par le client.
//  - DELETE : l'évaluateur qui l'a écrite, uniquement.
// Un livrable = (comp_id, cons_id, tool_code) ; pour les minutes de réunion (t1b), chaque minute est un livrable (item_id = id de la minute).

const TOOLS = ['attribut', 't1d', 't1l', 't1g', 't2d', 't1b', 't1j', 't1k', 't1ea', 't5s', 't5sf', 't3h', 'tqw1', 'tqw2', 'tqw3', 'tqw4', 'tse', 'tsef'];
const STATUSES = ['valide', 'a_ameliorer'];
const MAX_COMMENT = 2000;
const ITEM_TOOL = 't1b';   // outil dont chaque élément (minute) est un livrable

// Identifie le livrable visé ; null si invalide. Pour t1b, item_id doit être une minute existante de ce consultant et de cette entreprise.
async function livrableKey(src) {
    const comp = toId(src.comp_id), cons = toId(src.cons_id), tool = String(src.tool_code || '');
    if (!comp || !cons || !TOOLS.includes(tool)) return null;
    let item = 0;
    if (tool === ITEM_TOOL) {
        item = toId(src.item_id);
        if (!item) return null;
        const rows = await query(con, 'SELECT id FROM tool_minutes WHERE id = ? AND comp_id = ? AND cons_id = ?', [item, comp, cons]);
        if (!rows.length) return null;
    }
    return { comp, cons, tool, item };
}

// Mention la plus récente d'une instance sur un livrable (les avis sans mention, simples commentaires, sont ignorés)
const latestMention = (column, instance) => `(SELECT r2.${column} FROM livrable_reviews r2
                     WHERE r2.comp_id = r.comp_id AND r2.cons_id = r.cons_id AND r2.tool_code = r.tool_code AND r2.item_id = r.item_id
                       AND r2.instance = '${instance}' AND r2.status IS NOT NULL
                     ORDER BY r2.updated_at DESC, r2.id DESC LIMIT 1)`;

router.get('/summary', async (req, res) => {
    try {
        const manager = await isManager(req.userId);
        // Conditions : le consultant ne voit que ses livrables ; ?vagues=… limite aux entreprises de ces vagues
        const where = [], params = [];
        if (!manager) { where.push('r.cons_id = ?'); params.push(req.userId); }
        const ids = vagueIds(req);
        if (ids) { where.push('r.comp_id IN (SELECT id FROM entreprises WHERE id_vague IN (?))'); params.push(ids); }
        const rows = await query(con, `
            SELECT r.comp_id, r.cons_id, r.tool_code, r.item_id, COUNT(*) AS nb, MAX(r.updated_at) AS last_at,
                   SUM(r.status = 'valide') AS nb_valide, SUM(r.status = 'a_ameliorer') AS nb_ameliorer,
                   SUM(r.comment IS NOT NULL AND r.comment <> '') AS nb_comments,
                   (SELECT r2.status FROM livrable_reviews r2
                     WHERE r2.comp_id = r.comp_id AND r2.cons_id = r.cons_id AND r2.tool_code = r.tool_code AND r2.item_id = r.item_id
                       AND r2.status IS NOT NULL
                     ORDER BY r2.updated_at DESC, r2.id DESC LIMIT 1) AS status,
                   ${latestMention('status', 'bureau_pays')} AS bp_status, ${latestMention('updated_at', 'bureau_pays')} AS bp_at,
                   ${latestMention('status', 'rblac')} AS rblac_status, ${latestMention('updated_at', 'rblac')} AS rblac_at,
                   (s.seen_at IS NULL OR MAX(r.updated_at) > s.seen_at) AS unseen
            FROM livrable_reviews r
            LEFT JOIN livrable_review_seen s
                   ON s.comp_id = r.comp_id AND s.cons_id = r.cons_id AND s.tool_code = r.tool_code AND s.item_id = r.item_id
            ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
            GROUP BY r.comp_id, r.cons_id, r.tool_code, r.item_id, s.seen_at`, params);
        res.status(200).json({
            items: rows.map(r => ({ comp_id: r.comp_id, cons_id: r.cons_id, tool_code: r.tool_code, item_id: r.item_id, nb: r.nb,
                                    nb_valide: Number(r.nb_valide), nb_ameliorer: Number(r.nb_ameliorer), nb_comments: Number(r.nb_comments),
                                    status: r.status,
                                    // Mention de chaque instance : la plus récente de ses membres (null = pas encore évalué par cette instance)
                                    bp_status: r.bp_status, bp_at: r.bp_at, rblac_status: r.rblac_status, rblac_at: r.rblac_at,
                                    unseen: !manager && !!r.unseen }))
        });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

router.get('/', async (req, res) => {
    try {
        const key = await livrableKey(req.query);
        if (!key) return res.status(400).json({ message: "Livrable invalide." });
        const manager = await isManager(req.userId);
        if (!manager && key.cons !== req.userId) return res.status(403).json({ message: "Accès non autorisé." });

        const rows = await query(con, `
            SELECT r.id, r.status, r.instance, r.comment, r.created_at, r.updated_at, r.reviewer_id,
                   u.username AS reviewer,
                   (SELECT ro.name FROM user_roles ur JOIN roles ro ON ro.id = ur.roleId
                     WHERE ur.userId = u.id AND ro.name IN ('admin','moderator','evaluateur') LIMIT 1) AS reviewer_role
            FROM livrable_reviews r
            LEFT JOIN users u ON u.id = r.reviewer_id
            WHERE r.comp_id = ? AND r.cons_id = ? AND r.tool_code = ? AND r.item_id = ?
            ORDER BY r.updated_at DESC, r.id DESC`, [key.comp, key.cons, key.tool, key.item]);
        // Le consultant auteur ouvre ses évaluations : elles ne sont plus « nouvelles »
        if (!manager) {
            await query(con, `INSERT INTO livrable_review_seen (comp_id, cons_id, tool_code, item_id) VALUES (?, ?, ?, ?)
                              ON DUPLICATE KEY UPDATE seen_at = CURRENT_TIMESTAMP`, [key.comp, key.cons, key.tool, key.item]);
        }
        const instance = manager ? await reviewerInstance(req.userId) : null;
        res.status(200).json({
            reviews: rows.map(r => ({ ...r, mine: r.reviewer_id === req.userId })),
            canReview: manager,                // peut commenter
            canEvaluate: instance !== null,    // peut poser une mention (administrateur ou évaluateur)
            instance                           // instance au nom de laquelle il évalue
        });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

router.put('/', async (req, res) => {
    try {
        if (!(await isManager(req.userId))) return res.status(403).json({ message: "Seule l'équipe de supervision peut commenter ou évaluer un livrable." });
        const key = await livrableKey(req.body || {});
        if (!key) return res.status(400).json({ message: "Livrable invalide." });

        // Mention facultative : sans mention, l'avis est un simple commentaire
        const raw = req.body.status;
        const hasStatus = !(raw === undefined || raw === null || raw === '');
        if (hasStatus && !STATUSES.includes(raw)) return res.status(400).json({ message: "Mention invalide." });
        const instance = await reviewerInstance(req.userId);
        if (hasStatus && !instance) {
            return res.status(403).json({ message: "Les modérateurs peuvent commenter un livrable mais pas l'évaluer : seuls le Bureau Pays (administrateur) et le RBLAC (évaluateur) posent une mention." });
        }
        let comment = req.body.comment;
        comment = typeof comment === 'string' ? comment.trim() : '';
        if (comment.length > MAX_COMMENT) return res.status(400).json({ message: `Commentaire trop long (${MAX_COMMENT} caractères maximum).` });
        if (!hasStatus && !comment) return res.status(400).json({ message: "Ajoutez un commentaire ou une mention." });

        await query(con, `
            INSERT INTO livrable_reviews (comp_id, cons_id, tool_code, item_id, reviewer_id, status, instance, comment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE status = VALUES(status), instance = VALUES(instance), comment = VALUES(comment)`,
            [key.comp, key.cons, key.tool, key.item, req.userId, hasStatus ? raw : null, instance, comment || null]);
        res.status(200).json({ message: hasStatus ? "Évaluation enregistrée." : "Commentaire enregistré." });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const id = toId(req.params.id);
        if (!id) return res.status(400).json({ message: "Évaluation invalide." });
        const result = await query(con,
            'DELETE FROM livrable_reviews WHERE id = ? AND reviewer_id = ?', [id, req.userId]);
        if (!result.affectedRows) return res.status(403).json({ message: "Vous ne pouvez supprimer que vos propres évaluations." });
        res.status(200).json({ message: "Évaluation supprimée." });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

module.exports = router;
