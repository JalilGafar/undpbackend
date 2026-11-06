-- Rôles et évaluation des livrables par instance.
--  - Nouveau rôle « evaluateur » (RBLAC). L'administrateur évalue au nom du Bureau Pays, l'évaluateur au nom du RBLAC ;
--    le modérateur peut commenter un livrable mais pas l'évaluer.
--  - livrable_reviews : la mention devient facultative (vide = simple commentaire) et la colonne `instance` garde
--    l'instance au nom de laquelle l'avis a été écrit. Elle est posée par le serveur d'après le rôle de l'auteur ; un changement
--    de rôle ultérieur ne réécrit donc pas l'historique.
-- À USAGE UNIQUE pour la partie ALTER (un 2e passage échoue : colonne déjà présente).
-- Vérifier d'abord : SHOW COLUMNS FROM livrable_reviews LIKE 'instance';   (une ligne = déjà passé)
-- ⚠ IRRÉVERSIBLE pour les avis des modérateurs : EXPORTER d'abord la table livrable_reviews (phpMyAdmin → Exporter).

-- roles.id n'est pas auto-incrémenté : l'identifiant est le plus grand existant + 1 (5 si la table contient admin, moderator, consultant, entreprise).
INSERT INTO roles (id, name, createdAt, updatedAt)
SELECT (SELECT COALESCE(MAX(r.id), 0) + 1 FROM roles r), 'evaluateur', NOW(), NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'evaluateur');

ALTER TABLE livrable_reviews
  MODIFY status ENUM('valide','a_ameliorer') NULL,
  ADD COLUMN instance ENUM('bureau_pays','rblac') NULL AFTER status;

-- Avis déjà donnés par les administrateurs : Bureau Pays
UPDATE livrable_reviews r
  JOIN user_roles ur ON ur.userId = r.reviewer_id
  JOIN roles ro ON ro.id = ur.roleId
SET r.instance = 'bureau_pays'
WHERE ro.name = 'admin';

-- Avis déjà donnés par les modérateurs : la mention est retirée, le commentaire reste (un modérateur ne peut plus évaluer)
UPDATE livrable_reviews r
  JOIN user_roles ur ON ur.userId = r.reviewer_id
  JOIN roles ro ON ro.id = ur.roleId
SET r.status = NULL
WHERE ro.name = 'moderator';

-- Un avis de modérateur sans commentaire n'était qu'une mention : il n'a plus de contenu
DELETE FROM livrable_reviews WHERE status IS NULL AND (comment IS NULL OR TRIM(comment) = '');
