-- V025: Tabela de CUB (Custo Unitário Básico) para o módulo PGV (item 26
-- do edital) — valores de referência por padrão construtivo/tipologia,
-- usados na homogeneização de amostras.
SET search_path TO sigweb, public;

CREATE TABLE cub_tabela (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipologia           VARCHAR(100) NOT NULL,
  tipo_estrutura      VARCHAR(50),
  padrao_construtivo  VARCHAR(50) NOT NULL,
  coeficiente         FLOAT NOT NULL DEFAULT 1,
  valor_m2            FLOAT NOT NULL,
  mes_referencia       DATE NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cub_tabela_padrao ON cub_tabela (padrao_construtivo);
CREATE INDEX idx_cub_tabela_mes    ON cub_tabela (mes_referencia DESC);

-- Concede permissões para as roles usuais do PostgREST/Supabase
GRANT ALL ON cub_tabela TO authenticated, service_role, postgres;
