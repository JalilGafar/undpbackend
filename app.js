const express = require("express");
const cookieSession = require("cookie-session");
const cors = require("cors");

const app = express();


const allowedOrigins = [
  'http://localhost:4200',
  'https://sdp-gyb-cmr.com',
  'https://www.sdp-gyb-cmr.com'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept',
                   'Origin', 'X-Requested-With']
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.enable('trust proxy');

app.use(
  cookieSession({
    name: "bezkoder-session",
    keys: ["COOKIE_SECRET"], // should use as secret environment variable
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    domain: '.sdp-gyb-cmr.com', // partage le cookie entre sous-domaines
    maxAge: 24 * 60 * 60 * 1000 // 24 heures
  })
);

// database
const db = require("./app/models");
const Role = db.role;

db.sequelize.sync();
// force: true will drop the table if it already exists
// db.sequelize.sync({force: true}).then(() => {
//   console.log('Drop and Resync Database with { force: true }');
//   initial();
// });

// simple route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to bezkoder application." });
});


const ConsultantRoute = require('./app/routes/consultant.routes')
const ManagerRoute = require('./app/routes/manager.routes')
const ToolsRoute = require('./app/routes/tools.routes')
const { verifyToken } = require('./app/middleware/authJwt');

// routes
require("./app/routes/auth.routes")(app);
require("./app/routes/user.routes")(app);

app.use('/api/consultant', [verifyToken], ConsultantRoute);
app.use('/api/manager', [verifyToken], ManagerRoute);
app.use('/api/tools', [verifyToken], ToolsRoute);


function initial() {
  Role.create({
    id: 1,
    name: "user",
  });

  Role.create({
    id: 2,
    name: "moderator",
  });

  Role.create({
    id: 3,
    name: "admin",
  });
}


module.exports = app;