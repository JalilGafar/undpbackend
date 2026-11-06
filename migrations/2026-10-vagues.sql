-- Vagues du programme GYB (6 à 7 mois chacune) : une entreprise appartient à UNE seule vague.
-- Toutes les données d'outils s'y rattachent par entreprises.id (comp_id) : aucune table d'outil ne change.
-- À USAGE UNIQUE pour la partie ALTER (un 2e passage échoue : colonne déjà présente).
-- Vérifier d'abord : SHOW COLUMNS FROM entreprises LIKE 'id_vague';   (une ligne = déjà passé)

CREATE TABLE IF NOT EXISTS vagues (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nom         VARCHAR(100) NOT NULL,
  date_debut  DATE NULL,
  date_fin    DATE NULL,
  -- planifiee : pas commencée ; en_cours : active ; cloturee : saisies des consultants VERROUILLÉES (l'administrateur peut la rouvrir)
  statut      ENUM('planifiee','en_cours','cloturee') NOT NULL DEFAULT 'planifiee',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vagues_nom (nom)
);

-- Les entreprises existantes sont toutes placées dans « Vague 1 » ; l'administrateur les réaffecte ensuite depuis la plateforme.
INSERT INTO vagues (nom, statut) SELECT 'Vague 1', 'en_cours' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM vagues);

-- DEFAULT 1 = « Vague 1 » (créée ci-dessus, id 1) : une ancienne version du serveur qui insère une entreprise sans préciser la vague
-- continue de fonctionner pendant la mise en ligne. Les nouvelles routes précisent toujours la vague.
ALTER TABLE entreprises
  ADD COLUMN id_vague INT NOT NULL DEFAULT 1 AFTER id_consl,
  ADD KEY idx_entreprises_vague (id_vague),
  ADD CONSTRAINT fk_entreprises_vague FOREIGN KEY (id_vague) REFERENCES vagues (id);
