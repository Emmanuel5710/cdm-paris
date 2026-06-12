-- Réponses HTTP des appels pg_net (vérifie si check-matches répond OK)
SELECT id, status_code, content::text
FROM net._http_response
ORDER BY id DESC
LIMIT 5;
