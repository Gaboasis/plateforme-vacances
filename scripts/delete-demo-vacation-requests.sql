-- Supprime toutes les demandes de congés du compte démonstration (demo-visite).
DELETE FROM "VacationRequest" WHERE "educatorId" = 'demo-visite';
