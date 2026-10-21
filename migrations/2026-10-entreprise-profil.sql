-- Outil 1L « Profil du participant » : un profil par couple (consultant, entreprise), comme les autres outils.
-- Les montants sont saisis et stockés en FCFA ; la conversion en USD est faite à l'affichage (managers).
CREATE TABLE IF NOT EXISTS entreprise_profil (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  cons_id                INT NOT NULL,
  comp_id                INT NOT NULL,
  date                   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- 1. Informations générales
  representant           VARCHAR(255) NULL,
  telephone              VARCHAR(50)  NULL,
  adresse                VARCHAR(255) NULL,
  email                  VARCHAR(255) NULL,
  activite               VARCHAR(255) NULL,
  annees_activite        VARCHAR(50)  NULL,
  date_reunion           DATE NULL,
  organisation           VARCHAR(100) NULL,

  -- 2. Effectif (le nombre d'hommes est calculé : total - femmes)
  effectif_total         INT NULL,
  effectif_femmes        INT NULL,

  -- 3. Niveaux d'études (chef d'entreprise : oui/non ; femmes et hommes : nombre de personnes)
  etude_secondaire_chef    TINYINT(1) NULL,
  etude_secondaire_femmes  INT NULL,
  etude_secondaire_hommes  INT NULL,
  etude_universite_chef    TINYINT(1) NULL,
  etude_universite_femmes  INT NULL,
  etude_universite_hommes  INT NULL,
  etude_autre_chef         TINYINT(1) NULL,
  etude_autre_femmes       INT NULL,
  etude_autre_hommes       INT NULL,
  etude_autre_precision    VARCHAR(255) NULL,

  -- 4. Type d'entreprise : familiale | independante | cooperative
  type_entreprise        VARCHAR(20) NULL,

  -- 5. Statut juridique et finances
  enregistrement_fiscal  TINYINT(1) NULL,
  type_facturation       VARCHAR(20) NULL,   -- manuelle | electronique | aucune
  compte_bancaire        TINYINT(1) NULL,
  suivi_ca               TINYINT(1) NULL,

  -- 6. Ventes et marketing (les lignes produit / volume sont dans entreprise_profil_ventes)
  clients_reguliers      INT NULL,
  canaux_vente           VARCHAR(120) NULL,  -- liste séparée par des virgules : marches,en_ligne,entreprises,domicile,autre
  type_clientele         VARCHAR(20) NULL,   -- grand_public | particuliers | entreprises | autre
  commentaires_marche    TEXT NULL,

  -- 7. Soutien institutionnel
  soutien_programme      TINYINT(1) NULL,
  soutien_nom            VARCHAR(255) NULL,
  subvention_recue       TINYINT(1) NULL,

  UNIQUE KEY uq_entreprise_profil (cons_id, comp_id),
  INDEX idx_entreprise_profil_comp (comp_id)
);

CREATE TABLE IF NOT EXISTS entreprise_profil_ventes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  profil_id   INT NOT NULL,
  position    INT NOT NULL DEFAULT 0,
  produit     VARCHAR(255) NULL,
  volume_fcfa BIGINT NOT NULL DEFAULT 0,
  INDEX idx_profil_ventes_profil (profil_id)
);
