-- V021: Adiciona perfil DESENVOLVEDOR
SET search_path TO sigweb, public;

DO $$ 
DECLARE
  c_name text;
BEGIN
  -- Tenta achar e remover a constraint atual de check do perfil
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'usuarios'::regclass 
    AND contype = 'c' 
    AND pg_get_constraintdef(oid) LIKE '%perfil%';

  IF c_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE usuarios DROP CONSTRAINT ' || quote_ident(c_name);
  END IF;
END $$;

-- Adiciona a nova constraint com o perfil DESENVOLVEDOR
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_perfil_check 
  CHECK (perfil IN ('DESENVOLVEDOR', 'ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO', 'CIDADAO'));
