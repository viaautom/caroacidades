-- V001__extensions_and_schemas.sql
-- V001: Extensões e schema base
-- SIGWEB Tupanciretã — PostgreSQL 15 + PostGIS 3.x

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Schema principal
CREATE SCHEMA IF NOT EXISTS sigweb;
SET search_path TO sigweb, public;

-- Função utilitária: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION sigweb.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função utilitária: registra histórico cartográfico automaticamente
CREATE OR REPLACE FUNCTION sigweb.log_geometry_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT ST_Equals(COALESCE(OLD.geometry, 'GEOMETRYCOLLECTION EMPTY'), COALESCE(NEW.geometry, 'GEOMETRYCOLLECTION EMPTY')) THEN
    INSERT INTO sigweb.historico_cartografico
      (entidade, entidade_id, geometry_antes, geometry_depois, operacao)
    VALUES
      (TG_TABLE_NAME, OLD.id, OLD.geometry, NEW.geometry, 'update');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- V002__usuarios.sql
-- V002: Usuários e controle de acesso
SET search_path TO sigweb, public;

CREATE TABLE IF NOT EXISTS usuarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid        VARCHAR(128) UNIQUE NOT NULL,
  email           VARCHAR(255) NOT NULL,
  celular         VARCHAR(20),
  nome            VARCHAR(255),
  perfil          VARCHAR(32) NOT NULL DEFAULT 'CIDADAO'
                    CHECK (perfil IN ('ADMIN','FISCAL_TRIBUTARIO','SETOR_PROJETOS','FISCAL_CAMPO','CIDADAO')),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_auth_uid ON usuarios (auth_uid);
CREATE INDEX IF NOT EXISTS idx_usuarios_email        ON usuarios (email);

CREATE TRIGGER trg_usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();


-- V003__cadastro_imobiliario.sql
-- V003: Cadastro Imobiliário — entidades base
-- Referencial: SIRGAS 2000 UTM 22S (EPSG:31982)
SET search_path TO sigweb, public;

