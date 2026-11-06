-- Outil « Analyse financière » (3H) : une analyse par couple (consultant, entreprise), saisie mensuelle sur l'année.
-- Montants saisis et stockés en FCFA (entiers) ; la conversion en USD et le compte de résultat sont calculés à l'affichage.
CREATE TABLE IF NOT EXISTS entreprise_finance (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  cons_id     INT NOT NULL,
  comp_id     INT NOT NULL,
  date        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  annee       SMALLINT NULL,
  taux_impot  DECIMAL(5,2) NULL,
  UNIQUE KEY uq_finance (cons_id, comp_id),
  INDEX idx_finance_comp (comp_id)
);

-- Une ligne = un poste (ex. « Loyer des locaux ») avec ses 12 montants mensuels.
-- code : identifiant du poste prédéfini ; libelle : nom d'un poste ajouté par le consultant (ou poste prédéfini renommé).
CREATE TABLE IF NOT EXISTS entreprise_finance_lignes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  finance_id  INT NOT NULL,
  section     ENUM('ventes','autres_revenus','materiaux','main_oeuvre','frais_vente','frais_admin','financier') NOT NULL,
  position    INT NOT NULL DEFAULT 0,
  code        VARCHAR(40) NULL,
  libelle     VARCHAR(255) NULL,
  m01 BIGINT NOT NULL DEFAULT 0, m02 BIGINT NOT NULL DEFAULT 0, m03 BIGINT NOT NULL DEFAULT 0, m04 BIGINT NOT NULL DEFAULT 0,
  m05 BIGINT NOT NULL DEFAULT 0, m06 BIGINT NOT NULL DEFAULT 0, m07 BIGINT NOT NULL DEFAULT 0, m08 BIGINT NOT NULL DEFAULT 0,
  m09 BIGINT NOT NULL DEFAULT 0, m10 BIGINT NOT NULL DEFAULT 0, m11 BIGINT NOT NULL DEFAULT 0, m12 BIGINT NOT NULL DEFAULT 0,
  INDEX idx_finance_lignes_finance (finance_id)
);
