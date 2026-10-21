-- Galerie d'images par entreprise (fichiers dans BackUndp/private/companies/<id>/gallery, jamais servis en statique).
CREATE TABLE IF NOT EXISTS entreprise_images (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  comp_id     INT NOT NULL,
  file        VARCHAR(120) NOT NULL,
  thumb       VARCHAR(120) NOT NULL,
  category    VARCHAR(20)  NOT NULL DEFAULT 'autre',
  stage       VARCHAR(10)  NOT NULL DEFAULT 'initiale',
  legend      VARCHAR(255) NULL,
  uploaded_by INT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entreprise_images_comp (comp_id)
);
