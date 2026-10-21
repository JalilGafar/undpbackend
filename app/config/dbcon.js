var mysql = require('mysql');

// Pool de connexions (au lieu d'une connexion unique) : l'application démarre même si MySQL est
// momentanément indisponible, les connexions mortes sont remplacées, et une erreur de base
// n'arrête plus le processus (elle est journalisée et la requête concernée répond 500).
// La limite reste basse : l'hébergement mutualisé plafonne le nombre de connexions par compte.
const con = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "NjNgNdFoNjMaNj7",
    database: 'undptools',
    multipleStatements: true,
    connectionLimit: 4
});
  
  
con.getConnection(function (err, connection) {
    if (err) {
        console.log('UNDP Tools Database connection failed :', err.code || err.message);
        return;
    }
    console.log('UNDP Tools Database is connected successfully !');
    connection.release();
});

module.exports = con;