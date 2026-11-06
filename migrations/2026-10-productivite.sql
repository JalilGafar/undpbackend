-- Outil 1J « Profil de productivité » : un profil par couple (consultant, entreprise), comme 1L et 1G.
-- Les montants sont saisis et stockés en FCFA ; la conversion en USD est faite à l'affichage (managers).
CREATE TABLE IF NOT EXISTS entreprise_productivite (
  id                          INT AUTO_INCREMENT PRIMARY KEY,
  cons_id                     INT NOT NULL,
  comp_id                     INT NOT NULL,
  date                        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- 1. Produits (le détail des lignes est dans entreprise_productivite_produits)
  nb_gammes                   INT NULL,
  nb_variantes                INT NULL,

  -- 2. Volumes de production
  production_quotidienne      VARCHAR(255) NULL,
  heures_par_jour             DECIMAL(4,1) NULL,
  jours_par_semaine           TINYINT NULL,
  mois_par_an                 TINYINT NULL,
  capacite_utilisee_pct       TINYINT NULL,
  production_type             ENUM('stock','commande','les_deux') NULL,

  -- 3. Installations et équipements
  surface_m2                  DECIMAL(10,1) NULL,
  propriete                   ENUM('propriete','location') NULL,
  nb_machines_cles            INT NULL,
  machine_principale          VARCHAR(255) NULL,
  jours_perdus_mois           DECIMAL(4,1) NULL,

  -- 4. Effectif
  effectif_production         INT NULL,
  effectif_temps_plein        INT NULL,
  effectif_temps_partiel      INT NULL,
  formes_securite             TINYINT(1) NULL,
  nb_formes_securite          INT NULL,
  lacune_competences          VARCHAR(500) NULL,

  -- 5. Goulets d'étranglement et saisonnalité
  saisonnalite                TINYINT(1) NULL,
  saisonnalite_detail         VARCHAR(500) NULL,
  goulot                      VARCHAR(500) NULL,
  augmentation_possible_pct   INT NULL,
  commandes_refusees          TINYINT(1) NULL,
  commandes_refusees_fcfa     BIGINT NULL,
  certifications              VARCHAR(500) NULL,

  UNIQUE KEY uq_productivite (cons_id, comp_id),
  INDEX idx_productivite_comp (comp_id)
);

CREATE TABLE IF NOT EXISTS entreprise_productivite_produits (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  prod_id         INT NOT NULL,
  position        INT NOT NULL DEFAULT 0,
  produit         VARCHAR(255) NULL,
  volume_mensuel  VARCHAR(100) NULL,
  valeur_fcfa     BIGINT NOT NULL DEFAULT 0,
  INDEX idx_productivite_produits_prod (prod_id)
);
