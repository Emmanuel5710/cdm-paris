-- Run in Supabase SQL Editor
-- Vérification et création des colonnes credits et xp si absentes

-- 1. Créer les colonnes si elles n'existent pas
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits integer DEFAULT 500;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp integer DEFAULT 0;

-- 2. Mettre à jour les valeurs NULL
UPDATE profiles SET credits = 500 WHERE credits IS NULL;
UPDATE profiles SET xp = 0 WHERE xp IS NULL;

-- 3. Vérification : doit retourner toutes les lignes avec credits et xp non NULL
SELECT id, username, credits, xp FROM profiles LIMIT 10;
