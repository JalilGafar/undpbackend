const db = require('../models');

// Noms des rôles ("admin", "moderator", "consultant", ...) de l'utilisateur
async function roleNames(userId) {
    const user = await db.user.findByPk(userId);
    if (!user) return [];
    return (await user.getRoles()).map(r => r.name);
}

// Admin ou moderator : consultation de toutes les données (jamais d'écriture sur les outils)
async function isManager(userId) {
    const roles = await roleNames(userId);
    return roles.includes('admin') || roles.includes('moderator');
}

module.exports = { roleNames, isManager };
