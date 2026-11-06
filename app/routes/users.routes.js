const express = require('express');
const router = express.Router();
const db = require('../models');
const { con, query, toId, isEmpty } = require('../config/dbhelpers');
const { isAdmin } = require('../middleware/access');

// Gestion des utilisateurs et de leurs rôles. verifyToken est appliqué au montage dans app.js.
// Réservé à l'administrateur (Bureau Pays) : les autres rôles ne peuvent ni lister les comptes ni en changer le rôle.
// Un utilisateur n'a qu'un seul rôle. Le rôle se lit à chaque requête côté serveur : le changement est immédiat côté droits ;
// côté affichage, l'utilisateur concerné le voit à sa prochaine connexion.

router.use(async (req, res, next) => {
    try {
        if (await isAdmin(req.userId)) return next();
    } catch (err) {
        console.log(err); return res.sendStatus(500);
    }
    res.status(403).json({ message: "Seul l'administrateur gère les utilisateurs." });
});

router.get('/', async (req, res) => {
    try {
        const users = await query(con, `
            SELECT u.id, u.username, u.email, u.tel, u.photo,
                   (SELECT ro.name FROM user_roles ur JOIN roles ro ON ro.id = ur.roleId WHERE ur.userId = u.id ORDER BY ro.id LIMIT 1) AS role,
                   (SELECT COUNT(*) FROM entreprises e WHERE e.id_consl = u.id) AS nb_entreprises
            FROM users u
            ORDER BY u.username`);
        res.status(200).json(users.map(u => ({ ...u, nb_entreprises: Number(u.nb_entreprises) })));
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

router.put('/:id/role', async (req, res) => {
    try {
        const id = toId(req.params.id);
        const role = isEmpty(req.body && req.body.role) ? '' : String(req.body.role);
        if (!id || !role) return res.status(400).json({ message: "Paramètres invalides." });
        if (id === req.userId) return res.status(400).json({ message: "Vous ne pouvez pas modifier votre propre rôle : demandez à un autre administrateur." });
        if (!db.ROLES.includes(role)) return res.status(400).json({ message: "Rôle inconnu." });

        const user = await db.user.findByPk(id);
        if (!user) return res.sendStatus(404);
        const roles = await db.role.findAll({ where: { name: role } });
        if (!roles.length) return res.status(400).json({ message: "Rôle inconnu." });

        await user.setRoles(roles);          // un seul rôle : l'ancien est remplacé
        const [{ n }] = await query(con, 'SELECT COUNT(*) AS n FROM entreprises WHERE id_consl = ?', [id]);
        res.status(200).json({ message: "Rôle modifié.", role, nb_entreprises: Number(n) });
    } catch (err) {
        console.log(err); res.sendStatus(500);
    }
});

module.exports = router;
