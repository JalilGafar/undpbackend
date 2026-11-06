-- Évaluation des livrables par les managers / modérateurs : une évaluation (mention + commentaire) par évaluateur et par livrable.
-- Un livrable = un outil (tool_code) rempli par un consultant (cons_id) pour une entreprise (comp_id).
-- Exception : pour les minutes de réunion (t1b), chaque minute est un livrable ; item_id = id de la minute (0 pour les autres outils).
CREATE TABLE IF NOT EXISTS livrable_reviews (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  comp_id      INT NOT NULL,
  cons_id      INT NOT NULL,
  tool_code    VARCHAR(20) NOT NULL,
  item_id      INT NOT NULL DEFAULT 0,
  reviewer_id  INT NOT NULL,
  status       ENUM('valide','a_ameliorer') NOT NULL,
  comment      TEXT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review (comp_id, cons_id, tool_code, item_id, reviewer_id),
  INDEX idx_review_livrable (comp_id, cons_id, tool_code, item_id)
);

-- Dernière consultation des évaluations par le consultant auteur du livrable : sert à signaler les nouvelles évaluations.
CREATE TABLE IF NOT EXISTS livrable_review_seen (
  comp_id    INT NOT NULL,
  cons_id    INT NOT NULL,
  tool_code  VARCHAR(20) NOT NULL,
  item_id    INT NOT NULL DEFAULT 0,
  seen_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comp_id, cons_id, tool_code, item_id)
);
