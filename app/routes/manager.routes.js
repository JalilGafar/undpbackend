const express = require('express');
const { authJwt } = require("../middleware");
const router = express.Router();
const controller = require("../controllers/user.controller");
var con = require('./../config/dbcon');
var SQL = require('sql-template-strings');

// module.exports = function (app) {
//     app.use(function (req, res, next) {
//         res.header(
//             "Access-Control-Allow-Headers",
//             "Origin, Content-Type, Accept"
//         );
//         next();
//     });
// };

router.use(function (req, res, next) {
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, Content-Type, Accept"
    );
    next();
});


router.get("/user", (req, res) => {
    console.log('testeur')
    con.query(SQL
        `	SELECT userId AS id, name, username, email, tel
                FROM roles
                JOIN (SELECT roleId, userId, username, email, tel
		            FROM user_roles
		            INNER JOIN users ON user_roles.userId = users.id) JU ON JU.roleId = roles.id ;`,
        function (err, result, fields) {
            if (err) {
                console.log(err);
                res.sendStatus(500);
                return;
            };
            res.status(200).json(result);
            return;
        }
    )
}

);

module.exports = router;