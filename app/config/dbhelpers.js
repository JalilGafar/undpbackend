const con = require('./dbcon');

// Petits utilitaires partagés par les routes qui utilisent des requêtes paramétrées (`?`) et des transactions.

const query = (c, sql, params) => new Promise((resolve, reject) =>
    c.query(sql, params, (err, result) => err ? reject(err) : resolve(result)));

const getConnection = () => new Promise((resolve, reject) =>
    con.getConnection((err, c) => err ? reject(err) : resolve(c)));

const toId = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

const isEmpty = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

module.exports = { con, query, getConnection, toId, isEmpty };
