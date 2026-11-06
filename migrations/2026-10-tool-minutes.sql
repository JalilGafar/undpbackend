-- Outil 1B « Minutes de réunion » : plusieurs minutes par (consultant, entreprise), chacune est un livrable.
-- Signatures tracées sur l'écran (image PNG en data URL) : une par participant, plus celle du consultant.
CREATE TABLE IF NOT EXISTS tool_minutes (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  cons_id                INT NOT NULL,
  comp_id                INT NOT NULL,
  etape                  TINYINT NOT NULL DEFAULT 1,
  date_reunion           DATE NOT NULL,
  lieu                   VARCHAR(255) NULL,
  objectif               TEXT NULL,
  ordre_jour             TEXT NULL,
  resultats              TEXT NULL,
  remarques              TEXT NULL,
  consultant_signature   MEDIUMTEXT NULL,
  date                   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_minutes_livrable (comp_id, cons_id)
);

CREATE TABLE IF NOT EXISTS tool_minutes_presents (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  minute_id   INT NOT NULL,
  position    INT NOT NULL DEFAULT 0,
  nom         VARCHAR(255) NOT NULL,
  contact     VARCHAR(255) NULL,
  en_ligne    TINYINT(1) NOT NULL DEFAULT 0,
  signature   MEDIUMTEXT NULL,
  INDEX idx_minutes_presents_minute (minute_id)
);
