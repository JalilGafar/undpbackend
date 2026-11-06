-- Outil « Suivi et évaluation » (chaînes de valeur inclusives) : une saisie par (consultant, entreprise, phase).
-- Phase « initial » (étape 1, au démarrage) et phase « final » (étape 4, à la clôture), même questionnaire de 50 questions.
-- Les réponses sont enregistrées une ligne par réponse (une ligne par option cochée pour les questions à choix multiples) :
-- le questionnaire lui-même (libellés, options) est dans app/config/suivi.catalog.js.
CREATE TABLE IF NOT EXISTS entreprise_suivi (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  cons_id     INT NOT NULL,
  comp_id     INT NOT NULL,
  phase       VARCHAR(10) NOT NULL,
  date        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_suivi (cons_id, comp_id, phase),
  INDEX idx_suivi_comp (comp_id)
);

CREATE TABLE IF NOT EXISTS entreprise_suivi_reponses (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  suivi_id  INT NOT NULL,
  qkey      VARCHAR(20) NOT NULL,
  valeur    TEXT NOT NULL,
  INDEX idx_suivi_reponses (suivi_id, qkey)
);
