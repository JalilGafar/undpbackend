-- Outil 1G « Cartographie des clients B2B » : une cartographie par couple (consultant, entreprise).
-- Montants saisis et stockés en FCFA ; le pourcentage par client est calculé à l'affichage.
CREATE TABLE IF NOT EXISTS cartographie_clients (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  cons_id              INT NOT NULL,
  comp_id              INT NOT NULL,
  date                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  date_cartographie    DATE NULL,
  UNIQUE KEY uq_cartographie (cons_id, comp_id),
  INDEX idx_cartographie_comp (comp_id)
);

CREATE TABLE IF NOT EXISTS cartographie_clients_lignes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  carto_id     INT NOT NULL,
  position     INT NOT NULL DEFAULT 0,
  client       VARCHAR(255) NULL,
  secteur      VARCHAR(255) NULL,
  contact      VARCHAR(255) NULL,
  adresse      VARCHAR(255) NULL,
  telephone    VARCHAR(50)  NULL,
  email        VARCHAR(255) NULL,
  produits     VARCHAR(255) NULL,
  montant_fcfa BIGINT NOT NULL DEFAULT 0,
  remarques    VARCHAR(1000) NULL,
  INDEX idx_carto_lignes_carto (carto_id)
);
