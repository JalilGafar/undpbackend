-- Diagnostic général (outil 1D) — « champ des recommandations » : principales conclusions et lacunes, recommandations,
-- tableau des problèmes identifiés (page Résumé de l'outil original). Tout est facultatif.
--   Stockage : une colonne de texte JSON sur la ligne du diagnostic (une ligne par consultant et entreprise), donc le
--   transfert d'une entreprise à un autre consultant et la suppression d'une entreprise s'appliquent sans autre changement.
--   Les diagnostics déjà enregistrés gardent « recommandations » à NULL (aucune recommandation saisie).
--
-- ⚠ À EXÉCUTER UNE SEULE FOIS, avant de déployer le code. Un second passage échoue sur « Duplicate column name » :
-- c'est sans danger, la colonne existe déjà. Vérifier d'abord : SHOW COLUMNS FROM matrice_diag_integral_note LIKE 'recommandations';
ALTER TABLE matrice_diag_integral_note ADD COLUMN recommandations MEDIUMTEXT NULL AFTER besoin_3;
