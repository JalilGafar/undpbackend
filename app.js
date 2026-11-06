const express = require("express");
const path = require("path");
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


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json({ limit: "3mb" }));   // les minutes de réunion portent des signatures (images en data URL)
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

// Sans catch, un échec de connexion à la base ferait planter tout le processus (rejet non géré)
db.sequelize.sync().catch(err => console.log('Sequelize sync failed :', err.message));
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
const GalleryRoute = require('./app/routes/gallery.routes')
const ProfilRoute = require('./app/routes/profil.routes')
const CartographieRoute = require('./app/routes/cartographie.routes')
const ProductiviteRoute = require('./app/routes/productivite.routes')
const ImageCommercialeRoute = require('./app/routes/image-commerciale.routes')
const CinqSRoute = require('./app/routes/cinq-s.routes')
const BpfRoute = require('./app/routes/bpf.routes')
const FinanceRoute = require('./app/routes/finance.routes')
const QuickwinsRoute = require('./app/routes/quickwins.routes')
const SuiviRoute = require('./app/routes/suivi.routes')
const MinutesRoute = require('./app/routes/minutes.routes')
const ReviewsRoute = require('./app/routes/reviews.routes')
const VaguesRoute = require('./app/routes/vagues.routes')
const UsersRoute = require('./app/routes/users.routes')
const { verifyToken } = require('./app/middleware/authJwt');

// routes
require("./app/routes/auth.routes")(app);
require("./app/routes/user.routes")(app);

app.use('/api/consultant', [verifyToken], ConsultantRoute);
app.use('/api/manager', [verifyToken], ManagerRoute);
app.use('/api/tools', [verifyToken], ToolsRoute);
app.use('/api/gallery', [verifyToken], GalleryRoute);
app.use('/api/profil', [verifyToken], ProfilRoute);
app.use('/api/cartographie', [verifyToken], CartographieRoute);
app.use('/api/productivite', [verifyToken], ProductiviteRoute);
app.use('/api/image-commerciale', [verifyToken], ImageCommercialeRoute);
app.use('/api/cinq-s', [verifyToken], CinqSRoute);
app.use('/api/bpf', [verifyToken], BpfRoute);
app.use('/api/finance', [verifyToken], FinanceRoute);
app.use('/api/quickwins', [verifyToken], QuickwinsRoute);
app.use('/api/suivi', [verifyToken], SuiviRoute);
app.use('/api/minutes', [verifyToken], MinutesRoute);
app.use('/api/reviews', [verifyToken], ReviewsRoute);
app.use('/api/vagues', [verifyToken], VaguesRoute);
app.use('/api/users', [verifyToken], UsersRoute);


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