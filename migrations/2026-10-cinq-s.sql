-- Outil 5S « Mise en œuvre des 5S pour les PME » : deux évaluations par couple (consultant, entreprise), une initiale (étape 1)
-- et une finale (étape 4), sur la même fiche.
-- 5 « S » (1 Seiri, 2 Seiton, 3 Seiso, 4 Seiketsu, 5 Shitsuke) de 6 critères chacun, notés de 1 à 5.
-- Les scores (moyenne par S et note globale) sont calculés à l'affichage. Photos avant / après : plusieurs par évaluation (table
-- entreprise_5s_photos), fichiers protégés dans private/companies/<comp_id>/5s/ ; seul leur nom est en base.
CREATE TABLE IF NOT EXISTS entreprise_5s (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  cons_id          INT NOT NULL,
  comp_id          INT NOT NULL,
  phase            ENUM('initial','final') NOT NULL DEFAULT 'initial',
  date             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  responsable      VARCHAR(255) NULL,
  date_evaluation  DATE NULL,
  UNIQUE KEY uq_5s (cons_id, comp_id, phase),
  INDEX idx_5s_comp (comp_id)
);

CREATE TABLE IF NOT EXISTS entreprise_5s_notes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  diag_id       INT NOT NULL,
  s             TINYINT NOT NULL,
  critere       TINYINT NOT NULL,
  note          TINYINT NULL,
  observations  VARCHAR(1000) NULL,
  UNIQUE KEY uq_5s_note (diag_id, s, critere)
);

CREATE TABLE IF NOT EXISTS entreprise_5s_actions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  diag_id      INT NOT NULL,
  position     INT NOT NULL DEFAULT 0,
  s            TINYINT NULL,
  probleme     VARCHAR(500) NULL,
  action       VARCHAR(500) NULL,
  date_limite  DATE NULL,
  statut       ENUM('a_faire','en_cours','termine') NULL,
  resultat     VARCHAR(500) NULL,
  INDEX idx_5s_actions_diag (diag_id)
);

CREATE TABLE IF NOT EXISTS entreprise_5s_photos (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  diag_id     INT NOT NULL,
  slot        ENUM('avant','apres') NOT NULL,
  file        VARCHAR(100) NOT NULL,
  thumb       VARCHAR(100) NOT NULL,
  legend      VARCHAR(255) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_5s_photos_diag (diag_id, slot)
);
