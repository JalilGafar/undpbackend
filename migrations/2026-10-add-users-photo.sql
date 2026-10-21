-- Photo de profil des utilisateurs (fichier dans BackUndp/uploads, valeur "uploads/<fichier>").
-- À exécuter AVANT de déployer le backend : le modèle Sequelize User lit cette colonne.
ALTER TABLE users ADD COLUMN photo VARCHAR(100) NULL;
