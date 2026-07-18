-- V019: Migração de Firebase Auth/Storage para Supabase Auth/Storage
SET search_path TO sigweb, public;

-- firebase_uid passa a guardar o auth.users.id (UUID) emitido pelo GoTrue
-- do Supabase — coluna mantida (já era uma indireção, não o identificador
-- exposto), apenas troca o que ela referencia.

-- Renomeia colunas cujo nome remetia diretamente a Firebase/GCP
ALTER TABLE usuarios       RENAME COLUMN fcm_token   TO expo_push_token;
ALTER TABLE envios_sinter  RENAME COLUMN arquivo_gcs TO arquivo_storage;

-- Custom Access Token Hook: GoTrue chama esta função a cada emissão/refresh
-- de token e injeta o retorno como claims do JWT. Substitui o antigo
-- custom claim "perfil" setado via firebase-admin (setCustomUserClaims) —
-- agora sigweb.usuarios.perfil é a única fonte da verdade.
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
  WHERE firebase_uid = (event->>'user_id');

  claims := COALESCE(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{perfil}', to_jsonb(COALESCE(usuario_perfil, 'CIDADAO')));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

GRANT USAGE ON SCHEMA sigweb TO supabase_auth_admin;
GRANT SELECT ON sigweb.usuarios TO supabase_auth_admin;
