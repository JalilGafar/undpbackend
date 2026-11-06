const db = require("../models");
const config = require("../config/auth.config");
const User = db.user;
const Role = db.role;

const Op = db.Sequelize.Op;

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { removeUpload } = require("../middleware/upload");
const { roleNames } = require("../middleware/access");

// La page d'inscription est publique : le jeton n'est donc pas exigé, mais s'il est présent on regarde si l'appelant est administrateur.
async function callerIsAdmin(req) {
  let token = req.headers["x-access-token"] || req.headers["authorization"];
  if (token && token.startsWith("Bearer ")) token = token.slice(7);
  if (!token) return false;
  try {
    const { id } = jwt.verify(token, config.secret);
    return (await roleNames(id)).includes("admin");
  } catch (e) {
    return false;
  }
}

exports.signup = async (req, res) => {
  try {
    // Sans précision, le compte est un compte consultant. Tout autre rôle (administrateur, évaluateur, modérateur, entreprise)
    // ne peut être attribué que par un administrateur connecté : avant, n'importe qui pouvait s'inscrire avec le rôle « admin ».
    const requested = Array.isArray(req.body.roles) && req.body.roles.length > 0 ? req.body.roles : ["consultant"];
    if (requested.some(name => name !== "consultant") && !(await callerIsAdmin(req))) {
      return res.status(403).send({ message: "Seul un administrateur peut attribuer ce rôle." });
    }

    const user = await User.create({
      username: req.body.username,
      email: req.body.email,
      password: bcrypt.hashSync(req.body.password, 8),
    });

    // Un seul rôle par utilisateur : on retient le premier demandé
    const roles = await Role.findAll({ where: { name: requested[0] } });
    await user.setRoles(roles);
    res.send({ message: "User registered successfully!" });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

exports.signin = async (req, res) => {
  try {
    const user = await User.findOne({
      where: {
        username: req.body.username,
      },
    });

    if (!user) {
      return res.status(404).send({ message: "User Not found." });
    }

    const passwordIsValid = bcrypt.compareSync(
      req.body.password,
      user.password
    );

    if (!passwordIsValid) {
      return res.status(401).send({
        message: "Invalid Password!",
      });
    }

    const token = jwt.sign({ id: user.id },
                           config.secret,
                           {
                            algorithm: 'HS256',
                            allowInsecureKeySizes: true,
                            expiresIn: 86400, // 24 hours
                           });

    let authorities = [];
    const roles = await user.getRoles();
    for (let i = 0; i < roles.length; i++) {
      authorities.push("ROLE_" + roles[i].name.toUpperCase());
    }

    req.session.token = token;

    // console.log(req.session.token)

    return res.status(200).send({
      id: user.id,
      username: user.username,
      email: user.email,
      photo: user.photo,
      roles: authorities,
      accessToken: token
    });
  } catch (error) {
    return res.status(500).send({ message: error.message });
  }
};

exports.signout = async (req, res) => {
  try {
    req.session = null;
    return res.status(200).send({
      message: "You've been signed out!"
    });
  } catch (err) {
    this.next(err);
  }
};

exports.updatePhoto = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      removeUpload('uploads/' + req.file.filename);
      return res.status(404).send({ message: "User Not found." });
    }
    const previous = user.photo;
    user.photo = 'uploads/' + req.file.filename;
    await user.save();
    removeUpload(previous);
    return res.status(200).send({ photo: user.photo });
  } catch (error) {
    removeUpload('uploads/' + req.file.filename);
    return res.status(500).send({ message: error.message });
  }
};
