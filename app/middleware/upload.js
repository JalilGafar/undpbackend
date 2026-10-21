const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');

// Fichiers publics (logos, photos de profil) : servis en statique sur /uploads
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
// Fichiers protégés (galerie des entreprises) : jamais servis en statique, uniquement via /api/gallery
const PRIVATE_DIR = path.join(__dirname, '..', '..', 'private');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PRIVATE_DIR, { recursive: true });

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const companyPublicDir = id => path.join(UPLOAD_DIR, 'companies', String(parseInt(id, 10) || 0));
const companyGalleryDir = id => path.join(PRIVATE_DIR, 'companies', String(parseInt(id, 10) || 0), 'gallery');

// Retourne un middleware (champ `field`) qui accepte une image jusqu'à 10 Mo, la redresse (EXIF),
// la redimensionne et l'enregistre en WebP sous <dir(req)>/<prefix(req)>-<horodatage>.webp.
// Ensuite req.file.path / req.file.filename désignent le fichier final (utilisable avec uploadRef).
//   resize : options de sharp.resize, ex. { width: 800, height: 800, fit: 'inside' }
//   dir(req) doit rester sous UPLOAD_DIR ; prefix(req) doit rester alphanumérique.
function imageUpload(field, prefix, dir = () => UPLOAD_DIR, resize = { width: 1024, height: 1024, fit: 'inside' }) {
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
        fileFilter: (req, file, cb) => cb(null, IMAGE_MIME.includes(file.mimetype))
    }).single(field);

    return function (req, res, next) {
        upload(req, res, async function (err) {
            if (err) {
                const tooBig = err.code === 'LIMIT_FILE_SIZE';
                res.status(tooBig ? 413 : 400).json({ message: tooBig ? "Image trop volumineuse (10 Mo maximum)." : "Échec de l'envoi." });
                return;
            }
            if (!req.file) {
                res.status(400).json({ message: "Format non supporté (JPG, PNG ou WEBP)." });
                return;
            }
            try {
                const targetDir = dir(req);
                await fs.promises.mkdir(targetDir, { recursive: true });
                const filename = `${prefix(req)}-${Date.now()}.webp`;
                const target = path.join(targetDir, filename);
                // rotate() applique l'orientation EXIF des photos de téléphone ; le WebP conserve la transparence des logos
                await sharp(req.file.buffer)
                    .rotate()
                    .resize({ ...resize, withoutEnlargement: resize.fit === 'inside' })
                    .webp({ quality: 82 })
                    .toFile(target);
                req.file.path = target;
                req.file.filename = filename;
                req.file.mimetype = 'image/webp';
                delete req.file.buffer;
                next();
            } catch (procErr) {
                console.log(procErr);
                res.status(400).json({ message: "Image illisible ou corrompue." });
            }
        });
    };
}

// Référence stockée en base pour un fichier téléversé : "uploads/<chemin relatif>"
function uploadRef(file) {
    return 'uploads/' + path.relative(UPLOAD_DIR, file.path).split(path.sep).join('/');
}

// Supprime un fichier référencé en base sous la forme "uploads/<chemin>" (sans effet sinon)
function removeUpload(ref) {
    if (!ref || !ref.startsWith('uploads/')) return;
    const target = path.resolve(UPLOAD_DIR, ref.slice('uploads/'.length));
    if (target.startsWith(UPLOAD_DIR + path.sep)) {
        fs.unlink(target, () => {});
    }
}

// Supprime tous les fichiers (logo + galerie) d'une entreprise
function removeCompanyFiles(id) {
    fs.rm(path.dirname(companyGalleryDir(id)), { recursive: true, force: true }, () => {});
    fs.rm(companyPublicDir(id), { recursive: true, force: true }, () => {});
}

module.exports = {
    UPLOAD_DIR, PRIVATE_DIR, imageUpload, uploadRef, removeUpload,
    companyPublicDir, companyGalleryDir, removeCompanyFiles
};
