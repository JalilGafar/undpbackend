const { con, query, toId } = require('./dbhelpers');
const { roleNames } = require('../middleware/access');

// Vagues du programme GYB. Une entreprise appartient à une seule vague (entreprises.id_vague) ; toutes ses données d'outils
// s'y rattachent par comp_id.
//  - La vague choisie par l'utilisateur est un FILTRE D'AFFICHAGE (paramètre ?vagues=2,3 ou absent / « all » = toutes) : il ne donne
//    aucun droit. Les droits restent : un consultant ne voit que ses entreprises, un manager voit tout.
//  - Une vague CLÔTURÉE verrouille les saisies des consultants sur ses entreprises (réponse 423). L'administrateur peut la rouvrir.

// Vagues demandées par la requête : tableau d'identifiants, ou null = toutes les vagues
function vagueIds(req) {
    const raw = req.query && req.query.vagues;
    if (raw === undefined || raw === null) return null;
    const text = String(raw).trim().toLowerCase();
    if (text === '' || text === 'all' || text === 'toutes') return null;
    const ids = [...new Set(text.split(',').map(s => toId(s.trim())).filter(Boolean))].slice(0, 50);
    return ids.length ? ids : null;
}

// Paramètres à intégrer dans une requête sans en changer la forme :  AND (${w.all} = 1 OR e.id_vague IN (${w.ids}))
function vagueParams(req) {
    const ids = vagueIds(req);
    return { all: ids ? 0 : 1, ids: ids || [0] };
}

// Entreprise + vague, pour contrôler un droit d'écriture
const COMPANY_GUARD_SQL = `
    SELECT e.id_consl, e.id_vague, v.nom AS vague_nom, v.statut AS vague_statut
    FROM entreprises e LEFT JOIN vagues v ON v.id = e.id_vague
    WHERE e.id = ?`;

// null si l'entreprise est modifiable ; sinon { status, message } à renvoyer tel quel
function vagueLock(company) {
    if (company && company.vague_statut === 'cloturee') {
        return {
            status: 423,
            message: `${company.vague_nom} est clôturée : les saisies sont verrouillées (lecture seule). L'administrateur peut la rouvrir.`
        };
    }
    return null;
}

const sendLock = (res, lock) => res.status(lock.status).json({ message: lock.message, code: 'vague_cloturee' });

async function isAdmin(userId) {
    return (await roleNames(userId)).includes('admin');
}

// Vague d'une nouvelle entreprise : celle demandée (elle doit exister et ne pas être clôturée), sinon la vague en cours la plus récente.
// Renvoie { id } ou { error }.
async function vagueForNewCompany(requested) {
    const id = toId(requested);
    if (id) {
        const [v] = await query(con, 'SELECT id, statut FROM vagues WHERE id = ?', [id]);
        if (!v) return { error: "Vague introuvable." };
        if (v.statut === 'cloturee') return { error: "Cette vague est clôturée : on ne peut plus y ajouter d'entreprise." };
        return { id };
    }
    const [current] = await query(con, "SELECT id FROM vagues WHERE statut = 'en_cours' ORDER BY date_debut DESC, id DESC LIMIT 1");
    if (current) return { id: current.id };
    const [open] = await query(con, "SELECT id FROM vagues WHERE statut <> 'cloturee' ORDER BY id DESC LIMIT 1");
    return open ? { id: open.id } : { error: "Aucune vague ouverte : l'administrateur doit en créer une." };
}

module.exports = { vagueIds, vagueParams, COMPANY_GUARD_SQL, vagueLock, sendLock, isAdmin, vagueForNewCompany };
