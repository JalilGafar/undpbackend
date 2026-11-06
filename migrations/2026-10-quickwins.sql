-- Outil transversal « Registre des Quick Wins » : un registre par (consultant, entreprise, étape de 1 à 4), chaque registre est un livrable
-- (codes d'outil tqw1 à tqw4). Les actions d'amélioration sont des lignes du registre.
CREATE TABLE IF NOT EXISTS entreprise_quickwins (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  cons_id       INT NOT NULL,
  comp_id       INT NOT NULL,
  etape         TINYINT NOT NULL,
  date_debut    DATE NULL,
  docs_crees    TEXT NULL,
  docs_partages TEXT NULL,
  date          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_quickwins (cons_id, comp_id, etape),
  INDEX idx_quickwins_comp (comp_id)
);

CREATE TABLE IF NOT EXISTS entreprise_quickwins_actions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  registre_id  INT NOT NULL,
  position     INT NOT NULL DEFAULT 0,
  action       TEXT NULL,
  domaine      VARCHAR(100) NULL,
  responsable  VARCHAR(255) NULL,
  echeance     DATE NULL,
  statut       VARCHAR(20) NOT NULL DEFAULT 'a_faire',
  indicateur   VARCHAR(255) NULL,
  valeur_avant VARCHAR(100) NULL,
  valeur_apres VARCHAR(100) NULL,
  commentaires TEXT NULL,
  INDEX idx_quickwins_actions_registre (registre_id)
);