-- Pessoas (proprietários, requerentes)
CREATE TABLE IF NOT EXISTS pessoas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        VARCHAR(255) NOT NULL,
  cpf_cnpj    VARCHAR(18),
  email       VARCHAR(255),
  telefone    VARCHAR(20),
  endereco    TEXT,
  tipo        VARCHAR(10) NOT NULL DEFAULT 'fisica' CHECK (tipo IN ('fisica','juridica')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pessoas_cpf_cnpj ON pessoas (cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_pessoas_nome      ON pessoas USING GIN (nome gin_trgm_ops);

-- Bairros
CREATE TABLE IF NOT EXISTS bairros (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        VARCHAR(150) NOT NULL,
  codigo      VARCHAR(20) UNIQUE NOT NULL,
  geometry    GEOMETRY(MULTIPOLYGON, 31982),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bairros_geom ON bairros USING GIST (geometry);

-- Logradouros
CREATE TABLE IF NOT EXISTS logradouros (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        VARCHAR(200) NOT NULL,
  tipo        VARCHAR(50) NOT NULL DEFAULT 'Rua',
  codigo      VARCHAR(20) UNIQUE NOT NULL,
  cep         VARCHAR(10),
  bairro_id   UUID REFERENCES bairros(id),
  geometry    GEOMETRY(MULTILINESTRING, 31982),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logradouros_geom    ON logradouros USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_logradouros_nome    ON logradouros USING GIN (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_logradouros_bairro  ON logradouros (bairro_id);

-- Loteamentos
CREATE TABLE IF NOT EXISTS loteamentos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             VARCHAR(200) NOT NULL,
  decreto          VARCHAR(50),
  data_aprovacao   DATE,
  geometry         GEOMETRY(MULTIPOLYGON, 31982),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loteamentos_geom ON loteamentos USING GIST (geometry);

-- Quadras
CREATE TABLE IF NOT EXISTS quadras (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         VARCHAR(20) NOT NULL,
  loteamento_id  UUID REFERENCES loteamentos(id),
  geometry       GEOMETRY(POLYGON, 31982),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quadras_geom        ON quadras USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_quadras_loteamento  ON quadras (loteamento_id);

-- Parcelas (lotes)
CREATE TABLE IF NOT EXISTS parcelas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo              VARCHAR(30),
  area_m2             FLOAT,
  testada_principal   FLOAT,
  testada_secundaria  FLOAT,
  bairro_id           UUID REFERENCES bairros(id),
  logradouro_id       UUID REFERENCES logradouros(id),
  loteamento_id       UUID REFERENCES loteamentos(id),
  quadra_id           UUID REFERENCES quadras(id),
  camada_id           UUID,
  atributos           JSONB NOT NULL DEFAULT '{}',
  geometry            GEOMETRY(POLYGON, 31982),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parcelas_geom        ON parcelas USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_parcelas_bairro      ON parcelas (bairro_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_logradouro  ON parcelas (logradouro_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_quadra      ON parcelas (quadra_id);

CREATE TRIGGER trg_parcelas_updated_at
  BEFORE UPDATE ON parcelas
  FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

CREATE TRIGGER trg_parcelas_historico
  AFTER UPDATE ON parcelas
  FOR EACH ROW EXECUTE FUNCTION sigweb.log_geometry_change();

-- Edificações (unidades imobiliárias)
CREATE TABLE IF NOT EXISTS edificacoes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inscricao_imobiliaria VARCHAR(30) UNIQUE,
  cadastro_imobiliario  VARCHAR(30),
  area_construida       FLOAT,
  parcela_id            UUID REFERENCES parcelas(id) ON DELETE CASCADE,
  proprietario_id       UUID REFERENCES pessoas(id),
  face_quadra           VARCHAR(10),
  numero_predial        VARCHAR(10),
  situacao              VARCHAR(20) NOT NULL DEFAULT 'regular'
                          CHECK (situacao IN ('regular','irregular','em_construcao','demolida','terreno_vazio')),
  geometry              GEOMETRY(POLYGON, 31982),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edificacoes_geom     ON edificacoes USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_edificacoes_parcela  ON edificacoes (parcela_id);

CREATE TRIGGER trg_edificacoes_updated_at
  BEFORE UPDATE ON edificacoes
  FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

CREATE TRIGGER trg_edificacoes_historico
  AFTER UPDATE ON edificacoes
  FOR EACH ROW EXECUTE FUNCTION sigweb.log_geometry_change();

-- Histórico de alterações cartográficas
CREATE TABLE IF NOT EXISTS historico_cartografico (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade        VARCHAR(50) NOT NULL,
  entidade_id     UUID NOT NULL,
  geometry_antes  GEOMETRY,
  geometry_depois GEOMETRY,
  usuario_id      UUID REFERENCES usuarios(id),
  operacao        VARCHAR(30) NOT NULL
                    CHECK (operacao IN ('insert','update','delete','desmembramento','unificacao')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historico_entidade ON historico_cartografico (entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_historico_data     ON historico_cartografico (created_at DESC);

-- BICs (Boletins de Informação Cadastral) — coletados no app de recadastramento
CREATE TABLE IF NOT EXISTS bics (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcela_id               UUID NOT NULL REFERENCES parcelas(id),
  edificacao_id            UUID REFERENCES edificacoes(id),
  situacao_recadastramento VARCHAR(20) NOT NULL DEFAULT 'pendente'
                             CHECK (situacao_recadastramento IN ('pendente','visitado','recadastrado','impedido')),
  area_terreno             FLOAT,
  area_edificada           FLOAT,
  numero_pavimentos        SMALLINT,
  tipologia_construtiva    VARCHAR(100),
  estado_conservacao       VARCHAR(50),
  numero_predial           VARCHAR(10),
  observacoes              TEXT,
  foto_urls                TEXT[] NOT NULL DEFAULT '{}',
  latitude_coleta          DOUBLE PRECISION,
  longitude_coleta         DOUBLE PRECISION,
  coletado_por             UUID REFERENCES usuarios(id),
  coletado_em              TIMESTAMPTZ,
  sincronizado_em          TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bics_parcela ON bics (parcela_id);
CREATE INDEX IF NOT EXISTS idx_bics_situacao ON bics (situacao_recadastramento);

-- Patrimônio público imobiliário
CREATE TABLE IF NOT EXISTS patrimonios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         VARCHAR(200) NOT NULL,
  finalidade   VARCHAR(100),
  area_m2      FLOAT,
  doc_urls     TEXT[] DEFAULT '{}',
  geometry     GEOMETRY(GEOMETRY, 31982),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patrimonios_geom ON patrimonios USING GIST (geometry);

-- Triggers para tabelas auxiliares
CREATE TRIGGER trg_pessoas_updated_at BEFORE UPDATE ON pessoas FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();
CREATE TRIGGER trg_bairros_updated_at BEFORE UPDATE ON bairros FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();
CREATE TRIGGER trg_logradouros_updated_at BEFORE UPDATE ON logradouros FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();
CREATE TRIGGER trg_loteamentos_updated_at BEFORE UPDATE ON loteamentos FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();
CREATE TRIGGER trg_quadras_updated_at BEFORE UPDATE ON quadras FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();
CREATE TRIGGER trg_patrimonios_updated_at BEFORE UPDATE ON patrimonios FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();


-- V004__iluminacao_arborizacao.sql
-- V004: Iluminação Pública e Arborização Urbana
SET search_path TO sigweb, public;

-- Postes
CREATE TABLE IF NOT EXISTS postes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         VARCHAR(30) UNIQUE,
  logradouro_id  UUID REFERENCES logradouros(id),
  numero_predial VARCHAR(10),
  tipo           VARCHAR(50),
  potencia_w     FLOAT,
  situacao       VARCHAR(20) NOT NULL DEFAULT 'normal'
                   CHECK (situacao IN ('normal','defeito','em_manutencao')),
  geometry       GEOMETRY(POINT, 31982),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_postes_geom       ON postes USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_postes_logradouro ON postes (logradouro_id);
CREATE INDEX IF NOT EXISTS idx_postes_situacao   ON postes (situacao);

CREATE TRIGGER trg_postes_updated_at BEFORE UPDATE ON postes FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

-- Equipes de manutenção
CREATE TABLE IF NOT EXISTS equipes_manutencao (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       VARCHAR(100) NOT NULL,
  responsavel VARCHAR(100),
  telefone   VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tipos de defeito para iluminação
CREATE TABLE IF NOT EXISTS tipos_defeito (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      VARCHAR(100) NOT NULL,
  descricao TEXT
);

-- Ordens de Serviço — Iluminação Pública
CREATE TABLE IF NOT EXISTS ordens_servico_ip (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poste_id     UUID NOT NULL REFERENCES postes(id),
  tipo_defeito_id UUID REFERENCES tipos_defeito(id),
  equipe_id    UUID REFERENCES equipes_manutencao(id),
  situacao     VARCHAR(20) NOT NULL DEFAULT 'aberta'
                 CHECK (situacao IN ('aberta','em_andamento','concluida','cancelada')),
  observacoes  TEXT,
  aberta_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluida_em TIMESTAMPTZ,
  created_by   UUID REFERENCES usuarios(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_os_ip_poste   ON ordens_servico_ip (poste_id);
CREATE INDEX IF NOT EXISTS idx_os_ip_situacao ON ordens_servico_ip (situacao);

CREATE TRIGGER trg_os_ip_updated_at BEFORE UPDATE ON ordens_servico_ip FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

-- Estoque de materiais (iluminação)
CREATE TABLE IF NOT EXISTS locais_estoque (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       VARCHAR(100) NOT NULL,
  descricao  TEXT
);

CREATE TABLE IF NOT EXISTS produtos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       VARCHAR(200) NOT NULL,
  unidade    VARCHAR(20) NOT NULL DEFAULT 'un',
  descricao  TEXT
);

CREATE TABLE IF NOT EXISTS estoque (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id      UUID NOT NULL REFERENCES produtos(id),
  local_id        UUID NOT NULL REFERENCES locais_estoque(id),
  lote_serie      VARCHAR(50),
  quantidade      FLOAT NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  garantia_ate    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (produto_id, local_id, lote_serie)
);

CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estoque_id   UUID NOT NULL REFERENCES estoque(id),
  tipo         VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada','saida','transferencia')),
  quantidade   FLOAT NOT NULL,
  os_id        UUID REFERENCES ordens_servico_ip(id),
  destino_id   UUID REFERENCES locais_estoque(id),
  observacoes  TEXT,
  created_by   UUID REFERENCES usuarios(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Árvores
CREATE TABLE IF NOT EXISTS arvores (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                SERIAL UNIQUE,
  logradouro_id         UUID REFERENCES logradouros(id),
  especie               VARCHAR(150),
  nome_popular          VARCHAR(150),
  altura_m              FLOAT,
  dap_cm                FLOAT,
  estado_fitossanitario VARCHAR(50),
  situacao_calcada      VARCHAR(50),
  data_cadastro         DATE,
  geometry              GEOMETRY(POINT, 31982),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arvores_geom       ON arvores USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_arvores_logradouro ON arvores (logradouro_id);

CREATE TRIGGER trg_arvores_updated_at BEFORE UPDATE ON arvores FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

-- Ordens de Serviço — Arborização
CREATE TABLE IF NOT EXISTS ordens_servico_arb (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arvore_id    UUID NOT NULL REFERENCES arvores(id),
  tipo         VARCHAR(100) NOT NULL,
  equipe_id    UUID REFERENCES equipes_manutencao(id),
  situacao     VARCHAR(20) NOT NULL DEFAULT 'aberta'
                 CHECK (situacao IN ('aberta','em_andamento','concluida','cancelada')),
  observacoes  TEXT,
  foto_urls    TEXT[] DEFAULT '{}',
  concluida_em TIMESTAMPTZ,
  created_by   UUID REFERENCES usuarios(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_os_arb_arvore   ON ordens_servico_arb (arvore_id);
CREATE INDEX IF NOT EXISTS idx_os_arb_situacao ON ordens_servico_arb (situacao);

-- Sepulturas (cemitérios)
CREATE TABLE IF NOT EXISTS sepulturas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       VARCHAR(30) UNIQUE,
  titular      VARCHAR(255),
  falecido     VARCHAR(255),
  data_obito   DATE,
  data_entrada DATE,
  tipo         VARCHAR(50),
  quadra       VARCHAR(20),
  numero       VARCHAR(20),
  observacoes  TEXT,
  geometry     GEOMETRY(POINT, 31982),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sepulturas_geom ON sepulturas USING GIST (geometry);


-- V005__viabilidade_plano_diretor.sql
-- V005: Viabilidade Urbana e Plano Diretor
SET search_path TO sigweb, public;

-- Zonas de uso do solo (Plano Diretor)
CREATE TABLE IF NOT EXISTS zonas_uso (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                  VARCHAR(100) NOT NULL,
  sigla                 VARCHAR(20) NOT NULL,
  descricao             TEXT,
  to_percent            FLOAT,  -- Taxa de Ocupação
  ca_min                FLOAT,  -- Coeficiente de Aproveitamento mínimo
  ca_max                FLOAT,  -- Coeficiente de Aproveitamento máximo
  afastamento_frontal   FLOAT,
  afastamento_lateral   FLOAT,
  afastamento_posterior FLOAT,
  gabarito_max          FLOAT,
  uso_permitido         TEXT[],
  geometry              GEOMETRY(MULTIPOLYGON, 31982),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zonas_uso_geom ON zonas_uso USING GIST (geometry);

-- Tabela de CNAEs permitidos por zona
CREATE TABLE IF NOT EXISTS cnae_zona (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zona_id      UUID NOT NULL REFERENCES zonas_uso(id) ON DELETE CASCADE,
  cnae_codigo  VARCHAR(10) NOT NULL,
  cnae_descr   VARCHAR(255),
  permitido    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_cnae_zona_zona   ON cnae_zona (zona_id);
CREATE INDEX IF NOT EXISTS idx_cnae_zona_cnae   ON cnae_zona (cnae_codigo);

-- Consultas de viabilidade emitidas
CREATE TABLE IF NOT EXISTS consultas_viabilidade (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_verificacao  UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  parcela_id          UUID NOT NULL REFERENCES parcelas(id),
  tipo                VARCHAR(20) NOT NULL CHECK (tipo IN ('edificacao','parcelamento','cnae')),
  cnae_codigo         VARCHAR(10),
  cnae_descricao      VARCHAR(255),
  zona_uso            VARCHAR(100),
  parametros          JSONB,
  resultado           VARCHAR(20) NOT NULL CHECK (resultado IN ('viavel','inviavel','condicional')),
  observacoes         TEXT,
  pdf_url             TEXT,
  solicitante_nome    VARCHAR(255),
  solicitante_email   VARCHAR(255),
  created_by          UUID REFERENCES usuarios(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_viabilidade_parcela    ON consultas_viabilidade (parcela_id);
CREATE INDEX IF NOT EXISTS idx_viabilidade_codigo     ON consultas_viabilidade (codigo_verificacao);
CREATE INDEX IF NOT EXISTS idx_viabilidade_created_at ON consultas_viabilidade (created_at DESC);

-- Faces de quadra (para numeração predial e PGV)
CREATE TABLE IF NOT EXISTS faces_quadra (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quadra_id        UUID REFERENCES quadras(id),
  logradouro_id    UUID REFERENCES logradouros(id),
  numero_inicio    INT,
  numero_fim       INT,
  lado             VARCHAR(5) CHECK (lado IN ('par','impar')),
  valor_calculado  FLOAT,
  distancia_polo   FLOAT,
  setor_pgv_id     UUID,
  geometry         GEOMETRY(LINESTRING, 31982)
);

CREATE INDEX IF NOT EXISTS idx_faces_quadra_geom      ON faces_quadra USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_faces_quadra_quadra    ON faces_quadra (quadra_id);
CREATE INDEX IF NOT EXISTS idx_faces_quadra_logradouro ON faces_quadra (logradouro_id);


-- V006__pgv.sql
-- V006: Planta Genérica de Valores (PGV)
SET search_path TO sigweb, public;

-- Setores de cálculo PGV
CREATE TABLE IF NOT EXISTS setores_pgv (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      VARCHAR(100) NOT NULL,
  equacao   TEXT,
  r2        FLOAT,
  geometry  GEOMETRY(POLYGON, 31982),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_setores_pgv_geom ON setores_pgv USING GIST (geometry);

-- Atualizar FK em faces_quadra
ALTER TABLE faces_quadra
  ADD CONSTRAINT fk_faces_setor_pgv FOREIGN KEY (setor_pgv_id) REFERENCES setores_pgv(id);

-- Polos valorizantes
CREATE TABLE IF NOT EXISTS polos_pgv (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       VARCHAR(150) NOT NULL,
  tipo       VARCHAR(50),
  geometry   GEOMETRY(POINT, 31982),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_polos_pgv_geom ON polos_pgv USING GIST (geometry);

-- Amostras de mercado (pontos de coleta de preço)
CREATE TABLE IF NOT EXISTS amostras_pgv (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id            UUID REFERENCES setores_pgv(id),
  valor_amostra       FLOAT NOT NULL,
  idade_aparente      INT,
  estado_conservacao  VARCHAR(50),
  tipologia           VARCHAR(100),
  padrao_cub          VARCHAR(50),
  distancia_polo      FLOAT,
  espuria             BOOLEAN NOT NULL DEFAULT FALSE,
  geometry            GEOMETRY(POINT, 31982),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amostras_pgv_geom  ON amostras_pgv USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_amostras_pgv_setor ON amostras_pgv (setor_id);

-- Simulações de IPTU
CREATE TABLE IF NOT EXISTS simulacoes_iptu (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao             VARCHAR(200) NOT NULL,
  aliquota_residencial  FLOAT NOT NULL,
  aliquota_comercial    FLOAT NOT NULL,
  aliquota_industrial   FLOAT NOT NULL,
  aliquota_terreno      FLOAT NOT NULL,
  teto_aumento_percent  FLOAT NOT NULL DEFAULT 15,
  created_by            UUID REFERENCES usuarios(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- V007__processos_digitais.sql
-- V007: Processos Digitais (Aprovação de Projetos, Habite-se, REURB)
SET search_path TO sigweb, public;

-- Processos
CREATE TABLE IF NOT EXISTS processos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        VARCHAR(30) UNIQUE NOT NULL,
  tipo          VARCHAR(20) NOT NULL CHECK (tipo IN ('aprovacao_projeto','habite_se','reurb')),
  situacao      VARCHAR(20) NOT NULL DEFAULT 'rascunho'
                  CHECK (situacao IN ('rascunho','aberto','em_analise','aprovado','reprovado','cancelado')),
  requerente_id UUID REFERENCES pessoas(id),
  parcela_id    UUID REFERENCES parcelas(id),
  analista_id   UUID REFERENCES usuarios(id),
  setor_atual   VARCHAR(100),
  metadados     JSONB DEFAULT '{}',
  created_by    UUID REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processos_codigo    ON processos (codigo);
CREATE INDEX IF NOT EXISTS idx_processos_tipo      ON processos (tipo);
CREATE INDEX IF NOT EXISTS idx_processos_situacao  ON processos (situacao);
CREATE INDEX IF NOT EXISTS idx_processos_parcela   ON processos (parcela_id);
CREATE INDEX IF NOT EXISTS idx_processos_analista  ON processos (analista_id);

CREATE TRIGGER trg_processos_updated_at BEFORE UPDATE ON processos FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

-- Gerador de código sequencial por tipo de processo
CREATE SEQUENCE seq_aprovacao_projeto START 1;
CREATE SEQUENCE seq_habite_se         START 1;
CREATE SEQUENCE seq_reurb             START 1;

-- Etapas do processo
CREATE TABLE IF NOT EXISTS etapas_processo (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id  UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome         VARCHAR(100) NOT NULL,
  ordem        SMALLINT NOT NULL,
  situacao     VARCHAR(20) NOT NULL DEFAULT 'pendente'
                 CHECK (situacao IN ('pendente','aprovado','reprovado')),
  analista_id  UUID REFERENCES usuarios(id),
  parecer      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluida_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_etapas_processo ON etapas_processo (processo_id, ordem);

-- Anexos de processos (armazenados no Firebase Storage)
CREATE TABLE IF NOT EXISTS anexos_processo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id     UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome            VARCHAR(255) NOT NULL,
  tipo_mime       VARCHAR(100),
  tamanho_bytes   INT,
  storage_path    TEXT NOT NULL,
  url             TEXT,
  created_by      UUID REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anexos_processo ON anexos_processo (processo_id);

-- Fluxos BPMN (REURB — configuráveis por setor)
CREATE TABLE IF NOT EXISTS fluxos_bpmn (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        VARCHAR(150) NOT NULL,
  tipo        VARCHAR(30) NOT NULL DEFAULT 'reurb',
  definicao   TEXT NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- App de Chamados — categorias e solicitações
CREATE TABLE IF NOT EXISTS categorias_chamado (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      VARCHAR(100) NOT NULL,
  descricao TEXT,
  privada   BOOLEAN NOT NULL DEFAULT FALSE,
  ativa     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS solicitacoes_chamado (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id  UUID NOT NULL REFERENCES categorias_chamado(id),
  descricao     TEXT NOT NULL,
  situacao      VARCHAR(30) NOT NULL DEFAULT 'aberta',
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  endereco      TEXT,
  foto_urls     TEXT[] DEFAULT '{}',
  solicitante_id UUID REFERENCES usuarios(id),
  analista_id   UUID REFERENCES usuarios(id),
  mensagens     JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_categoria ON solicitacoes_chamado (categoria_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_situacao  ON solicitacoes_chamado (situacao);

CREATE TRIGGER trg_solicitacoes_updated_at BEFORE UPDATE ON solicitacoes_chamado FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();


-- V008__cadastro_social.sql
-- V008: Cadastro Social
-- CPF, NIS, PIS armazenados criptografados via pgcrypto
SET search_path TO sigweb, public;

CREATE TABLE IF NOT EXISTS familias (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                VARCHAR(20) UNIQUE NOT NULL,
  edificacao_id         UUID REFERENCES edificacoes(id),
  situacao_cadastral    VARCHAR(50) NOT NULL DEFAULT 'ativo',
  qtd_membros           SMALLINT NOT NULL DEFAULT 1,
  renda_bruta           FLOAT,
  renda_per_capita      FLOAT,
  indice_vulnerabilidade FLOAT,
  programas_sociais     TEXT[] DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_familias_edificacao ON familias (edificacao_id);
CREATE INDEX IF NOT EXISTS idx_familias_situacao   ON familias (situacao_cadastral);

CREATE TRIGGER trg_familias_updated_at BEFORE UPDATE ON familias FOR EACH ROW EXECUTE FUNCTION sigweb.set_updated_at();

-- Pessoas do cadastro social (com dados sensíveis criptografados)
-- CPF, NIS, PIS são armazenados como bytea criptografados com pgcrypto AES-256
CREATE TABLE IF NOT EXISTS pessoas_social (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id       UUID REFERENCES familias(id) ON DELETE CASCADE,
  nome             VARCHAR(255) NOT NULL,
  cpf_enc          BYTEA,   -- pgcrypto.encrypt(cpf, key, 'aes')
  nis_enc          BYTEA,
  pis_enc          BYTEA,
  data_nascimento  DATE,
  sexo             CHAR(1),
  escolaridade     VARCHAR(50),
  parentesco       VARCHAR(50),
  compoe_renda     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pessoas_social_familia ON pessoas_social (familia_id);

CREATE TABLE IF NOT EXISTS tipos_renda (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome  VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS rendas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id       UUID NOT NULL REFERENCES pessoas_social(id) ON DELETE CASCADE,
  tipo_renda_id   UUID REFERENCES tipos_renda(id),
  valor           FLOAT NOT NULL,
  compoe_renda    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS informacoes_sociais (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES familias(id) ON DELETE CASCADE,
  tipo       VARCHAR(100) NOT NULL,
  descricao  TEXT,
  score      SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- V009__seeds_dados_base.sql
-- V009: Dados base (seeds) para operação inicial
SET search_path TO sigweb, public;

-- Tipos de defeito para iluminação
INSERT INTO tipos_defeito (nome, descricao) VALUES
  ('Lâmpada apagada', 'Ponto de iluminação sem funcionar'),
  ('Lâmpada piscando', 'Lâmpada com oscilação'),
  ('Poste danificado', 'Estrutura física do poste danificada'),
  ('Fiação exposta', 'Fio elétrico exposto com risco'),
  ('Luminária quebrada', 'Carcaça da luminária danificada'),
  ('Chave automática com defeito', NULL);

-- Equipe padrão
INSERT INTO equipes_manutencao (nome, responsavel) VALUES
  ('Equipe Elétrica Municipal', 'Responsável Técnico');

-- Local de estoque padrão
INSERT INTO locais_estoque (nome) VALUES
  ('Almoxarifado Central'),
  ('Depósito Zona Norte'),
  ('Depósito Zona Sul');

-- Tipos de renda (Cadastro Social)
INSERT INTO tipos_renda (nome) VALUES
  ('Salário'),
  ('Aposentadoria'),
  ('Pensão'),
  ('Benefício Social (BPC)'),
  ('Bolsa Família'),
  ('Autônomo / Informal'),
  ('Aluguel'),
  ('Outros');

-- Categorias de chamado
INSERT INTO categorias_chamado (nome, privada) VALUES
  ('Iluminação Pública', FALSE),
  ('Pavimentação', FALSE),
  ('Limpeza Urbana', FALSE),
  ('Arborização', FALSE),
  ('Sinalização', FALSE),
  ('Fiscalização', TRUE),
  ('Outros', FALSE);

-- Zonas de uso do solo (Tupanciretã — valores exemplares para configuração)
-- Os valores reais devem ser importados do Plano Diretor municipal
INSERT INTO zonas_uso (nome, sigla, to_percent, ca_min, ca_max, afastamento_frontal, gabarito_max) VALUES
  ('Zona Residencial 1', 'ZR1', 60, 0.5, 1.2, 4.0, 7.5),
  ('Zona Residencial 2', 'ZR2', 70, 0.5, 2.0, 3.0, 12.0),
  ('Zona Comercial Central', 'ZCC', 100, 1.0, 4.0, 0.0, 20.0),
  ('Zona Industrial', 'ZI', 60, 0.5, 2.0, 10.0, NULL),
  ('Zona de Expansão Urbana', 'ZEU', 50, 0.2, 1.0, 5.0, 7.5),
  ('Área de Preservação Permanente', 'APP', 0, 0, 0, NULL, NULL);

-- Informações sociais padrão (score de vulnerabilidade)
-- Score: quanto maior, mais vulnerável
INSERT INTO informacoes_sociais (familia_id, tipo, score) SELECT NULL, tipo, score FROM (VALUES
  ('Família em situação de rua', 10),
  ('Criança em situação de vulnerabilidade', 8),
  ('Idoso acima de 80 anos', 5),
  ('Deficiente físico', 5),
  ('Doença crônica grave', 6),
  ('Desemprego', 4)
) AS t(tipo, score) WHERE FALSE; -- Template, não insere dados reais


-- V010__numeracao_predial.sql
-- V010: Numeração Predial
SET search_path TO sigweb, public;

-- numero_predial_principal referenciado em spatial.service mas ausente do schema
ALTER TABLE parcelas
  ADD COLUMN IF NOT EXISTS numero_predial_principal VARCHAR(20);

-- Operações de numeração realizadas por logradouro
CREATE TABLE IF NOT EXISTS numeracao_predial (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logradouro_id       UUID NOT NULL REFERENCES logradouros(id),
  numero_inicio_par   INT NOT NULL DEFAULT 2,
  numero_inicio_impar INT NOT NULL DEFAULT 1,
  sentido             VARCHAR(20) NOT NULL DEFAULT 'crescente'
                        CHECK (sentido IN ('crescente','decrescente')),
  usuario_id          UUID REFERENCES usuarios(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_numeracao_predial_logradouro ON numeracao_predial (logradouro_id);

-- Divergências detectadas entre número atual e gerado
CREATE TABLE IF NOT EXISTS divergencias_numeracao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edificacao_id   UUID NOT NULL REFERENCES edificacoes(id) ON DELETE CASCADE,
  logradouro_id   UUID REFERENCES logradouros(id),
  numero_atual    VARCHAR(20),
  numero_gerado   VARCHAR(20),
  resolvida       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_divergencias_edificacao  ON divergencias_numeracao (edificacao_id);
CREATE INDEX IF NOT EXISTS idx_divergencias_resolvida   ON divergencias_numeracao (resolvida);


-- V011__reurb_bpmn.sql
-- V011: REURB Digital — fluxos BPMN configuráveis
SET search_path TO sigweb, public;

-- Definições de fluxo BPMN por setor/departamento
CREATE TABLE IF NOT EXISTS fluxos_bpmn (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        VARCHAR(150) NOT NULL,
  setor       VARCHAR(100),
  descricao   TEXT,
  bpmn_xml    TEXT,        -- XML completo exportado pelo bpmn-js
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fases dentro de cada fluxo
CREATE TABLE IF NOT EXISTS fases_bpmn (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id        UUID NOT NULL REFERENCES fluxos_bpmn(id) ON DELETE CASCADE,
  nome            VARCHAR(150) NOT NULL,
  ordem           INT NOT NULL,
  -- perfis RBAC que podem atuar nesta fase
  perfis          TEXT[] NOT NULL DEFAULT '{}',
  -- definição dos campos do formulário (array de objetos JSON)
  -- tipo_campo: 'texto' | 'checkbox' | 'mapa' | 'cpf_telefone'
  formulario      JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fases_bpmn_fluxo ON fases_bpmn (fluxo_id, ordem);

-- Associa fluxo BPMN e fase atual ao processo genérico (tabela processos de V007)
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS fluxo_bpmn_id  UUID REFERENCES fluxos_bpmn(id),
  ADD COLUMN IF NOT EXISTS fase_atual_id  UUID REFERENCES fases_bpmn(id);

-- Histórico de movimentações de fases
CREATE TABLE IF NOT EXISTS historico_fases_processo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id     UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  fase_id         UUID REFERENCES fases_bpmn(id),
  usuario_id      UUID REFERENCES usuarios(id),
  acao            VARCHAR(30) NOT NULL
                    CHECK (acao IN ('encaminhar','aprovar','reprovar','devolver','arquivar')),
  comentario      TEXT,
  dados_formulario JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historico_fases_processo ON historico_fases_processo (processo_id, created_at DESC);


-- V012__patrimonio_cemiterio.sql
-- V012: Patrimônio Público Imobiliário e Cemitérios
SET search_path TO sigweb, public;

-- Bens públicos com geometria variável (ponto, polígono, linha)
CREATE TABLE IF NOT EXISTS patrimonios (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             VARCHAR(250) NOT NULL,
  finalidade       VARCHAR(100) NOT NULL,  -- escola, hospital, praca, predio_publico, etc.
  descricao        TEXT,
  numero_registro  VARCHAR(60),
  area_m2          FLOAT,
  geometry         GEOMETRY(GEOMETRY, 31982),
  documento_urls   TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patrimonios_geom       ON patrimonios USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_patrimonios_finalidade ON patrimonios (finalidade);

CREATE OR REPLACE TRIGGER trg_patrimonios_updated_at
  BEFORE UPDATE ON patrimonios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Cemitérios (perímetros)
CREATE TABLE IF NOT EXISTS cemiterios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        VARCHAR(150) NOT NULL,
  geometry    GEOMETRY(POLYGON, 31982),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cemiterios_geom ON cemiterios USING GIST (geometry);

-- Sepulturas georreferenciadas
DROP TABLE IF EXISTS sepulturas CASCADE;
CREATE TABLE IF NOT EXISTS sepulturas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cemiterio_id        UUID REFERENCES cemiterios(id),
  codigo              VARCHAR(30) UNIQUE NOT NULL,
  geometry            GEOMETRY(POINT, 31982) NOT NULL,
  titular             VARCHAR(250),
  falecido            VARCHAR(250),
  data_falecimento    DATE,
  data_sepultamento   DATE,
  tipo_sepultura      VARCHAR(50),  -- gaveta, carneiro, jazigo, ossario
  situacao            VARCHAR(20) NOT NULL DEFAULT 'ocupada'
                        CHECK (situacao IN ('ocupada','disponivel','perpetua','transferida')),
  observacoes         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sepulturas_geom      ON sepulturas USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_sepulturas_cemiterio ON sepulturas (cemiterio_id);
CREATE INDEX IF NOT EXISTS idx_sepulturas_situacao  ON sepulturas (situacao);

CREATE OR REPLACE TRIGGER trg_sepulturas_updated_at
  BEFORE UPDATE ON sepulturas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- V013__sinter.sql
-- V013: SINTER — controle de envios à Receita Federal
-- Prazo impretérivel: validação no ambiente oficial RFB até 31/12/2026
SET search_path TO sigweb, public;

-- Lotes de envio ao SINTER
CREATE TABLE IF NOT EXISTS envios_sinter (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_envio    INT GENERATED ALWAYS AS IDENTITY,
  tipo            VARCHAR(20) NOT NULL DEFAULT 'incremental'
                    CHECK (tipo IN ('teste','incremental','completo')),
  status          VARCHAR(30) NOT NULL DEFAULT 'preparando'
                    CHECK (status IN ('preparando','validando','enviado','aceito','rejeitado','erro')),
  qtd_parcelas    INT NOT NULL DEFAULT 0,
  arquivo_gcs     TEXT,       -- path no Cloud Storage
  erros           JSONB NOT NULL DEFAULT '[]',
  resposta_rfb    TEXT,       -- retorno literal do SINTER
  enviado_em      TIMESTAMPTZ,
  validado_em     TIMESTAMPTZ,
  criado_por      UUID REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_envios_sinter_status ON envios_sinter (status);

-- Status individual por parcela no SINTER
CREATE TABLE IF NOT EXISTS parcelas_sinter (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcela_id  UUID NOT NULL REFERENCES parcelas(id) ON DELETE CASCADE,
  envio_id    UUID REFERENCES envios_sinter(id),
  status      VARCHAR(30) NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','incluida','aceita','rejeitada','erro')),
  codigo_nitu VARCHAR(60),   -- NITU atribuído pela RFB após validação
  erros       TEXT[] NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma parcela tem apenas um registro de status atual
CREATE UNIQUE INDEX IF NOT EXISTS idx_parcelas_sinter_parcela ON parcelas_sinter (parcela_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_sinter_status         ON parcelas_sinter (status);
CREATE INDEX IF NOT EXISTS idx_parcelas_sinter_envio          ON parcelas_sinter (envio_id);


-- V014__auditoria.sql
-- V014: Triggers de auditoria em tabelas críticas (retenção 90 dias)
SET search_path TO sigweb, public;

-- Tabela de auditoria centralizada
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela       VARCHAR(100) NOT NULL,
  operacao     VARCHAR(10)  NOT NULL CHECK (operacao IN ('INSERT','UPDATE','DELETE')),
  registro_id  UUID,
  dados_antes  JSONB,
  dados_depois JSONB,
  usuario_id   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tabela  ON audit_log (tabela, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_usuario ON audit_log (usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_data    ON audit_log (created_at DESC);

-- Função genérica de auditoria
CREATE OR REPLACE FUNCTION fn_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO sigweb.audit_log (tabela, operacao, registro_id, dados_antes)
    VALUES (TG_TABLE_NAME, TG_OP, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO sigweb.audit_log (tabela, operacao, registro_id, dados_antes, dados_depois)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE -- INSERT
    INSERT INTO sigweb.audit_log (tabela, operacao, registro_id, dados_depois)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplica auditoria às tabelas críticas
CREATE OR REPLACE TRIGGER trg_audit_parcelas
  AFTER INSERT OR UPDATE OR DELETE ON parcelas
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_edificacoes
  AFTER INSERT OR UPDATE OR DELETE ON edificacoes
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_pessoas
  AFTER INSERT OR UPDATE OR DELETE ON pessoas
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_usuarios
  AFTER INSERT OR UPDATE OR DELETE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_processos
  AFTER INSERT OR UPDATE OR DELETE ON processos
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_consultas_viabilidade
  AFTER INSERT OR UPDATE OR DELETE ON consultas_viabilidade
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_envios_sinter
  AFTER INSERT OR UPDATE OR DELETE ON envios_sinter
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

-- Limpeza automática de registros com mais de 90 dias
CREATE OR REPLACE FUNCTION cleanup_audit_log() RETURNS INT AS $$
DECLARE
  removidos INT;
BEGIN
  DELETE FROM sigweb.audit_log WHERE created_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS removidos = ROW_COUNT;
  RETURN removidos;
END;
$$ LANGUAGE plpgsql;


-- V015__view_recadastramento.sql
-- View para camada de situação de recadastramento no mapa (req 07)
-- pg_tileserv auto-descobre views e as serve como MVT
-- Situações: pendente (cinza) | visitado (amarelo) | recadastrado (verde) | impedido (vermelho)

CREATE OR REPLACE VIEW sigweb.v_parcelas_recadastramento AS
SELECT
  p.id,
  p.codigo,
  p.geometry,
  COALESCE(b.situacao_recadastramento, 'pendente') AS situacao
FROM sigweb.parcelas p
LEFT JOIN LATERAL (
  SELECT situacao_recadastramento
  FROM sigweb.bics
  WHERE parcela_id = p.id
  ORDER BY created_at DESC
  LIMIT 1
) b ON true;

-- Necessário para pg_tileserv descobrir a view como camada publicável
COMMENT ON VIEW sigweb.v_parcelas_recadastramento IS 'Situação de recadastramento por parcela — camada para o mapa do SIGWEB';


-- V016__estoque_campos.sql
-- Campos adicionais para módulo de estoque completo (req 49)
ALTER TABLE sigweb.produtos
  ADD COLUMN IF NOT EXISTS marca       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS fabricante  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS familia     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS fornecedor  VARCHAR(200);

ALTER TABLE sigweb.locais_estoque
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(50) NOT NULL DEFAULT 'principal';


-- V017__arvores_boletim_campos.sql
-- V017: Campos do Boletim Cadastral de Arborização (req 72)
SET search_path TO sigweb, public;

ALTER TABLE arvores
  ADD COLUMN IF NOT EXISTS conflito_rede  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS observacoes    TEXT,
  ADD COLUMN IF NOT EXISTS numero_predial VARCHAR(10),
  ADD COLUMN IF NOT EXISTS data_plantio   DATE;


-- V018__pgv_demo_data.sql
-- V018: Dados de demonstração para módulo PGV (req 219)
-- Gera um setor de cálculo com faces de quadra georreferenciadas e valores calculados
-- para demonstração na PoC. Centro aproximado de Tupanciretã: (209200, 6784500) EPSG:31982.
-- Substituir por cálculo real após importação do cadastro imobiliário.
SET search_path TO sigweb, public;

-- Setor de cálculo PGV — área central do município
WITH setor AS (
  INSERT INTO setores_pgv (nome, equacao, r2, geometry)
  VALUES (
    'Centro Tupanciretã (PoC)',
    'V = 1200 - 1.8 × d',
    0.89,
    ST_GeomFromText(
      'POLYGON((208800 6784000, 209700 6784000, 209700 6785100, 208800 6785100, 208800 6784000))',
      31982
    )
  )
  RETURNING id
),

-- Polo valorizante — Praça Central
polo AS (
  INSERT INTO polos_pgv (nome, tipo, geometry)
  VALUES (
    'Praça Pinheiro Machado', 'comercial',
    ST_GeomFromText('POINT(209200 6784500)', 31982)
  )
)

-- Faces de quadra com valor calculado (R$/m²)
-- Grade 4×3 de quadras em torno do centro, valor decrescente com distância ao polo
INSERT INTO faces_quadra (setor_pgv_id, valor_calculado, distancia_polo, geometry)
SELECT s.id, v.valor, v.dist,
       ST_GeomFromText(v.geom, 31982)
FROM setor s
CROSS JOIN (VALUES
  -- Eixo central (Av. principal N-S)
  (1180.00,  55.0, 'LINESTRING(209200 6784250, 209200 6784450)'),
  (1200.00,  10.0, 'LINESTRING(209200 6784450, 209200 6784550)'),
  (1150.00,  90.0, 'LINESTRING(209200 6784550, 209200 6784750)'),

  -- Rua paralela (100m a leste)
  ( 980.00, 155.0, 'LINESTRING(209300 6784250, 209300 6784450)'),
  ( 960.00, 105.0, 'LINESTRING(209300 6784450, 209300 6784550)'),
  ( 940.00, 160.0, 'LINESTRING(209300 6784550, 209300 6784750)'),

  -- Rua paralela (100m a oeste)
  ( 980.00, 155.0, 'LINESTRING(209100 6784250, 209100 6784450)'),
  ( 960.00, 105.0, 'LINESTRING(209100 6784450, 209100 6784550)'),
  ( 940.00, 160.0, 'LINESTRING(209100 6784550, 209100 6784750)'),

  -- Rua paralela (200m a leste)
  ( 820.00, 220.0, 'LINESTRING(209400 6784250, 209400 6784450)'),
  ( 800.00, 205.0, 'LINESTRING(209400 6784450, 209400 6784550)'),
  ( 780.00, 225.0, 'LINESTRING(209400 6784550, 209400 6784750)'),

  -- Rua paralela (200m a oeste)
  ( 820.00, 220.0, 'LINESTRING(209000 6784250, 209000 6784450)'),
  ( 800.00, 205.0, 'LINESTRING(209000 6784450, 209000 6784550)'),
  ( 780.00, 225.0, 'LINESTRING(209000 6784550, 209000 6784750)'),

  -- Transversais (E-W)
  (1050.00,  80.0, 'LINESTRING(209100 6784500, 209200 6784500)'),
  (1050.00,  80.0, 'LINESTRING(209200 6784500, 209300 6784500)'),
  ( 870.00, 185.0, 'LINESTRING(209000 6784500, 209100 6784500)'),
  ( 870.00, 185.0, 'LINESTRING(209300 6784500, 209400 6784500)'),
  ( 920.00, 155.0, 'LINESTRING(209100 6784300, 209200 6784300)'),
  ( 920.00, 155.0, 'LINESTRING(209200 6784300, 209300 6784300)'),
  ( 850.00, 210.0, 'LINESTRING(209000 6784300, 209100 6784300)'),
  ( 850.00, 210.0, 'LINESTRING(209300 6784300, 209400 6784300)'),
  ( 910.00, 160.0, 'LINESTRING(209100 6784700, 209200 6784700)'),
  ( 910.00, 160.0, 'LINESTRING(209200 6784700, 209300 6784700)'),
  ( 840.00, 215.0, 'LINESTRING(209000 6784700, 209100 6784700)'),
  ( 840.00, 215.0, 'LINESTRING(209300 6784700, 209400 6784700)'),

  -- Periferia (300m do centro)
  ( 660.00, 320.0, 'LINESTRING(208900 6784200, 208900 6784500)'),
  ( 640.00, 350.0, 'LINESTRING(208900 6784500, 208900 6784800)'),
  ( 650.00, 315.0, 'LINESTRING(209500 6784200, 209500 6784500)'),
  ( 630.00, 345.0, 'LINESTRING(209500 6784500, 209500 6784800)')
) AS v(valor, dist, geom);


-- V019__supabase_auth.sql
-- V019: Migração de Firebase Auth/Storage para Supabase Auth/Storage
SET search_path TO sigweb, public;

-- auth_uid passa a guardar o auth.users.id (UUID) emitido pelo GoTrue
-- do Supabase — coluna mantida (já era uma indireção, não o identificador
-- exposto), apenas troca o que ela referencia.

-- Renomeia colunas cujo nome remetia diretamente a Firebase/GCP
ALTER TABLE usuarios       ADD COLUMN IF NOT EXISTS expo_push_token VARCHAR(255);
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
  WHERE auth_uid = (event->>'user_id');

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


-- V020__rename_firebase_uid.sql
-- V020: Limpeza residual do Firebase e renomeação para auth_uid
SET search_path TO sigweb, public;

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



-- =======================================================================================
-- MIGRATION: V020 - Configuracoes Globais
-- =======================================================================================
CREATE TABLE IF NOT EXISTS configuracoes (
  chave VARCHAR(255) PRIMARY KEY,
  valor JSONB NOT NULL,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insere o padrão (Tupanciretã) caso não exista
INSERT INTO configuracoes (chave, valor)
VALUES ('MAPA_INITIAL_VIEW', '{"center": [-29.0803, -53.8389], "zoom": 15}')
ON CONFLICT (chave) DO NOTHING;
