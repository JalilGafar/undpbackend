-- Outil 1B « Minutes de réunion » — nouvelle fiche « Compte rendu de réunion » :
-- n° de réunion, heures de début et de fin, discussion, tableau d'engagements, poste de chaque participant.
-- À USAGE UNIQUE, après 2026-10-tool-minutes.sql (un 2e passage échoue : colonnes déjà présentes).
-- Les colonnes existantes sont conservées et gardent leur contenu : objectif = « Sujet principal »,
-- resultats = « Accords et décisions », remarques = « Observations et commentaires ».
ALTER TABLE tool_minutes
  ADD COLUMN numero      INT  NULL AFTER etape,
  ADD COLUMN heure_debut TIME NULL AFTER date_reunion,
  ADD COLUMN heure_fin   TIME NULL AFTER heure_debut,
  ADD COLUMN discussion  TEXT NULL AFTER ordre_jour;

ALTER TABLE tool_minutes_presents
  ADD COLUMN poste VARCHAR(255) NULL AFTER nom;

CREATE TABLE IF NOT EXISTS tool_minutes_engagements (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  minute_id   INT NOT NULL,
  position    INT NOT NULL DEFAULT 0,
  tache       TEXT NULL,
  responsable VARCHAR(255) NULL,
  echeance    DATE NULL,
  INDEX idx_minutes_engagements_minute (minute_id)
);
