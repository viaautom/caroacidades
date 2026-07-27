-- V022: Criação da tabela de anotações
SET search_path TO sigweb, public;

CREATE TABLE IF NOT EXISTS anotacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topico TEXT NOT NULL,
  auth_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome_autor TEXT,
  implementado BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Concede permissões para as roles usuais do PostgREST/Supabase
GRANT ALL ON anotacoes TO authenticated, service_role, postgres;
