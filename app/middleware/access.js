const db = require('../models');

// Noms des rôles ("admin", "moderator", "consultant", ...) de l'utilisateur
async function roleNames(userId) {
    const user = await db.user.findByPk(userId);
    if (!user) return [];
    return (await user.getRoles()).map(r => r.name);
}

// Équipe de supervision : administrateur, évaluateur (RBLAC) et modérateur consultent toutes les données (jamais d'écriture sur les outils)
const SUPERVISION_ROLES = ['admin', 'moderator', 'evaluateur'];

async function isManager(userId) {
    return (await roleNames(userId)).some(r => SUPERVISION_ROLES.includes(r));
}

async function isAdmin(userId) {
    return (await roleNames(userId)).includes('admin');
}

// Instance au nom de laquelle l'utilisateur évalue un livrable : l'administrateur pour le Bureau Pays, l'évaluateur pour le RBLAC.
// Le modérateur (et tout autre rôle) peut commenter mais ne pose pas de mention : null.
async function reviewerInstance(userId) {
    const roles = await roleNames(userId);
    return roles.includes('admin') ? 'bureau_pays' : roles.includes('evaluateur') ? 'rblac' : null;
}

module.exports = { roleNames, isManager, isAdmin, reviewerInstance, SUPERVISION_ROLES };
