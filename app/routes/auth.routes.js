const { verifySignUp, authJwt } = require("../middleware");
const { imageUpload } = require("../middleware/upload");
const controller = require("../controllers/auth.controller");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  app.post(
    "/api/auth/signup",
    [
      verifySignUp.checkDuplicateUsernameOrEmail,
      verifySignUp.checkRolesExisted
    ],
    controller.signup
  );

  app.post("/api/auth/signin", controller.signin);

  app.post("/api/auth/signout", controller.signout);

  app.post(
    "/api/auth/photo",
    [authJwt.verifyToken, imageUpload("photo", req => "u" + req.userId, undefined, { width: 512, height: 512, fit: "cover" })],
    controller.updatePhoto
  );
};
