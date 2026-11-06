-- Outil 1E_a « Diagnostic BPF » (bonnes pratiques de fabrication) : un seul passage par couple (consultant, entreprise).
-- Liste de contrôle de 92 exigences en 9 catégories ; chaque exigence reçoit des points (0 au maximum de l'exigence) ou « non applicable ».
-- Les points maximum sont définis dans le site (core/model/bpf-content.ts) et dans bpf.routes.js (BPF_MAX), PAS dans la base :
-- aucune colonne ENUM, donc rien à modifier ici si une valeur de réponse change. Seules les exigences renseignées sont enregistrées.
-- Rejouable sans danger (CREATE TABLE IF NOT EXISTS) ; ne touche à aucune table existante.
CREATE TABLE IF NOT EXISTS entreprise_bpf (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  cons_id             INT NOT NULL,
  comp_id             INT NOT NULL,
  date                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  date_evaluation     DATE NULL,
  remarques_generales TEXT NULL,
  UNIQUE KEY uq_bpf (cons_id, comp_id),
  INDEX idx_bpf_comp (comp_id)
);

-- Une ligne par exigence renseignée : points (NULL si non applicable ou seulement une remarque), na = 1 si non applicable
CREATE TABLE IF NOT EXISTS entreprise_bpf_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  diag_id       INT NOT NULL,
  item          TINYINT UNSIGNED NOT NULL,
  points        TINYINT UNSIGNED NULL,
  na            TINYINT(1) NOT NULL DEFAULT 0,
  observations  VARCHAR(1000) NULL,
  UNIQUE KEY uq_bpf_item (diag_id, item)
);

-- Principales conclusions et recommandations de chacune des 9 catégories
CREATE TABLE IF NOT EXISTS entreprise_bpf_categories (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  diag_id          INT NOT NULL,
  cat              TINYINT UNSIGNED NOT NULL,
  conclusions      TEXT NULL,
  recommandations  TEXT NULL,
  UNIQUE KEY uq_bpf_cat (diag_id, cat)
);

-- Actions prioritaires (liste ajoutable, 10 au plus)
CREATE TABLE IF NOT EXISTS entreprise_bpf_actions (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  diag_id   INT NOT NULL,
  position  INT NOT NULL DEFAULT 0,
  action    VARCHAR(1000) NOT NULL,
  INDEX idx_bpf_actions_diag (diag_id)
);
