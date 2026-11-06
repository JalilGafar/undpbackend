-- Outil 1K « Diagnostic d'image commerciale » : un diagnostic par couple (consultant, entreprise), comme 1L et 1J.
-- 11 éléments fixes (numérotés de 1 à 11) ; seuls les éléments renseignés sont enregistrés.
CREATE TABLE IF NOT EXISTS entreprise_image_com (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  cons_id             INT NOT NULL,
  comp_id             INT NOT NULL,
  date                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  remarques_generales TEXT NULL,
  UNIQUE KEY uq_image_com (cons_id, comp_id),
  INDEX idx_image_com_comp (comp_id)
);

CREATE TABLE IF NOT EXISTS entreprise_image_com_elements (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  diag_id       INT NOT NULL,
  element       TINYINT NOT NULL,
  existe        ENUM('oui','non','partiellement') NULL,
  situation     ENUM('bonne','moyenne','mediocre') NULL,
  besoin        TINYINT(1) NULL,
  observations  VARCHAR(1000) NULL,
  UNIQUE KEY uq_image_com_element (diag_id, element)
);
