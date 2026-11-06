-- Diagnostic d'image commerciale (outil 1K) : nouvelle réponse « Non applicable » pour la situation actuelle d'un élément.
--   Valeurs enregistrées : bonne, moyenne (affichée « Passable »), mediocre, non_applicable.
--   La valeur est AJOUTÉE à la fin de la liste : les diagnostics déjà saisis ne changent pas.
--
-- ⚠ À exécuter AVANT d'envoyer le nouveau image-commerciale.routes.js (sinon l'enregistrement d'un « Non applicable » est refusé par la base).
-- Sans danger si exécuté deux fois. Vérifier : SHOW COLUMNS FROM entreprise_image_com_elements LIKE 'situation';
ALTER TABLE entreprise_image_com_elements
  MODIFY situation ENUM('bonne','moyenne','mediocre','non_applicable') NULL;
