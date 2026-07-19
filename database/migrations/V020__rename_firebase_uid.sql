-- V020: Limpeza residual do Firebase e renomeação para auth_uid
SET search_path TO sigweb, public;

-- Renomeia a coluna legada de ID do usuário
ALTER TABLE usuarios RENAME COLUMN firebase_uid TO auth_uid;
ALTER INDEX idx_usuarios_firebase_uid RENAME TO idx_usuarios_auth_uid;

-- Recria a função de hook do Supabase para usar a nova coluna
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  usuario_perfil text;
BEGIN
  SELECT perfil INTO usuario_perfil
  FROM sigweb.usuarios
  WHERE auth_uid = (event->>'user_id');

  claims := COALESCE(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{perfil}', to_jsonb(COALESCE(usuario_perfil, 'CIDADAO')));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
