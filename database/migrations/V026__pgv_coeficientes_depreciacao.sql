-- V026: Coeficientes de depreciação por idade aparente/estado de
-- conservação para o módulo PGV (item 27 do edital), usados na
-- homogeneização de amostras.
SET search_path TO sigweb, public;

CREATE TABLE coeficientes_depreciacao (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  estado_conservacao  VARCHAR(50) NOT NULL,
  idade_aparente_min  INT NOT NULL,
  idade_aparente_max  INT NOT NULL,
  coeficiente         FLOAT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coef_deprec_estado ON coeficientes_depreciacao (estado_conservacao);

-- Concede permissões para as roles usuais do PostgREST/Supabase
GRANT ALL ON coeficientes_depreciacao TO authenticated, service_role, postgres;
