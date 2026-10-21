-- Diagnostic intégral (outil 1D) — nouvelle matrice : 60 questions notées de 1 à 5.
--   Réponses : 1 Insuffisant · 2 À améliorer · 3 Suffisant · 4 Bon · 5 Excellent.
--   Questions 1 à 60 (reper), puis rubriques SWOT : 61 difficultés, 62 forces, 63 faiblesses, 64 besoins.
--   Les colonnes note_61 / note_62 / comt_61 / comt_62 de matrice_diag_integral_note ne sont plus utilisées.
--
-- ⚠ À EXÉCUTER UNE SEULE FOIS, avant de déployer le code. Les anciens diagnostics (échelle 0–10, anciennes
-- questions) sont ARCHIVÉS (tables *_archive), puis retirés des tables actives. Un second passage s'arrête
-- sur la première instruction (la table d'archive existe déjà), ce qui protège les nouvelles données.
SET NAMES utf8mb4;

-- 1. Archivage des anciennes données et des anciens libellés
CREATE TABLE matrice_diag_integral_note_archive LIKE matrice_diag_integral_note;
INSERT INTO matrice_diag_integral_note_archive SELECT * FROM matrice_diag_integral_note;
CREATE TABLE matrice_diag_integral_archive LIKE matrice_diag_integral;
INSERT INTO matrice_diag_integral_archive SELECT * FROM matrice_diag_integral;

DELETE FROM matrice_diag_integral_note;
DELETE FROM matrice_diag_integral;

-- 2. Nouvelles questions (reper 1 à 60)
INSERT INTO matrice_diag_integral (id_diaginteg, domaine, reper, libele) VALUES
  (1, 'Situation juridique et fiscale', 1, 'Dans quelle mesure le dirigeant connaît-il les exigences nécessaires au bon fonctionnement de l’entreprise ?'),
  (2, 'Situation juridique et fiscale', 2, 'Dans quelle mesure les conditions nécessaires au fonctionnement de l’entreprise sont-elles remplies ?'),
  (3, 'Situation juridique et fiscale', 3, 'Dans quelle mesure l’entreprise respecte-t-elle ses obligations fiscales et ses obligations de déclaration ?'),
  (4, 'Situation juridique et fiscale', 4, 'Dans quelle mesure l’entreprise respecte-t-elle la réglementation du travail ?'),
  (5, 'Leadership et climat organisationnel', 5, 'Le travail est vraiment passionnant, les employés l’apprécient.'),
  (6, 'Leadership et climat organisationnel', 6, 'Les collaborateurs semblent fiers de l’entreprise.'),
  (7, 'Leadership et climat organisationnel', 7, 'Les employés s’investissent pleinement dans leur travail.'),
  (8, 'Leadership et climat organisationnel', 8, 'Le propriétaire/dirigeant communique régulièrement avec ses subordonnés au sujet des projets à venir.'),
  (9, 'Leadership et climat organisationnel', 9, 'Le propriétaire/dirigeant s’intéresse aux nouvelles solutions plus efficaces qui profitent à l’entreprise et aux collaborateurs.'),
  (10, 'Leadership et climat organisationnel', 10, 'Le propriétaire/dirigeant fait preuve d’ouverture d’esprit et communique efficacement avec le personnel.'),
  (11, 'Leadership et climat organisationnel', 11, 'Le ou les dirigeants savent déléguer et convaincre leurs collaborateurs de la manière de procéder et des raisons qui motivent leurs choix.'),
  (12, 'Leadership et climat organisationnel', 12, 'Le travail est axé sur la réalisation des objectifs.'),
  (13, 'Organisation de l\'entreprise', 13, 'L’entreprise dispose d’une structure organisationnelle claire (organigramme) (même si elle n’est pas documentée).'),
  (14, 'Organisation de l\'entreprise', 14, 'L’entreprise dispose d’une procédure permettant d’élaborer la structure organisationnelle.'),
  (15, 'Organisation de l\'entreprise', 15, 'Les rôles et responsabilités du personnel sont consignés par écrit.'),
  (16, 'Organisation de l\'entreprise', 16, 'L’entreprise dispose de procédures pour la sélection, le recrutement et la formation des salariés.'),
  (17, 'Organisation de l\'entreprise', 17, 'L’entreprise dispose d’un système de rémunération qui garantit une rémunération équitable en argent et d’autres incitations.'),
  (18, 'Organisation de l\'entreprise', 18, 'Les travailleurs, les employés et les cadres possèdent les compétences requises pour les fonctions qu’ils exercent.'),
  (19, 'Organisation de l\'entreprise', 19, 'L’entreprise dispose d’un système de communication permettant de transmettre les consignes de travail au sein de l’entreprise.'),
  (20, 'Organisation de l\'entreprise', 20, 'Le propriétaire de l’entreprise ou un collaborateur en charge des ressources humaines s’intéresse aux besoins du personnel.'),
  (21, 'Finance et Comptabilité', 21, 'Dans quelle mesure les opérations de l’entreprise sont-elles enregistrées à des fins comptables ?'),
  (22, 'Finance et Comptabilité', 22, 'Quel pourcentage des produits/services de l’entreprise a fait l’objet d’une analyse visant à déterminer leur coût exact ?'),
  (23, 'Finance et Comptabilité', 23, 'Un budget ou des prévisions de base ont été établis pour l’année en cours.'),
  (24, 'Finance et Comptabilité', 24, 'L’entreprise a la possibilité d’accéder à des crédits.'),
  (25, 'Finance et Comptabilité', 25, 'L’entreprise accorde des crédits à ses principaux clients.'),
  (26, 'Finance et Comptabilité', 26, 'Les fournisseurs accordent des crédits à l’entreprise et une comptabilité rigoureuse est tenue.'),
  (27, 'Finance et Comptabilité', 27, 'La comptabilité est correctement tenue et donne une image fidèle des résultats.'),
  (28, 'Finance et Comptabilité', 28, 'En cas de bénéfices, des primes sont versées aux salariés.'),
  (29, 'Planification Stratégique', 29, 'L’entreprise dispose d’un plan qui aide à orienter ses activités (même s’il n’est pas écrit ni documenté).'),
  (30, 'Planification Stratégique', 30, 'Ce plan fournit des éléments d’analyse permettant de prendre des décisions opérationnelles.'),
  (31, 'Planification Stratégique', 31, 'Le plan définit des indicateurs et des objectifs clairs (même s’il n’est pas rédigé ou documenté).'),
  (32, 'Planification Stratégique', 32, 'Lors de l’élaboration de ce plan, les éléments suivants ont été pris en compte : les forces, les faiblesses, les opportunités et les menaces. Cela constitue la base pour développer des stratégies.'),
  (33, 'Planification Stratégique', 33, 'Dans quelle mesure le secteur de marché dans lequel l’entreprise exerce ses activités est-il analysé ?'),
  (34, 'Planification Stratégique', 34, 'Les activités mises en place permettent d’atteindre les objectifs du plan de travail.'),
  (35, 'Planification Stratégique', 35, 'Le budget est établi en tenant compte du plan de travail.'),
  (36, 'Production et Opérations', 36, 'L’activité de l’entreprise reste dynamique et en croissance.'),
  (37, 'Production et Opérations', 37, 'Les produits et services répondent aux besoins et aux attentes identifiés des clients.'),
  (38, 'Production et Opérations', 38, 'Le parc de machines et d’équipements dont dispose l’entreprise est suffisant pour répondre à la demande de produits ou de services.'),
  (39, 'Production et Opérations', 39, 'Les installations sont suffisantes et adaptées au développement des activités de l’entreprise.'),
  (40, 'Production et Opérations', 40, 'L’entreprise sait où s’approvisionner en matières premières aux meilleurs prix.'),
  (41, 'Production et Opérations', 41, 'Les achats sont effectués en fonction des prévisions de ventes.'),
  (42, 'Production et Opérations', 42, 'L’entreprise met en place des contrôles écrits et systématiques des processus de production.'),
  (43, 'Production et Opérations', 43, 'La capacité installée de l’entreprise est pleinement exploitée.'),
  (44, 'Assurance Qualité', 44, 'L’entreprise applique des mesures d’assurance qualité (même si elle ne dispose pas d’un protocole écrit).'),
  (45, 'Assurance Qualité', 45, 'L’entreprise a formalisé (procédures opérationnelles standardisées écrites) la manière dont la qualité de ses produits/services est évaluée.'),
  (46, 'Assurance Qualité', 46, 'Lors de la production ou de la prestation d’un service, l’entreprise effectue des contrôles systématiques afin de s’assurer du respect constant des procédures de qualité écrites.'),
  (47, 'Assurance Qualité', 47, 'Les résultats du processus sont analysés afin de détecter les changements et d’apporter les corrections nécessaires.'),
  (48, 'Assurance Qualité', 48, 'L’entreprise dispose d’un système d’enregistrement et de gestion des informations relatives aux opérations, aux documents ou à d’autres informations importantes.'),
  (49, 'Assurance Qualité', 49, 'Dans quelle mesure l’entreprise a-t-elle établi que la qualité est l’une des priorités de son activité ?'),
  (50, 'Assurance Qualité', 50, 'Les produits et services de l’entreprise sont conformes aux normes techniques.'),
  (51, 'Commercialisation', 51, 'Les ventes ont augmenté par rapport à l’année précédente.'),
  (52, 'Commercialisation', 52, 'Dans quelle mesure les segments de marché desservis par l’entreprise ont-ils été identifiés ?'),
  (53, 'Commercialisation', 53, 'Niveau de connaissance et de satisfaction des clients professionnels, de leurs goûts, de leurs besoins et de leurs motivations d’achat des produits/services.'),
  (54, 'Commercialisation', 54, 'L’entreprise sait si ses clients sont satisfaits de ses produits/services.'),
  (55, 'Commercialisation', 55, 'Les prix de vente sont fixés en fonction du marché.'),
  (56, 'Commercialisation', 56, 'Les responsables commerciaux sont correctement formés.'),
  (57, 'Commercialisation', 57, 'L’entreprise dispose d’un profil actif sur les réseaux sociaux, utilisé pour promouvoir son activité.'),
  (58, 'Commercialisation', 58, 'Dans quelle mesure le système de distribution de l’entreprise est-il efficace ?'),
  (59, 'Commercialisation', 59, 'Dans quelle mesure la concurrence est-elle connue, en particulier ses faiblesses et ses points forts ?'),
  (60, 'Commercialisation', 60, 'L’entreprise dispose d’un plan marketing, qui est élaboré, mis en œuvre et évalué.');

-- 3. Rubriques SWOT reprises de l'archive, renumérotées 61 à 64 (anciennement 63 à 66)
INSERT INTO matrice_diag_integral (id_diaginteg, domaine, reper, libele)
  SELECT reper - 2, domaine, reper - 2, libele FROM matrice_diag_integral_archive WHERE reper >= 63;
